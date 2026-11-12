"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const subscribe = () => () => {};

/** `tone="ink"` for the dark sidebar and the mobile top bar. */
export function ThemeToggle({ tone = "paper" }: { tone?: "paper" | "ink" }) {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known in the browser; render neutral on the server.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("inline-flex rounded-md border p-0.5", tone === "ink" && "border-sidebar-border")}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const checked = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:size-7",
              tone === "ink"
                ? "text-sidebar-muted hover:text-sidebar-foreground"
                : "text-muted-foreground hover:text-foreground",
              checked &&
                (tone === "ink" ? "bg-sidebar-accent text-sidebar-foreground" : "bg-accent text-accent-foreground"),
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
