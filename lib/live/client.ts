"use client";

import {
  GoogleGenAI,
  VadSignalType,
  type LiveServerMessage,
  type Session,
} from "@google/genai";

import type { TokenResponseBody } from "@/lib/live/types";

// Phase 0 §4 — browser-side Live session wrapper. The interviewer prompt,
// model, and every other LiveConnectConfig field are already locked into the
// ephemeral token by /api/live/token (specs §4.1), so `connect` intentionally
// sends no client-side config: there is nothing left for a client to tamper
// with.

export interface LiveCloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
}

export interface LiveClientCallbacks {
  onOpen?: () => void;
  /** Fires once the server has accepted the setup message — if a session
   * closes before this ever fires, the problem is auth/config, not audio. */
  onSetupComplete?: () => void;
  onAudioChunk: (base64Pcm24k: string) => void;
  onInterrupted: () => void;
  onTurnComplete?: () => void;
  /** specs §4.5 — t_activity_end: server's "user stopped speaking" signal.
   * Requires allowlisted access to voiceActivityDetectionSignal; if the
   * project isn't allowlisted this simply never fires and TTFA stays blank. */
  onActivityEnd?: () => void;
  onInputTranscript?: (text: string, finished: boolean) => void;
  onOutputTranscript?: (text: string, finished: boolean) => void;
  onError?: (error: unknown) => void;
  onClose?: (info: LiveCloseInfo) => void;
}

export async function connectLiveSession(
  tokenResponse: TokenResponseBody,
  callbacks: LiveClientCallbacks,
): Promise<Session> {
  const client = new GoogleGenAI({
    apiKey: tokenResponse.token,
    httpOptions: { apiVersion: "v1alpha" },
  });

  return client.live.connect({
    model: tokenResponse.model,
    callbacks: {
      onopen: callbacks.onOpen,
      onmessage: (message: LiveServerMessage) => handleMessage(message, callbacks),
      onerror: (event) => callbacks.onError?.(event.error ?? event),
      onclose: (event) =>
        callbacks.onClose?.({
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        }),
    },
  });
}

function handleMessage(message: LiveServerMessage, callbacks: LiveClientCallbacks) {
  if (message.setupComplete) {
    callbacks.onSetupComplete?.();
  }

  if (message.voiceActivityDetectionSignal?.vadSignalType === VadSignalType.VAD_SIGNAL_TYPE_EOS) {
    callbacks.onActivityEnd?.();
  }

  const content = message.serverContent;
  if (!content) return;

  if (content.interrupted) {
    callbacks.onInterrupted();
  }

  for (const part of content.modelTurn?.parts ?? []) {
    if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) {
      callbacks.onAudioChunk(part.inlineData.data);
    }
  }

  if (content.inputTranscription?.text) {
    callbacks.onInputTranscript?.(
      content.inputTranscription.text,
      content.inputTranscription.finished ?? false,
    );
  }

  if (content.outputTranscription?.text) {
    callbacks.onOutputTranscript?.(
      content.outputTranscription.text,
      content.outputTranscription.finished ?? false,
    );
  }

  if (content.turnComplete) {
    callbacks.onTurnComplete?.();
  }
}

// The Live API waits for the user to speak first, so a session used to open on
// silence: a demo visitor who waited for the interviewer heard nothing for two
// minutes and then got "That's the demo." Real interviewers open the call, so
// once setup completes the client sends this marker as text, and the
// interviewer prompt (CANDIDATE_JOINED in lib/prompts/interviewer.ts) tells the
// model it means "the candidate is here — open the interview", not speech.
export const CANDIDATE_JOINED_MARKER = "[candidate_joined]";

export function startInterviewerTurn(session: Session) {
  try {
    session.sendRealtimeInput({ text: CANDIDATE_JOINED_MARKER });
  } catch (error) {
    // Not fatal: the candidate can still open by speaking, as before.
    console.error("[live] could not send the opening cue", error);
  }
}

export function sendAudioChunk(session: Session, base64Pcm16k: string) {
  session.sendRealtimeInput({
    audio: { data: base64Pcm16k, mimeType: "audio/pcm;rate=16000" },
  });
}
