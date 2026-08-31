"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

interface StarRadarProps {
  situation: number;
  task: number;
  action: number;
  result: number;
}

// specs §7.4 — STAR radar (recharts).
export function StarRadar({ situation, task, action, result }: StarRadarProps) {
  const data = [
    { axis: "Situation", value: situation },
    { axis: "Task", value: task },
    { axis: "Action", value: action },
    { axis: "Result", value: result },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="axis" />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.4} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
