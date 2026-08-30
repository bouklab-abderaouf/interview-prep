import { NextResponse } from "next/server";

// Phase 3 §7.1 — PATCH flushes turns + ends the session (also called via
// navigator.sendBeacon on beforeunload).
export async function PATCH() {
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
