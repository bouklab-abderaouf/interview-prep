import type { Status } from "@/lib/metrics/assessment";

// Reference status palette (dataviz skill): the colour marks state, but always
// next to an icon and a word — never colour alone, never on the text itself.
export const STATUS_STYLE: Record<Status, { icon: string; label: string; dot: string; chip: string }> = {
  good: { icon: "✓", label: "Good", dot: "bg-[#0ca30c]", chip: "border-[#0ca30c]/40 bg-[#0ca30c]/10" },
  watch: { icon: "!", label: "Watch", dot: "bg-[#fab219]", chip: "border-[#fab219]/50 bg-[#fab219]/10" },
  fix: { icon: "✕", label: "Fix", dot: "bg-[#d03b3b]", chip: "border-[#d03b3b]/40 bg-[#d03b3b]/10" },
};

export function StatusBadge({ status }: { status: Status }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${style.chip}`}>
      <span aria-hidden>{style.icon}</span>
      {style.label}
    </span>
  );
}
