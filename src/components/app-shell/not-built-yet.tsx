import { Construction } from "lucide-react";

/** Honest empty state for modules scheduled in a later phase (docs/08-implementation-checklist.md). */
export function NotBuiltYet({ phase, features }: { phase: number; features: string[] }) {
  return (
    <section className="rounded-xl border border-dashed p-6 sm:p-8" aria-labelledby="not-built-title">
      <div className="flex items-start gap-3">
        <Construction className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="grid gap-2">
          <h2 id="not-built-title" className="font-medium">
            Not built yet. This module arrives in Phase {phase}.
          </h2>
          <p className="text-sm text-muted-foreground">
            No data is shown here until it is calculated from your records.
          </p>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
