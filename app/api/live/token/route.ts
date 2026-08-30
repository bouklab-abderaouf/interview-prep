import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { buildLiveConnectConfig } from "@/lib/live/config";
import type { TokenResponseBody } from "@/lib/live/types";

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

const TokenRequestSchema = z.object({
  mode: z.enum(["demo", "full"]),
  stageId: z.string().optional(),
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

  const { mode } = parsed.data;

  // Defaults to 'fr' — matches profiles.locale and sessions.language
  // defaults. No language field on the request yet; Phase 1's demo adds one.
  const language = "fr" as const;

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
          config: buildLiveConnectConfig({ mode, language }),
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
