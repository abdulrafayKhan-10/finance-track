import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/app-shell/notice";
import { PageHeader } from "@/components/app-shell/page-header";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Amount } from "@/components/money/amount";
import { ReconcileForm } from "@/components/reconciliation/reconcile-form";
import { Badge } from "@/components/ui/badge";
import { getProfile } from "@/data/repositories/profile";
import { todayIn } from "@/domain/dates";
import { displayBalance } from "@/domain/ledger";
import { getAccountDetail } from "@/features/accounts/queries";
import { reconcile, undoReconciliation } from "@/features/reconciliation/actions";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Reconcile" };

export default async function ReconcilePage({ params, searchParams }: PageProps<"/accounts/[id]/reconcile">) {
  await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [detail, profile] = await Promise.all([getAccountDetail(id), getProfile()]);
  if (!detail) notFound();
  const { account, rows, reconciliations } = detail;

  return (
    <>
      <Notice value={query.notice} />
      <PageHeader
        title={`Reconcile ${account.name}`}
        description="Compare the cleared balance with a bank or card statement. Reconciled transactions are locked against accidental edits."
      />
      <ReconcileForm
        action={reconcile}
        defaultDate={todayIn(profile.timezone)}
        account={{
          id: account.id,
          currency: account.currency,
          class: account.class,
          openingBalance: account.openingBalance.toStorage(),
          openingDate: account.openingDate,
        }}
        postings={rows.map((r) => ({
          transactionId: r.posting.transactionId,
          occurredOn: r.posting.occurredOn,
          description: r.posting.description || r.posting.payee || "",
          amount: r.posting.amount.toStorage(),
          status: r.posting.status,
        }))}
      />

      <section className="mt-10 grid gap-3 border-t pt-6" aria-labelledby="past-title">
        <h2 id="past-title" className="font-medium">
          Past reconciliations
        </h2>
        {reconciliations.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="grid divide-y rounded-xl border">
            {reconciliations.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="grid gap-1 text-sm">
                  <span className="font-medium">{formatDate(r.statementDate)}</span>
                  <span className="text-muted-foreground">
                    Statement <Amount money={displayBalance(account, r.statementBalance)} colored={false} /> ·
                    difference <Amount money={displayBalance(account, r.difference)} sign="always" />
                    {r.adjustmentTransactionId && (
                      <>
                        {" "}
                        ·{" "}
                        <Link
                          href={`/transactions/${r.adjustmentTransactionId}`}
                          className="text-primary hover:underline"
                        >
                          adjustment
                        </Link>
                      </>
                    )}
                  </span>
                  {r.changedSince && <Badge variant="warning">changed since reconciled</Badge>}
                  {r.note && <span className="text-muted-foreground">{r.note}</span>}
                </div>
                <ConfirmAction
                  action={undoReconciliation}
                  fields={{ id: r.id, account_id: account.id }}
                  triggerLabel="Undo"
                  title="Undo this reconciliation?"
                  description="Its transactions are unlocked and stay cleared. Any adjustment it created is kept; delete it separately if you no longer want it."
                  confirmLabel="Undo reconciliation"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
