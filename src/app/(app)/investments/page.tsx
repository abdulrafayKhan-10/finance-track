import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/app-shell/notice";
import { PageHeader } from "@/components/app-shell/page-header";
import { point } from "@/components/charts/chart-data";
import { NetWorthTrend } from "@/components/charts/net-worth-trend";
import { ExcludedNote } from "@/components/figures/excluded-note";
import { Stat } from "@/components/figures/stat";
import { AllocationBars } from "@/components/investments/allocation-bars";
import { HoldingsTable } from "@/components/investments/holdings-table";
import { Amount } from "@/components/money/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPortfolioPage } from "@/features/investments/queries";
import { ASSET_CATEGORY_LABELS } from "@/lib/asset-meta";
import { requireUser } from "@/lib/auth";
import { formatDate, formatMonthShort } from "@/lib/format";

export const metadata: Metadata = { title: "Investments" };

export default async function InvestmentsPage({ searchParams }: PageProps<"/investments">) {
  await requireUser();
  const [{ ctx, inv, portfolio: pf, history, accountName }, query] = await Promise.all([
    getPortfolioPage(),
    searchParams,
  ]);
  const hasInvestmentAccount = ctx.accounts.some((a) => a.type === "investment");
  const closed = inv.assets.filter((a) => !pf.holdings.some((h) => h.asset.id === a.id));

  return (
    <>
      <Notice value={query.notice} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Investments"
          description={`Valued by your own dated manual valuations, never live prices. In ${pf.currency} as of ${formatDate(pf.asOf)}.`}
        />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/investments/assets/new">
              <Plus aria-hidden /> Asset
            </Link>
          </Button>
          {inv.assets.length > 0 && hasInvestmentAccount && (
            <Button asChild>
              <Link href="/investments/new">
                <Plus aria-hidden /> Transaction
              </Link>
            </Button>
          )}
        </div>
      </div>

      {(!hasInvestmentAccount || inv.assets.length === 0) && (
        <section className="mb-6 grid justify-items-start gap-2 rounded-xl border border-dashed p-5 text-sm">
          <h2 className="font-medium">Getting started</h2>
          <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
            <li className={hasInvestmentAccount ? "line-through" : undefined}>
              <Link href="/accounts/new" className="underline">
                Add an account
              </Link>{" "}
              of type “Investment account” (your broker, fund portal or a “Gold at home” account).
            </li>
            <li className={inv.assets.length > 0 ? "line-through" : undefined}>
              <Link href="/investments/assets/new" className="underline">
                Add an asset
              </Link>
              : a stock, fund, gold, crypto, certificate or anything with a quantity.
            </li>
            <li>Record an opening holding or a buy, then add a valuation.</li>
          </ol>
        </section>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Estimated value"
          note={pf.oldestValuation ? `Oldest valuation used: ${formatDate(pf.oldestValuation)}` : undefined}
        >
          <Amount money={pf.value} colored={false} />
        </Stat>
        <Stat label="Cost of valued holdings">
          <Amount money={pf.cost} colored={false} />
        </Stat>
        <Stat label="Unrealized gain" note="Value − cost, not yet sold">
          <Amount money={pf.unrealized} sign="always" />
        </Stat>
        <Stat label="Realized gain" note="From sales, all time">
          <Amount money={pf.realized} sign="always" />
        </Stat>
        <Stat label="Dividends & interest" note="All time; counted as income">
          <Amount money={pf.income} colored={false} />
        </Stat>
        <Stat label="Investment fees" note="Separate fee transactions">
          <Amount money={pf.fees} colored={false} />
        </Stat>
      </div>

      <div className="mb-6 grid gap-2">
        {pf.unvalued.length > 0 && (
          <p className="rounded-md border border-warning/40 p-3 text-sm text-muted-foreground">
            <Badge variant="warning" className="mr-2">
              {pf.unvalued.length} unvalued
            </Badge>
            Cost basis <Amount money={pf.unvaluedCost} colored={false} /> not included in the value or net worth until
            you add a valuation: {pf.unvalued.map((h) => h.asset.name).join(", ")}.
          </p>
        )}
        <ExcludedNote
          excluded={[
            ...pf.unconvertible.flatMap((h) => (h.valuation.status === "valued" ? [h.valuation.value] : [])),
            ...pf.excluded,
          ]}
          stale={pf.usedStaleRate}
        />
      </div>

      <section className="mb-8 grid gap-3" aria-labelledby="holdings-title">
        <h2 id="holdings-title" className="font-semibold">
          Holdings
        </h2>
        <HoldingsTable holdings={pf.holdings} accountName={accountName} />
        <p className="text-xs text-muted-foreground">
          Amounts are in each asset’s own currency. Cost basis uses the weighted average, which may differ from a
          broker’s lot-based (FIFO) figures.
        </p>
      </section>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section className="grid content-start gap-3 rounded-xl border bg-card p-4" aria-labelledby="alloc-title">
          <h2 id="alloc-title" className="font-semibold">
            Allocation
          </h2>
          <AllocationBars allocation={pf.allocation} />
          <p className="text-xs text-muted-foreground">Valued holdings only, by category.</p>
        </section>

        <section className="grid content-start gap-2 rounded-xl border bg-card p-4" aria-labelledby="history-title">
          <h2 id="history-title" className="font-semibold">
            Value over the last 12 months
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <>
              <NetWorthTrend
                points={history.map((p) => ({ ...point(formatMonthShort(p.date), p.value), snapshot: false }))}
              />
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground">Show as a table</summary>
                <table className="mt-2 w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-1">
                        Month-end
                      </th>
                      <th scope="col" className="py-1 text-right">
                        Estimated value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...history].reverse().map((p) => (
                      <tr key={p.date}>
                        <td className="py-1">{formatDate(p.date)}</td>
                        <td className="py-1 text-right">
                          <Amount money={p.value} colored={false} />
                          {p.unvaluedCount > 0 && (
                            <span className="block text-xs text-muted-foreground">{p.unvaluedCount} unvalued</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
              <p className="text-xs text-muted-foreground">
                Each month uses the valuations dated on or before it; later valuations never change earlier months.
              </p>
            </>
          )}
        </section>
      </div>

      {closed.length > 0 && (
        <section className="grid gap-2" aria-labelledby="other-title">
          <h2 id="other-title" className="font-semibold">
            Other assets
          </h2>
          <ul className="grid divide-y rounded-xl border text-sm">
            {closed.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <Link href={`/investments/assets/${a.id}`} className="font-medium hover:underline">
                  {a.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {ASSET_CATEGORY_LABELS[a.category]} · {a.status === "archived" ? "archived" : "nothing held"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
