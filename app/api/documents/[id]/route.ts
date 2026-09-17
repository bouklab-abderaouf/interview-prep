import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 1. Fetch document to verify ownership and kind
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, user_id, kind, storage_path")
    .eq("id", documentId)
    .maybeSingle<{
      id: string;
      user_id: string;
      kind: "cv" | "jd";
      storage_path: string | null;
    }>();

  if (docError || !doc) {
    return NextResponse.json({ error: "document_not_found" }, { status: 404 });
  }

  if (doc.user_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 2. Prevent deleting a document that is actively attached to a roadmap
  const column = doc.kind === "cv" ? "cv_document_id" : "jd_document_id";
  const { count } = await supabase
    .from("roadmaps")
    .select("id", { count: "exact", head: true })
    .eq(column, documentId);

  if (count && count > 0) {
    return NextResponse.json(
      { error: "document_in_use", message: "This document is linked to an active roadmap. Delete the roadmap first." },
      { status: 409 },
    );
  }

  // 3. Remove storage file if it's a CV
  if (doc.kind === "cv" && doc.storage_path) {
    await supabase.storage.from("cvs").remove([doc.storage_path]);
  }

  // 4. Delete document row
  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (deleteError) {
    console.error("[api/documents/[id]] delete failed", deleteError);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
