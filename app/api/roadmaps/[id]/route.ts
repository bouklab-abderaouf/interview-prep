import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roadmapId } = await params;
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 1. Fetch the roadmap to verify ownership and grab attached documents
  const { data: roadmap, error: roadmapError } = await supabase
    .from("roadmaps")
    .select("id, user_id, cv_document_id, jd_document_id")
    .eq("id", roadmapId)
    .maybeSingle<{
      id: string;
      user_id: string;
      cv_document_id: string | null;
      jd_document_id: string | null;
    }>();

  if (roadmapError || !roadmap) {
    return NextResponse.json({ error: "roadmap_not_found" }, { status: 404 });
  }

  if (roadmap.user_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 2. Find any sessions attached to this roadmap's stages and clean them up
  // (PostgreSQL stages delete cascades to stages and progress, but sessions.stage_id
  // is 'on delete set null', so delete sessions explicitly to cascade turns & scorecards)
  const { data: stages } = await supabase
    .from("stages")
    .select("id")
    .eq("roadmap_id", roadmapId);

  const stageIds = (stages ?? []).map((s) => s.id);
  if (stageIds.length > 0) {
    await supabase.from("sessions").delete().in("stage_id", stageIds);
  }

  // 3. Delete the roadmap row (cascades to stages & progress)
  const { error: deleteRoadmapError } = await supabase
    .from("roadmaps")
    .delete()
    .eq("id", roadmapId);

  if (deleteRoadmapError) {
    console.error("[api/roadmaps/[id]] roadmap delete failed", deleteRoadmapError);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  // 4. Clean up associated CV document & Storage file if no other roadmap uses it
  if (roadmap.cv_document_id) {
    const { count } = await supabase
      .from("roadmaps")
      .select("id", { count: "exact", head: true })
      .eq("cv_document_id", roadmap.cv_document_id);

    if (count === 0) {
      const { data: cvDoc } = await supabase
        .from("documents")
        .select("storage_path")
        .eq("id", roadmap.cv_document_id)
        .maybeSingle<{ storage_path: string | null }>();

      if (cvDoc?.storage_path) {
        await supabase.storage.from("cvs").remove([cvDoc.storage_path]);
      }
      await supabase.from("documents").delete().eq("id", roadmap.cv_document_id);
    }
  }

  // 5. Clean up associated JD document if no other roadmap uses it
  if (roadmap.jd_document_id) {
    const { count } = await supabase
      .from("roadmaps")
      .select("id", { count: "exact", head: true })
      .eq("jd_document_id", roadmap.jd_document_id);

    if (count === 0) {
      await supabase.from("documents").delete().eq("id", roadmap.jd_document_id);
    }
  }

  return NextResponse.json({ success: true });
}
