import { ApiError, GoogleGenAI } from "@google/genai";
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
import { consumeDailyQuota, quotaRefusal, releaseDailyQuota, type QuotaKind } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { demoScenario } from "@/lib/fixtures/demo-scenario";
import { StagePersonaSchema, StageQuestionSchema } from "@/lib/gemini/schemas";
import { reportEvent } from "@/lib/monitoring/events";

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
    drill: z.boolean().optional(),
    questionIndex: z.number().int().min(0).optional(),
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

// The Phase 0 connectivity check (`full` with no stageId): a bare Live
// session with a generic prompt. It used to be reachable by anyone, with no
// sign-in, no bot check and no limit — an open faucet on the Gemini key once
// the site is public. Now it needs a signed-in user, counts against their
// daily interviews, and is off in production unless explicitly enabled.
function smokeTestEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_VOICE_SMOKE_TEST === "1";
}

export async function POST(request: Request) {
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

  const { mode, stageId, drill, questionIndex, turnstileToken, language: requestedLanguage } = parsed.data;

  // Every 'full' token needs a signed-in user, checked before anything else
  // so even a misconfigured server answers anonymous callers with a 401.
  const supabase = mode === "full" ? await createClient() : null;
  let userId: string | undefined;
  if (supabase) {
    const { data: claimsData } = await supabase.auth.getClaims();
    userId = claimsData?.claims.sub;
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!stageId && !smokeTestEnabled()) {
      return NextResponse.json({ error: "smoke_test_disabled" }, { status: 403 });
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_LIVE_MODEL;
  if (!apiKey || !model) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  // specs §5.3 — enforced in this exact order, demo mode only. 'full' mode is
  // guarded by the sign-in check above and the daily limit below.
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
        reportEvent("guardrail.ip_rate_limited");
        return NextResponse.json({ reason: "rate_limited" }, { status: 429 });
      }

      const turnstileOk = await verifyTurnstileToken(turnstileToken as string, ip);
      if (!turnstileOk) {
        reportEvent("guardrail.turnstile_failed");
        return NextResponse.json({ reason: "turnstile_failed" }, { status: 403 });
      }
    } catch (error) {
      console.error("[api/live/token] guardrail check failed", error);
      return NextResponse.json({ reason: "guardrail_error" }, { status: 503 });
    }
  }

  // specs §7 — 'full' mode with a stageId: a real authenticated session,
  // gated on ownership (RLS on `stages`/`progress`) and the stage being
  // unlocked (specs §8.3 acceptance criteria). Without a stageId it's the
  // smoke test above — no CV data, no stage-specific prompt.
  let stageContext: StageContext | undefined;
  let stageLanguage: InterviewLanguage | undefined;
  if (supabase && userId && stageId) {
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

    const qBank = z.array(StageQuestionSchema).parse(stage.question_bank);
    const targetQ =
      drill && questionIndex !== undefined && qBank[questionIndex]
        ? qBank[questionIndex]
        : drill && qBank[0]
          ? qBank[0]
          : null;

    stageContext = {
      title: stage.title,
      focusAreas: stage.focus_areas,
      persona: StagePersonaSchema.parse(stage.persona),
      questionBank: qBank,
      drill: targetQ
        ? {
            targetQuestion: targetQ.text,
            targets: targetQ.targets,
            followUps: targetQ.follow_ups,
          }
        : undefined,
    };
    stageLanguage = stage.roadmaps?.language;
  }

  // Defaults to 'fr' — matches profiles.locale and sessions.language
  // defaults — when nothing more specific is available.
  const language = stageLanguage ?? requestedLanguage ?? "fr";

  // Per-user daily limit, taken last so a refused stage or a bad request
  // doesn't spend it. Given back below if the mint itself fails.
  let quotaKind: QuotaKind | null = null;
  if (supabase && userId) {
    quotaKind = stageContext?.drill ? "drill_token" : "interview_token";
    const quota = await consumeDailyQuota(supabase, quotaKind);
    if (!quota.allowed) return quotaRefusal(quota);
  }

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
    reportEvent("token.mint_failed", { mode, status: error instanceof ApiError ? error.status : "error" });
    if (userId && quotaKind) await releaseDailyQuota(userId, quotaKind);
    return NextResponse.json({ error: "token_mint_failed" }, { status: 502 });
  }
}
