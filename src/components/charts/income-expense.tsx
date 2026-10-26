"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TwoSeriesPoint } from "./types";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Income (series 1) vs spending (series 2) per month, with a legend and a per-month tooltip. */
export function IncomeExpenseChart({ points, height = 240 }: { points: TwoSeriesPoint[]; height?: number }) {
  return (
    <div className="grid gap-2">
      <ul className="flex gap-4 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-series-1" aria-hidden /> Income
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-series-2" aria-hidden /> Spending
        </li>
      </ul>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(v: number) => compact.format(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.5 }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as TwoSeriesPoint | undefined) : undefined;
                return p ? (
                  <div className="grid gap-0.5 rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                    <div className="text-muted-foreground">{p.label}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-sm bg-series-1" aria-hidden /> Income{" "}
                      <span className="tabular ml-auto pl-3 font-medium">{p.aDisplay}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-sm bg-series-2" aria-hidden /> Spending{" "}
                      <span className="tabular ml-auto pl-3 font-medium">{p.bDisplay}</span>
                    </div>
                  </div>
                ) : null;
              }}
            />
            <Bar
              dataKey="a"
              name="Income"
              fill="var(--series-1)"
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="b"
              name="Spending"
              fill="var(--series-2)"
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
