"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "./types";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Single-series line: no legend (the heading names it); tooltip shows the exact figure. */
export function NetWorthTrend({
  points,
  height = 220,
}: {
  points: (ChartPoint & { snapshot: boolean })[];
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v: number) => compact.format(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active
                ? (payload?.[0]?.payload as (ChartPoint & { snapshot: boolean }) | undefined)
                : undefined;
              return p ? (
                <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                  <div className="text-muted-foreground">{p.label}</div>
                  <div className="tabular font-medium text-foreground">{p.display}</div>
                  {p.snapshot && <div className="text-muted-foreground">Saved snapshot</div>}
                </div>
              ) : null;
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={(props: { cx?: number; cy?: number; payload?: { snapshot: boolean }; index?: number }) =>
              props.payload?.snapshot ? (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill="var(--series-1)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              ) : (
                <g key={props.index} />
              )
            }
            activeDot={{ r: 5, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
