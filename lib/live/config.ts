import { Modality, type LiveConnectConfig } from "@google/genai";

import { buildInterviewerPrompt } from "@/lib/prompts/interviewer";
import type { InterviewLanguage, InterviewMode } from "@/lib/live/types";
import type { DemoScenario } from "@/lib/fixtures/demo-scenario";

interface BuildLiveConnectConfigParams {
  mode: InterviewMode;
  language: InterviewLanguage;
  scenario?: DemoScenario;
}

// Per specs §4.4. `silenceDurationMs` is the single most impactful UX knob —
// tune against real hesitant speech, not clean read-aloud.
export function buildLiveConnectConfig({
  mode,
  language,
  scenario,
}: BuildLiveConnectConfigParams): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
      languageCode: language === "fr" ? "fr-FR" : "en-US",
    },
    systemInstruction: buildInterviewerPrompt({ mode, language, scenario }),
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        silenceDurationMs: 800,
        prefixPaddingMs: 300,
      },
    },
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: {},
  };
}
