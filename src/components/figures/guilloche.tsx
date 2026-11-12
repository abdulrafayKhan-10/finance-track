import { cn } from "@/lib/utils";

const WIDTH = 640;
const HEIGHT = 240;

/** Interlaced sine bands, like the engraved security pattern on a banknote. Deterministic, so it renders the same on every request. */
function bandPaths(lines: number): string[] {
  const paths: string[] = [];
  for (let i = 0; i < lines; i++) {
    const t = i / lines;
    const phase = t * Math.PI * 2;
    const amp = 38 + 26 * Math.sin(phase * 1.5);
    let d = "";
    for (let x = 0; x <= WIDTH; x += 8) {
      const u = (x / WIDTH) * Math.PI * 2;
      const y =
        HEIGHT / 2 + amp * Math.sin(u * 1.5 + phase) * Math.cos(u * 0.5 - phase / 2) + 18 * Math.sin(u * 4 + phase * 3);
      d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
    }
    paths.push(d);
  }
  return paths;
}

const PATHS = bandPaths(22);

/**
 * The fine line pattern behind the net-worth figure: decoration only, so it is
 * hidden from assistive technology and drawn in the low-contrast guilloche ink.
 */
export function Guilloche({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("pointer-events-none text-guilloche", className)}
    >
      {PATHS.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.75}
          vectorEffect="non-scaling-stroke"
          strokeOpacity={0.55}
        />
      ))}
    </svg>
  );
}
