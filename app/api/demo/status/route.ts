import { NextResponse } from "next/server";

import { checkKillSwitch } from "@/lib/guardrails/kill-switch";
import { checkGlobalDailyCap } from "@/lib/guardrails/rate-limit";

// specs §5.3 — { available, reason? } so the landing page renders the right
// CTA before the user clicks. Read-only except for checkGlobalDailyCap's
// killed=true flip, which is idempotent and fine to trigger from a status
// check. Fails closed: any error reports unavailable, matching §5's "never
// bankrupts me" goal over "always looks up."
export async function GET() {
  try {
    const killSwitch = await checkKillSwitch();
    if (killSwitch.killed) {
      return NextResponse.json({ available: false, reason: "demo_paused" });
    }

    const dailyCap = await checkGlobalDailyCap();
    if (dailyCap.exceeded) {
      return NextResponse.json({ available: false, reason: "daily_cap" });
    }

    return NextResponse.json({ available: true });
  } catch (error) {
    console.error("[api/demo/status]", error);
    return NextResponse.json({ available: false, reason: "status_check_failed" });
  }
}
