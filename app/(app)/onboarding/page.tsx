"use client";

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { InterviewLanguage } from "@/lib/live/types";

// Phase 2 §6.3 — CV drag-and-drop, JD textarea, language toggle.

type Stage = "idle" | "analyzing" | "error";

const SUBSTEPS = ["Reading your CV", "Matching against the role", "Building your path"];
const CV_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const JD_MAX_CHARS = 20000;
const JD_MIN_CHARS = 50;

export default function OnboardingPage() {
  const router = useRouter();
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState("");
  const [language, setLanguage] = useState<InterviewLanguage>("fr");
  const [stage, setStage] = useState<Stage>("idle");
  const [substepIndex, setSubstepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const substepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setErrorMessage("Please upload a PDF file.");
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      setErrorMessage("CV must be under 5 MB.");
      return;
    }
    setErrorMessage(null);
    setCvFile(file);
  };

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files[0] ?? null);
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!cvFile) {
      setErrorMessage("Add your CV first.");
      return;
    }
    if (jdText.length < JD_MIN_CHARS) {
      setErrorMessage("Job description is too short.");
      return;
    }

    setErrorMessage(null);
    setStage("analyzing");
    setSubstepIndex(0);
    // Not a real progress signal from the server — just paces through the
    // three substeps over the analysis's typical 10-25s (specs §6.3).
    substepTimerRef.current = setInterval(() => {
      setSubstepIndex((prev) => Math.min(prev + 1, SUBSTEPS.length - 1));
    }, 5000);

    try {
      const formData = new FormData();
      formData.set("cv", cvFile);
      formData.set("jd", jdText);
      formData.set("language", language);

      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}) as { error?: string; roadmapId?: string });

      if (!res.ok || !body.roadmapId) {
        throw new Error(body.error ?? `analyze returned ${res.status}`);
      }

      router.push(`/roadmap/${body.roadmapId}`);
    } catch (error) {
      if (substepTimerRef.current) clearInterval(substepTimerRef.current);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStage("error");
    }
  };

  if (stage === "analyzing") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
        <p className="text-lg font-medium">{SUBSTEPS[substepIndex]}...</p>
        <p className="text-sm text-zinc-500">This takes 10–25 seconds.</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-16">
      <h1 className="text-xl font-medium">Upload your CV and the job description</h1>

      {/* specs §2 — GEMINI_API_KEY is on the free tier: Google may use
          submitted content to improve their models. Required notice per the
          spec's own fallback ("enable paid billing, or put a clear notice on
          the upload page") since billing wasn't enabled. */}
      <p className="w-full max-w-xl rounded border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        This app currently runs on a free-tier Gemini API key. Google may use
        the CV and job description you submit here to improve their models.
        Don&apos;t upload anything you wouldn&apos;t want used that way.
      </p>

      <form onSubmit={handleSubmit} className="flex w-full max-w-xl flex-col gap-6">
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded border-2 border-dashed border-zinc-400 p-8 text-center"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event: ChangeEvent<HTMLInputElement>) => handleFile(event.target.files?.[0] ?? null)}
          />
          {cvFile ? (
            <p>
              {cvFile.name} ({(cvFile.size / 1024 / 1024).toFixed(1)} MB)
            </p>
          ) : (
            <p className="text-zinc-500">Drag &amp; drop your CV (PDF, max 5 MB), or click to browse</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <textarea
            value={jdText}
            onChange={(event) => setJdText(event.target.value.slice(0, JD_MAX_CHARS))}
            placeholder="Paste the job description"
            rows={10}
            className="rounded border border-zinc-400 p-3"
          />
          <span className="self-end text-xs text-zinc-500">
            {jdText.length} / {JD_MAX_CHARS}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLanguage("fr")}
            className={`rounded border px-3 py-1 ${language === "fr" ? "border-blue-500" : "border-zinc-400"}`}
          >
            FR
          </button>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`rounded border px-3 py-1 ${language === "en" ? "border-blue-500" : "border-zinc-400"}`}
          >
            EN
          </button>
        </div>

        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
        >
          Build my roadmap
        </button>
      </form>
    </main>
  );
}
