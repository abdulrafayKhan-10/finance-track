import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/app-shell/notice";
import { PageHeader } from "@/components/app-shell/page-header";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { Amount } from "@/components/money/amount";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { getProfile } from "@/data/repositories/profile";
import { getAccountOptions } from "@/features/accounts/queries";
import { getCategoryOptions } from "@/features/categories/queries";
import { deleteTransaction, saveTransaction } from "@/features/transactions/actions";
import { formValuesFromRecord } from "@/features/transactions/form-values";
import { getTransactionDetail } from "@/features/transactions/queries";
import { requireUser } from "@/lib/auth";
import { formatDate, formatTimestamp } from "@/lib/format";
import { KIND_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Transaction" };

const NOT_EDITABLE = {
  investment_kind: "Investment transactions are edited from the Investments module (Phase 5).",
  split: "This transaction is split across several lines and can't be edited with this form yet.",
  unknown_account: "One of its accounts is no longer available.",
};

export default async function TransactionPage({ params, searchParams }: PageProps<"/transactions/[id]">) {
  await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [detail, accounts, categories, profile] = await Promise.all([
    getTransactionDetail(id),
    getAccountOptions(),
    getCategoryOptions(),
    getProfile(),
  ]);
  if (!detail) notFound();
  const { view, audit } = detail;
  const editable = formValuesFromRecord(view, detail.accounts);
  const locked = view.reconciliationId !== null;

  return (
    <>
      <Notice value={query.notice} />
      <PageHeader
        title={view.description || KIND_LABELS[view.kind]}
        description={`${KIND_LABELS[view.kind]} · ${formatDate(view.occurredOn)} · ${view.accountLabel}`}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Amount
          money={view.headline}
          sign={view.kind === "transfer" ? "never" : "always"}
          className="text-2xl font-semibold"
        />
        {locked && (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden /> Part of a reconciliation
          </span>
        )}
      </div>

      {editable.editable ? (
        <TransactionForm
          action={saveTransaction}
          accounts={accounts}
          categories={categories}
          initial={editable.values}
          id={view.id}
          expectedUpdatedAt={view.updatedAt}
          locked={locked}
          cancelHref="/transactions"
        />
      ) : (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">{NOT_EDITABLE[editable.reason]}</p>
      )}

      <section className="mt-10 grid max-w-xl justify-items-start gap-2 border-t pt-6">
        <h2 className="font-medium">Delete transaction</h2>
        <p className="text-sm text-muted-foreground">
          Balances are recalculated immediately. The deleted record stays in the audit history below.
        </p>
        <ConfirmAction
          action={deleteTransaction}
          fields={{ id: view.id, expected_updated_at: view.updatedAt }}
          triggerLabel="Delete transaction"
          title="Delete this transaction?"
          description={
            <>
              {KIND_LABELS[view.kind]} of <Amount money={view.headline.abs()} colored={false} /> on{" "}
              {formatDate(view.occurredOn)} ({view.accountLabel}).
            </>
          }
          confirmLabel="Delete"
        >
          {locked && <CheckboxField id="unlock" label="Yes, delete it even though it is reconciled" />}
        </ConfirmAction>
      </section>

      <section className="mt-10 grid max-w-xl gap-2 border-t pt-6" aria-labelledby="history-title">
        <h2 id="history-title" className="font-medium">
          History
        </h2>
        <ol className="grid gap-1 text-sm text-muted-foreground">
          {audit.map((ev) => (
            <li key={ev.txid}>
              {formatTimestamp(ev.occurredAt, profile.timezone)}: {ev.action}
            </li>
          ))}
          {audit.length === 0 && <li>No history recorded.</li>}
        </ol>
      </section>
    </>
  );
}
