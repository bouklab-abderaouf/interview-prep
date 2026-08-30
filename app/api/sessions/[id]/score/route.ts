import { NextResponse } from "next/server";

// Phase 3 §7.3 — one Gemini text call, transcript + metrics in, Scorecard out.
export async function POST() {
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
