import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { reportEvent } from "@/lib/monitoring/events";
import { sweepOrphanCvs } from "@/lib/retention";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily retention job (production readiness phase 5), called by Vercel Cron
// (vercel.json) with `Authorization: Bearer $CRON_SECRET`. Deletes what users
// never see and nobody needs:
// - demo session rows (an IP hash) and daily-usage counters older than 30
//   days — run_retention() in migration 009;
// - CV files with no documents row: leftovers from a cleanup that failed
//   partway. Only files older than a day, so an upload in progress (file
//   written, row not yet) is never touched.
// User content itself is kept until the user deletes it, as the upload page
// and the privacy policy say.

function authorized(request: Request, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const { data, error } = await admin.rpc("run_retention", {});
    if (error) throw new Error(`run_retention: ${error.message}`);
    const orphanCvs = await sweepOrphanCvs(admin, Date.now());

    const result = { ...(data as Record<string, number>), orphan_cvs: orphanCvs };
    console.log("[cron/retention] done", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/retention] failed", error instanceof Error ? error.message : error);
    reportEvent("cron.retention_failed");
    return NextResponse.json({ error: "retention_failed" }, { status: 502 });
  }
}
