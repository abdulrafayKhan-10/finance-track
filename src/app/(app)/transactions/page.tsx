import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/app-shell/notice";
import { PageHeader } from "@/components/app-shell/page-header";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";
import { getCategoryOptions } from "@/features/categories/queries";
import { getTransactionPage, parseSearch } from "@/features/transactions/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  await requireUser();
  const params = await searchParams;
  const search = parseSearch(params);
  const [page, categories] = await Promise.all([getTransactionPage(search), getCategoryOptions()]);
  const accountOptions = page.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    class: a.class,
    status: a.status,
  }));

  const nextHref = (() => {
    if (!page.nextCursor) return null;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(search)) if (v && k !== "cursor") qs.set(k, String(v));
    qs.set("cursor", page.nextCursor);
    return `/transactions?${qs.toString()}`;
  })();
  const filtered = Object.entries(search).some(([k, v]) => k !== "order" && k !== "cursor" && v);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Transactions" description="Income, expenses, transfers, refunds and adjustments." />
        {page.accounts.length > 0 && (
          <Button asChild>
            <Link href="/transactions/new">
              <Plus aria-hidden /> New transaction
            </Link>
          </Button>
        )}
      </div>
      <Notice value={params.notice} />
      {page.accounts.length === 0 ? (
        <section className="grid justify-items-start gap-3 rounded-xl border border-dashed p-6">
          <h2 className="font-medium">Add an account first</h2>
          <p className="text-sm text-muted-foreground">Every transaction belongs to an account.</p>
          <Button asChild>
            <Link href="/accounts/new">Add an account</Link>
          </Button>
        </section>
      ) : (
        <>
          <TransactionFilters search={search} accounts={accountOptions} categories={categories} />
          {page.items.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              {filtered ? "No transactions match these filters." : "No transactions yet. Add your first one."}
            </p>
          ) : (
            <TransactionList items={page.items} />
          )}
          <nav aria-label="Pagination" className="mt-4 flex gap-3 text-sm">
            {search.cursor && (
              <Link
                href={`/transactions?${new URLSearchParams(Object.entries(search).filter(([k, v]) => k !== "cursor" && v) as [string, string][]).toString()}`}
                className="text-primary hover:underline"
              >
                ← Back to the start
              </Link>
            )}
            {nextHref && (
              <Link href={nextHref} className="text-primary hover:underline">
                {search.order === "asc" ? "Newer" : "Older"} transactions →
              </Link>
            )}
          </nav>
        </>
      )}
    </>
  );
}
