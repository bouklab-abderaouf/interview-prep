import type { ReactNode } from "react";

import { createClient } from "@/lib/supabase/server";
import { MarketingNav } from "@/components/nav/MarketingNav";

// Public pages (landing, /sample-scorecard) share one header. Signed-in state
// is read here so a returning user sees "Open app" instead of "Get started"
// on first paint, without a client-side flash.
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNav signedIn={Boolean(data?.claims)} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
