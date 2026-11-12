import type { Metadata } from "next";
import { Notice } from "@/components/app-shell/notice";
import { PageHeader } from "@/components/app-shell/page-header";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormField } from "@/components/forms/form-field";
import { ImportWizard } from "@/components/imports/import-wizard";
import { listImportBatches } from "@/data/repositories/imports";
import { getAccountOptions } from "@/features/accounts/queries";
import { loadFinanceContext } from "@/features/finance-context";
import { undoImport } from "@/features/imports/actions";
import { requireUser } from "@/lib/auth";
import { formatTimestamp } from "@/lib/format";

export const metadata: Metadata = { title: "Import CSV" };

export default async function ImportPage({ searchParams }: PageProps<"/transactions/import">) {
  await requireUser();
  const [accounts, batches, ctx] = await Promise.all([getAccountOptions(), listImportBatches(), loadFinanceContext()]);
  const query = await searchParams;
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "an account";

  return (
    <>
      <Notice value={query.notice} />
      <PageHeader
        title="Import CSV"
        description="Bring in income and expenses from a bank or wallet statement. Every row is checked before anything is saved."
      />
      <ImportWizard accounts={accounts.filter((a) => a.status !== "archived")} />

      <section className="mt-10 grid gap-3 border-t pt-6" aria-labelledby="batches-title">
        <h2 id="batches-title" className="font-semibold">
          Past imports
        </h2>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <ul className="grid divide-y rounded-xl border">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <span className="grid">
                  <span className="font-medium">{b.fileName ?? "Import"}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(b.createdAt, ctx.profile.timezone)} · {b.transactionCount} transaction
                    {b.transactionCount === 1 ? "" : "s"} into {accountName(b.accountId)}
                  </span>
                </span>
                {b.transactionCount > 0 && (
                  <ConfirmAction
                    action={undoImport}
                    fields={{ id: b.id }}
                    triggerLabel="Undo import"
                    title={`Undo “${b.fileName ?? "this import"}”?`}
                    description={`All ${b.transactionCount} transactions from this file are deleted at once. They stay in the audit history.`}
                    confirmLabel="Undo import"
                  >
                    <FormField id="confirm" label="Type UNDO to confirm" autoComplete="off" />
                    <CheckboxField id="unlock" label="Also remove any that are reconciled" />
                  </ConfirmAction>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
