"use client";

import { formatInstant, type InstantStyle } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// Times used to render in UTC everywhere, so an interview at 20:10 in Paris
// showed as 18:10. The server can't know the viewer's zone, so this renders
// UTC for SSR and hydration, then the viewer's local time.
export function LocalTime({ iso, style = "datetime" }: { iso: string | null; style?: InstantStyle }) {
  const hydrated = useHydrated();
  if (!iso) return <>—</>;
  return (
    <time dateTime={iso}>
      {formatInstant(iso, style, hydrated ? undefined : "UTC")}
    </time>
  );
}
