import { Download } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { RestoreForm } from "@/components/data/restore-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { deleteAccount, deleteMyData } from "@/features/data/actions";
import { loadFinanceContext } from "@/features/finance-context";
import { loadInvestments } from "@/features/investments/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Data" };

const CSV_EXPORTS = [
  { kind: "transactions", label: "Transactions", hint: "Every line and holding movement" },
  { kind: "accounts", label: "Accounts", hint: "With today’s balances" },
  { kind: "categories", label: "Categories" },
  { kind: "assets", label: "Assets" },
  { kind: "holdings", label: "Holdings", hint: "Quantities, cost and value today" },
  { kind: "valuations", label: "Valuations" },
  { kind: "budgets", label: "Budgets" },
  { kind: "goals", label: "Goals" },
  { kind: "allocations", label: "Goal allocations" },
  { kind: "exchange-rates", label: "Exchange rates" },
];

export default async function DataPage() {
  const user = await requireUser();
  const [ctx, inv] = await Promise.all([loadFinanceContext(), loadInvestments()]);
  const empty = ctx.accounts.length === 0 && inv.assets.length === 0 && ctx.rates.length === 0;

  return (
    <>
      <PageHeader
        title="Data"
        description="Your records belong to you: take them with you, back them up, or remove them."
      />

      <section className="mb-10 grid gap-3" aria-labelledby="backup-title">
        <h2 id="backup-title" className="font-semibold">
          Backup
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          One JSON file with every record and its links, which you can restore later. The free database plan keeps no
          downloadable backups, so this file <strong>is</strong> your backup: download it every week or so and keep
          copies on two devices. It contains your financial data; store it somewhere private.
        </p>
        <Button asChild className="justify-self-start">
          <a href="/export/backup" download>
            <Download aria-hidden /> Download backup
          </a>
        </Button>
      </section>

      <section className="mb-10 grid gap-3" aria-labelledby="csv-title">
        <h2 id="csv-title" className="font-semibold">
          CSV exports
        </h2>
        <p className="text-sm text-muted-foreground">
          For spreadsheets. Reports have their own export buttons on the Reports page.
        </p>
        <ul className="grid max-w-2xl divide-y rounded-xl border text-sm">
          {CSV_EXPORTS.map((e) => (
            <li key={e.kind} className="flex items-center justify-between gap-3 p-3">
              <span className="grid">
                <span className="font-medium">{e.label}</span>
                {e.hint && <span className="text-xs text-muted-foreground">{e.hint}</span>}
              </span>
              <a
                href={`/export/${e.kind}`}
                download
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Download className="size-4" aria-hidden /> CSV
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 grid gap-3" aria-labelledby="restore-title">
        <h2 id="restore-title" className="font-semibold">
          Restore a backup
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Loads a backup file into this account exactly as it was, in one step. It needs an empty account, so it can
          never mix with or overwrite existing records.
        </p>
        <RestoreForm empty={empty} />
      </section>

      <section className="grid max-w-2xl gap-4 border-t pt-6" aria-labelledby="danger-title">
        <h2 id="danger-title" className="font-semibold text-destructive">
          Delete
        </h2>
        <div className="grid justify-items-start gap-2">
          <h3 className="text-sm font-medium">Delete all my data</h3>
          <p className="text-sm text-muted-foreground">
            Removes every account, transaction, asset, budget, goal, rate and snapshot. Your login, settings and
            built-in categories stay, so you can start fresh or restore a backup.
          </p>
          <ConfirmAction
            action={deleteMyData}
            fields={{}}
            triggerLabel="Delete all my data"
            title="Delete all your financial records?"
            description="This can't be undone. Download a backup first if you might want them back."
            confirmLabel="Delete everything"
          >
            <FormField id="confirm" label="Type DELETE to confirm" autoComplete="off" />
          </ConfirmAction>
        </div>
        <div className="grid justify-items-start gap-2">
          <h3 className="text-sm font-medium">Delete my account</h3>
          <p className="text-sm text-muted-foreground">
            Permanently deletes your login and every record. You will be signed out.
          </p>
          <ConfirmAction
            action={deleteAccount}
            fields={{}}
            triggerLabel="Delete my account"
            title="Delete your account permanently?"
            description="Your login and all data are removed for good. Download a backup first."
            confirmLabel="Delete my account"
          >
            <FormField id="confirm" label={`Type your email (${user.email ?? ""})`} autoComplete="off" />
            <FormField id="password" label="Your password" type="password" autoComplete="current-password" />
          </ConfirmAction>
        </div>
      </section>
    </>
  );
}
