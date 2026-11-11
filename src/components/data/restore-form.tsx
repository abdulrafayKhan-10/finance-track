"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { restoreBackup } from "@/features/data/actions";
import { MAX_BACKUP_BYTES, parseBackup } from "@/lib/backup";

/** Reads a backup file in the browser, shows what it contains, then restores it on confirmation. */
export function RestoreForm({ empty }: { empty: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>();
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();

  async function choose(file: File | undefined) {
    setMessage({});
    setText(null);
    setSummary(undefined);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setMessage({ error: "The file is too large to restore (max 10 MB)." });
      return;
    }
    const content = await file.text();
    const parsed = parseBackup(content);
    if (!parsed.ok) {
      setMessage({ error: parsed.error });
      return;
    }
    const c = parsed.counts;
    setSummary(
      `${c.accounts} accounts, ${c.transactions} transactions, ${c.assets} assets, ${c.asset_valuations} valuations, ${c.budgets} budgets and ${c.savings_goals} goals.`,
    );
    setText(content);
  }

  return (
    <div className="grid max-w-xl gap-3">
      <FormMessage error={message.error} success={message.success} />
      {!empty && (
        <p className="text-sm text-warning">
          This account already has records. Restore only works into an empty account: download a backup, then delete
          your data below first.
        </p>
      )}
      <Input
        type="file"
        accept=".json,application/json"
        aria-label="Backup file"
        disabled={!empty || pending}
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      {summary && text && (
        <div className="grid justify-items-start gap-2 rounded-xl border p-3 text-sm">
          <p>This backup holds {summary}</p>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await restoreBackup(text);
                setMessage(r.ok ? { success: r.summary } : { error: r.error });
                if (r.ok) {
                  setText(null);
                  setSummary(undefined);
                }
              })
            }
          >
            {pending ? "Restoring…" : "Restore this backup"}
          </Button>
          <p className="text-xs text-muted-foreground">
            All or nothing: if any record is invalid, nothing is restored.
          </p>
        </div>
      )}
    </div>
  );
}
