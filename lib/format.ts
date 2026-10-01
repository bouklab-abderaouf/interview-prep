// Shared display formatting for the history/list pages. The server has no
// idea where the viewer is, so anything rendered on it is formatted in UTC
// with a fixed locale — otherwise server and client output disagree on
// rehydration. <LocalTime> (components/ui/LocalTime.tsx) re-renders the same
// instant in the viewer's own time zone once the page is hydrated.
export type InstantStyle = "date" | "datetime" | "time";

const OPTIONS: Record<InstantStyle, Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "short", year: "numeric" },
  datetime: { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
  time: { hour: "2-digit", minute: "2-digit" },
};

/** `timeZone` undefined means the runtime's own zone — only safe after hydration. */
export function formatInstant(iso: string | null, style: InstantStyle, timeZone?: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { ...OPTIONS[style], timeZone }).format(new Date(iso));
}

export function formatDate(iso: string | null): string {
  return formatInstant(iso, "date", "UTC");
}

export function formatDateTime(iso: string | null): string {
  return formatInstant(iso, "datetime", "UTC");
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
