import { Pencil, Plus, Scale } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountLedger } from "@/components/accounts/account-ledger";
import { Notice } from "@/components/app-shell/notice";
import { Amount } from "@/components/money/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAccountDetail } from "@/features/accounts/queries";
import { getCategoryNames } from "@/features/categories/queries";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Account" };

const PAGE_SIZE = 100;

export default async function AccountPage({ params, searchParams }: PageProps<"/accounts/[id]">) {
  await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [detail, categoryNames] = await Promise.all([getAccountDetail(id), getCategoryNames()]);
  if (!detail) notFound();
  const { account, balance, clearedBalance, rows, reconciliations } = detail;
  const liability = account.class === "liability";
  const shown = query.all === "1" ? rows : rows.slice(0, PAGE_SIZE);
  const last = reconciliations[0];

  return (
    <>
      <Notice value={query.notice} />
      <div className="mb-6 grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency} · opened {formatDate(account.openingDate)}
              {account.status !== "active" && <Badge variant="outline">{account.status}</Badge>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {account.status !== "archived" && (
              <Button asChild>
                <Link href={`/transactions/new?account=${account.id}&return_to=/accounts/${account.id}`}>
                  <Plus aria-hidden /> Add transaction
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/accounts/${account.id}/reconcile`}>
                <Scale aria-hidden /> Reconcile
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/accounts/${account.id}/edit`}>
                <Pencil aria-hidden /> Edit
              </Link>
            </Button>
          </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-4">
            <dt className="text-xs text-muted-foreground">{liability ? "Amount owed" : "Balance"}</dt>
            <dd className="text-xl font-semibold">
              <Amount money={balance} />
            </dd>
          </div>
          <div className="rounded-xl border p-4">
            <dt className="text-xs text-muted-foreground">Cleared (excludes pending)</dt>
            <dd className="text-xl font-semibold">
              <Amount money={clearedBalance} />
            </dd>
          </div>
          <div className="rounded-xl border p-4">
            <dt className="text-xs text-muted-foreground">Last reconciled</dt>
            <dd className="grid gap-1 text-sm">
              {last ? (
                <>
                  <span className="text-xl font-semibold">{formatDate(last.statementDate)}</span>
                  {last.changedSince && <Badge variant="warning">changed since reconciled</Badge>}
                </>
              ) : (
                <span className="text-muted-foreground">Never</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <section aria-labelledby="ledger-title" className="grid gap-3">
        <h2 id="ledger-title" className="font-semibold">
          Transactions
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No transactions yet. The balance is the opening balance of{" "}
            <Amount money={liability ? account.openingBalance.negate() : account.openingBalance} />.
          </p>
        ) : (
          <>
            <AccountLedger
              rows={shown}
              accountNames={detail.accountNames}
              categoryNames={categoryNames}
              liability={liability}
            />
            {shown.length < rows.length && (
              <Link
                href={`/accounts/${account.id}?all=1`}
                className="justify-self-start text-sm text-primary hover:underline"
              >
                Show all {rows.length} transactions
              </Link>
            )}
          </>
        )}
      </section>
    </>
  );
}
