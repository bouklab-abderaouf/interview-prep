"use client";

interface AudioVisualizerProps {
  isActive: boolean;
  color?: "blue" | "emerald";
  className?: string;
}

export function AudioVisualizer({
  isActive,
  color = "blue",
  className = "",
}: AudioVisualizerProps) {
  const barColor =
    color === "emerald"
      ? "bg-emerald-500 dark:bg-emerald-400"
      : "bg-blue-500 dark:bg-blue-400";

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {[10, 16, 24, 14, 20, 28, 18, 12].map((height, i) => (
        <div
          key={i}
          style={{ height: isActive ? `${height}px` : "4px" }}
          className={`w-1 rounded-full transition-all duration-150 ${barColor} ${
            isActive ? "animate-pulse" : "opacity-30"
          }`}
        />
      ))}
    </div>
  );
}
