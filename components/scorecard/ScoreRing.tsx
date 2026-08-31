// specs §7.4 — above-the-fold overall score ring. Plain SVG, no chart
// library needed for a single-value ring.
export function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <svg width={140} height={140} viewBox="0 0 140 140" className="shrink-0">
      <circle cx={70} cy={70} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={12} />
      <circle
        cx={70}
        cy={70}
        r={radius}
        fill="none"
        stroke="#2563eb"
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
      />
      <text x={70} y={78} textAnchor="middle" fontSize={32} fontWeight={600} fill="currentColor">
        {Math.round(score)}
      </text>
    </svg>
  );
}
