import { NextResponse } from "next/server";

// Phase 1 §5.3 — { available, reason? } so the landing page renders the right CTA.
export async function GET() {
  return NextResponse.json({ available: true });
}
