import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { analyzeGap } from "@/lib/gemini/analyze-gap";
import type { InterviewLanguage } from "@/lib/live/types";

const CV_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const JD_MAX_CHARS = 20000;
const JD_MIN_CHARS = 50;

const STAGE_DEFAULTS = { maxSeconds: 600, passScore: 60 };

// specs §6.1
export async function POST(request: Request) {
  const supabase = await createClient();

  // 1. Auth check. Reject anonymous.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const cvFile = formData.get("cv");
  const jdText = formData.get("jd");
  const language = formData.get("language");

  if (!(cvFile instanceof File) || cvFile.type !== "application/pdf") {
    return NextResponse.json({ error: "cv_must_be_pdf" }, { status: 400 });
  }
  if (cvFile.size > CV_MAX_BYTES) {
    return NextResponse.json({ error: "cv_too_large" }, { status: 400 });
  }
  if (typeof jdText !== "string" || jdText.length < JD_MIN_CHARS || jdText.length > JD_MAX_CHARS) {
    return NextResponse.json({ error: "jd_invalid_length" }, { status: 400 });
  }
  if (language !== "fr" && language !== "en") {
    return NextResponse.json({ error: "invalid_language" }, { status: 400 });
  }
  const lang: InterviewLanguage = language;

  const cvBytes = Buffer.from(await cvFile.arrayBuffer());

  // 2. Upload the PDF to Storage at {user_id}/{document_id}.pdf
  const cvDocumentId = randomUUID();
  const storagePath = `${userId}/${cvDocumentId}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("cvs")
    .upload(storagePath, cvBytes, { contentType: "application/pdf" });
  if (uploadError) {
    console.error("[api/analyze] storage upload failed", uploadError);
    return NextResponse.json({ error: "cv_upload_failed" }, { status: 502 });
  }

  // 3. Insert documents rows for cv and jd.
  const { data: cvDoc, error: cvDocError } = await supabase
    .from("documents")
    .insert({ id: cvDocumentId, user_id: userId, kind: "cv", storage_path: storagePath })
    .select("id")
    .single();
  if (cvDocError) {
    console.error("[api/analyze] cv document insert failed", cvDocError);
    return NextResponse.json({ error: "cv_document_insert_failed" }, { status: 502 });
  }

  const { data: jdDoc, error: jdDocError } = await supabase
    .from("documents")
    .insert({ user_id: userId, kind: "jd", raw_text: jdText })
    .select("id")
    .single();
  if (jdDocError) {
    console.error("[api/analyze] jd document insert failed", jdDocError);
    return NextResponse.json({ error: "jd_document_insert_failed" }, { status: 502 });
  }

  // 4. One Gemini call: PDF bytes inline + JD text, structured output.
  let gapAnalysis;
  try {
    gapAnalysis = await analyzeGap({ cvBytes, jdText, language: lang });
  } catch (error) {
    console.error("[api/analyze] gap analysis failed", error);
    return NextResponse.json({ error: "analysis_failed" }, { status: 502 });
  }

  // 5. Insert roadmaps and four stages rows.
  const { stages, ...gapAnalysisWithoutStages } = gapAnalysis;

  const { data: roadmap, error: roadmapError } = await supabase
    .from("roadmaps")
    .insert({
      user_id: userId,
      cv_document_id: cvDoc.id,
      jd_document_id: jdDoc.id,
      target_role: gapAnalysis.role.title,
      company: gapAnalysis.role.company,
      language: lang,
      gap_analysis: gapAnalysisWithoutStages,
    })
    .select("id")
    .single();
  if (roadmapError) {
    console.error("[api/analyze] roadmap insert failed", roadmapError);
    return NextResponse.json({ error: "roadmap_insert_failed" }, { status: 502 });
  }

  const stageRows = stages.map((stage, index) => ({
    roadmap_id: roadmap.id,
    order_index: index,
    slug: stage.slug,
    title: stage.title,
    description: stage.description,
    focus_areas: stage.focus_areas,
    question_bank: stage.questions,
    persona: stage.persona,
    max_seconds: STAGE_DEFAULTS.maxSeconds,
    pass_score: STAGE_DEFAULTS.passScore,
  }));

  const { data: insertedStages, error: stagesError } = await supabase
    .from("stages")
    .insert(stageRows)
    .select("id, order_index");
  if (stagesError) {
    console.error("[api/analyze] stages insert failed", stagesError);
    return NextResponse.json({ error: "stages_insert_failed" }, { status: 502 });
  }

  // 6. Insert progress rows: stage 0 unlocked = true, rest false.
  const progressRows = insertedStages.map((stage) => ({
    user_id: userId,
    stage_id: stage.id,
    unlocked: stage.order_index === 0,
  }));

  const { error: progressError } = await supabase.from("progress").insert(progressRows);
  if (progressError) {
    console.error("[api/analyze] progress insert failed", progressError);
    return NextResponse.json({ error: "progress_insert_failed" }, { status: 502 });
  }

  // 7. Return { roadmapId }.
  return NextResponse.json({ roadmapId: roadmap.id });
}
