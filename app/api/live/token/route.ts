import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { buildLiveConnectConfig } from "@/lib/live/config";
import type { InterviewLanguage, TokenResponseBody } from "@/lib/live/types";
import type { StageContext } from "@/lib/prompts/interviewer";
import { checkKillSwitch } from "@/lib/guardrails/kill-switch";
import {
  checkGlobalDailyCap,
  checkPerIpCap,
  getClientIp,
  hashIp,
  incrementDemoSessionCount,
} from "@/lib/guardrails/rate-limit";
import { verifyTurnstileToken } from "@/lib/guardrails/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { demoScenario } from "@/lib/fixtures/demo-scenario";
import { StagePersonaSchema, StageQuestionSchema } from "@/lib/gemini/schemas";

// specs §4.1: shortest workable TTL for connection, session lock shortly
// after first use so a leaked token is useless within a minute.
//
// These two AuthToken fields are easy to swap by accident:
// - newSessionExpireTime: deadline to OPEN the connection. Short — limits how
//   long a leaked token is exploitable before it's connected at all.
// - expireTime: deadline after which an ALREADY-OPEN session's messages get
//   rejected (the server may preemptively close it). This caps total
//   conversation length, not just the connect window — too short here kills
//   an in-progress conversation with "auth token has expired".
const TOKEN_CONNECT_WINDOW_MS = 2 * 60 * 1000;
const TOKEN_SESSION_LENGTH_MS = 10 * 60 * 1000; // matches FULL_SESSION_MAX_SECONDS (specs §2)

const TokenRequestSchema = z
  .object({
    mode: z.enum(["demo", "full"]),
    stageId: z.string().optional(),
    // Not in specs §4.1's original request shape, but §5.2 requires the
    // widget solved before minting anything — has to travel somehow.
    turnstileToken: z.string().optional(),
    // Also not in §4.1's original shape. §5.2's demo needs a working FR/EN
    // toggle; Phase 2 will instead derive this from the stage/roadmap once
    // stageId resolves to real data.
    language: z.enum(["fr", "en"]).optional(),
  })
  .refine((data) => data.mode !== "demo" || !!data.turnstileToken, {
    message: "turnstileToken is required for demo mode",
    path: ["turnstileToken"],
  });

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_LIVE_MODEL;

  if (!apiKey || !model) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = TokenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { mode, stageId, turnstileToken, language: requestedLanguage } = parsed.data;

  // specs §5.3 — enforced in this exact order, demo mode only. 'full' mode's
  // guard is an auth check, which doesn't exist until Phase 2.
  let ipHash: string | null = null;
  if (mode === "demo") {
    try {
      const killSwitch = await checkKillSwitch();
      if (killSwitch.killed) {
        return NextResponse.json({ reason: "demo_paused" }, { status: 503 });
      }

      const dailyCap = await checkGlobalDailyCap();
      if (dailyCap.exceeded) {
        return NextResponse.json({ reason: "daily_cap" }, { status: 503 });
      }

      const ip = getClientIp(request);
      ipHash = hashIp(ip);
      const perIpCap = await checkPerIpCap(ipHash);
      if (perIpCap.exceeded) {
        return NextResponse.json({ reason: "rate_limited" }, { status: 429 });
      }

      const turnstileOk = await verifyTurnstileToken(turnstileToken as string, ip);
      if (!turnstileOk) {
        return NextResponse.json({ reason: "turnstile_failed" }, { status: 403 });
      }
    } catch (error) {
      console.error("[api/live/token] guardrail check failed", error);
      return NextResponse.json({ reason: "guardrail_error" }, { status: 503 });
    }
  }

  // specs §7 — 'full' mode with a stageId: a real authenticated session,
  // gated on ownership (RLS on `stages`/`progress`) and the stage being
  // unlocked (specs §8.3 acceptance criteria). Without a stageId, 'full'
  // stays the ungated connectivity smoke test from Phase 0 — no CV data, no
  // stage-specific prompt, low enough risk to leave as a quick manual check.
  let stageContext: StageContext | undefined;
  let stageLanguage: InterviewLanguage | undefined;
  if (mode === "full" && stageId) {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims.sub;
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: stage, error: stageError } = await supabase
      .from("stages")
      .select("title, focus_areas, persona, question_bank, roadmaps(language)")
      .eq("id", stageId)
      .maybeSingle<{
        title: string;
        focus_areas: string[];
        persona: unknown;
        question_bank: unknown;
        roadmaps: { language: InterviewLanguage } | null;
      }>();
    if (stageError || !stage) {
      return NextResponse.json({ error: "stage_not_found" }, { status: 404 });
    }

    const { data: progress } = await supabase
      .from("progress")
      .select("unlocked")
      .eq("user_id", userId)
      .eq("stage_id", stageId)
      .maybeSingle();
    if (!progress?.unlocked) {
      return NextResponse.json({ error: "stage_locked" }, { status: 403 });
    }

    stageContext = {
      title: stage.title,
      focusAreas: stage.focus_areas,
      persona: StagePersonaSchema.parse(stage.persona),
      questionBank: z.array(StageQuestionSchema).parse(stage.question_bank),
    };
    stageLanguage = stage.roadmaps?.language;
  }

  // Defaults to 'fr' — matches profiles.locale and sessions.language
  // defaults — when nothing more specific is available.
  const language = stageLanguage ?? requestedLanguage ?? "fr";

  // specs §5.3 step 5 — increment counters and insert the sessions row
  // before minting. Demo sessions get user_id = null; no anon RLS policy
  // reaches them, so this write goes through the service-role client.
  if (mode === "demo") {
    try {
      await incrementDemoSessionCount();
      const supabase = createAdminClient();
      const { error } = await supabase
        .from("sessions")
        .insert({ mode: "demo", language, ip_hash: ipHash });
      if (error) throw error;
    } catch (error) {
      console.error("[api/live/token] failed to record demo session", error);
      return NextResponse.json({ reason: "guardrail_error" }, { status: 503 });
    }
  }

  const client = new GoogleGenAI({ apiKey });
  const now = Date.now();
  const expireTime = new Date(now + TOKEN_SESSION_LENGTH_MS).toISOString();
  const newSessionExpireTime = new Date(now + TOKEN_CONNECT_WINDOW_MS).toISOString();

  try {
    const authToken = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: buildLiveConnectConfig({
            mode,
            language,
            scenario: mode === "demo" ? demoScenario : undefined,
            stageContext,
          }),
        },
        // Empty array: locks every field set in liveConnectConstraints.config
        // (systemInstruction included) so a client cannot swap the
        // interviewer prompt from devtools. See specs §4.1.
        lockAdditionalFields: [],
        httpOptions: { apiVersion: "v1alpha" },
      },
    });

    if (!authToken.name) {
      throw new Error("auth token response missing name");
    }

    const responseBody: TokenResponseBody = {
      token: authToken.name,
      model,
      expiresAt: authToken.expireTime ?? expireTime,
    };

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("[api/live/token] failed to mint ephemeral token", error);
    return NextResponse.json({ error: "token_mint_failed" }, { status: 502 });
  }
}
