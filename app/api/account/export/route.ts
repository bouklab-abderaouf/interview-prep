import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// GDPR rights of access (Art. 15) and portability (Art. 20): everything the
// app holds about the signed-in user, as one JSON file. Production readiness
// phase 5. Runs on the user's own client, so RLS guarantees it can only ever
// contain their rows; CV files are included as one-hour signed links rather
// than inlined bytes.

const SIGNED_URL_SECONDS = 60 * 60;

export async function GET() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const one = async <T,>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    };

    const [profile, documents, roadmaps, progress, sessions, dailyUsage] = await Promise.all([
      one(supabase.from("profiles").select("*").eq("id", userId).maybeSingle()),
      one(supabase.from("documents").select("*").eq("user_id", userId).order("created_at")),
      one(supabase.from("roadmaps").select("*").eq("user_id", userId).order("created_at")),
      one(supabase.from("progress").select("*").eq("user_id", userId)),
      one(supabase.from("sessions").select("*").eq("user_id", userId).order("started_at")),
      one(supabase.from("user_daily_usage").select("*").eq("user_id", userId).order("day")),
    ]);

    const roadmapIds = ((roadmaps ?? []) as Array<{ id: string }>).map((r) => r.id);
    const sessionIds = ((sessions ?? []) as Array<{ id: string }>).map((s) => s.id);

    const [stages, turns, scorecards] = await Promise.all([
      roadmapIds.length ? one(supabase.from("stages").select("*").in("roadmap_id", roadmapIds).order("order_index")) : [],
      sessionIds.length
        ? one(supabase.from("turns").select("*").in("session_id", sessionIds).order("order_index"))
        : [],
      sessionIds.length ? one(supabase.from("scorecards").select("*").in("session_id", sessionIds)) : [],
    ]);

    const cvFiles = await Promise.all(
      ((documents ?? []) as Array<{ id: string; storage_path: string | null }>)
        .filter((doc) => doc.storage_path)
        .map(async (doc) => {
          const { data } = await supabase.storage.from("cvs").createSignedUrl(doc.storage_path!, SIGNED_URL_SECONDS);
          return { document_id: doc.id, download_url: data?.signedUrl ?? null, expires_in_seconds: SIGNED_URL_SECONDS };
        }),
    );

    const exportedAt = new Date().toISOString();
    const body = {
      format: "interview-prep-export/1",
      exported_at: exportedAt,
      account: { id: userId, email: claims.email ?? null },
      profile,
      documents,
      cv_files: cvFiles,
      roadmaps,
      stages,
      progress,
      sessions,
      turns,
      scorecards,
      daily_usage: dailyUsage,
    };

    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="interview-prep-export-${exportedAt.slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    // Never hand back a partial export as if it were complete.
    console.error("[api/account/export] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "export_failed" }, { status: 502 });
  }
}
