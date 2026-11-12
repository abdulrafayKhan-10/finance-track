import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { point } from "@/components/charts/chart-data";
import { NetWorthTrend } from "@/components/charts/net-worth-trend";
import { CategoryBars } from "@/components/figures/category-bars";
import { ExcludedNote } from "@/components/figures/excluded-note";
import { Guilloche } from "@/components/figures/guilloche";
import { Meter } from "@/components/figures/meter";
import { Stat } from "@/components/figures/stat";
import { Amount } from "@/components/money/amount";
import { PeriodPicker } from "@/components/planning/period-picker";
import { TransactionList } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";
import { getDashboard } from "@/features/dashboard/queries";
import { loadFinanceContext } from "@/features/finance-context";
import { parsePeriod, PERIOD_LABELS } from "@/features/periods";
import { requireUser } from "@/lib/auth";
import { formatDate, formatMonthShort, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-3 rounded-xl border bg-card p-5" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            View <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  await requireUser();
  const ctx = await loadFinanceContext();
  const period = parsePeriod(await searchParams, ctx.today);
  const d = await getDashboard(period);

  if (ctx.accounts.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <section className="grid justify-items-start gap-3 rounded-xl border border-dashed p-6">
          <h2 className="font-medium">Start by adding your accounts</h2>
          <p className="text-sm text-muted-foreground">
            Every figure here is calculated from your accounts and transactions. Nothing is shown until there is
            something to calculate from.
          </p>
          <Button asChild>
            <Link href="/accounts/new">Add an account</Link>
          </Button>
        </section>
      </>
    );
  }

  const cf = d.cashFlow;
  const periodLabel =
    period.key === "custom" ? `${formatDate(period.from)} – ${formatDate(period.to)}` : PERIOD_LABELS[period.key];
  const nw = d.netWorth;
  // Change since the previous month-end in the trend (the last point is today).
  const previous = d.trend.length > 1 ? d.trend[d.trend.length - 2] : undefined;
  const change = previous ? { amount: nw.netWorth.minus(previous.netWorth.netWorth), since: previous.date } : null;

  return (
    <>
      <PageHeader title="Dashboard" description="Where your money stands today, and how this period went." />

      <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* The note: net worth printed on ink, the one bold element of the app. */}
        <section
          aria-labelledby="nw-title"
          className="relative isolate flex flex-col overflow-hidden rounded-note bg-note px-5 pt-5 pb-24 text-sidebar-foreground sm:px-7 sm:pt-7 sm:pb-28"
        >
          {/* Engraving fills the lower field of the note, never behind the figure. */}
          <Guilloche className="absolute inset-x-0 bottom-0 -z-10 h-32 w-full [mask-image:linear-gradient(to_bottom,transparent,black_45%)] opacity-80 sm:h-40" />
          <h2 id="nw-title" className="text-sm text-note-muted">
            Net worth today
          </h2>
          <Amount
            money={nw.netWorth}
            colored={false}
            className="mt-2 block font-display text-[2.6rem] leading-none font-semibold tracking-tight sm:text-6xl"
          />
          {change && (
            <p className="mt-3 text-sm text-note-muted">
              <Amount money={change.amount} sign="always" colored={false} className="text-sidebar-foreground" /> since{" "}
              {formatDate(change.since)}
            </p>
          )}
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-sidebar-border pt-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-note-muted">Cash and bank</dt>
              <dd>
                <Amount money={nw.liquid} colored={false} />
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-note-muted">
                <span className="size-1.5 rounded-full bg-brass" aria-hidden />
                Investments
              </dt>
              <dd>
                <Amount money={nw.holdingsValue} colored={false} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-note-muted">Broker cash</dt>
              <dd>
                <Amount money={nw.investmentCash} colored={false} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-note-muted">Owed</dt>
              <dd>
                <Amount money={nw.liabilities} colored={false} />
              </dd>
            </div>
          </dl>
          {nw.unvaluedHoldings.length > 0 && (
            <p className="mt-4 text-xs text-note-muted">
              {nw.unvaluedHoldings.length} holding{nw.unvaluedHoldings.length === 1 ? " isn’t" : "s aren’t"} counted
              yet.{" "}
              <Link href="/investments" className="text-sidebar-foreground underline underline-offset-2">
                Add a valuation
              </Link>
            </p>
          )}
        </section>

        <section aria-labelledby="trend-title" className="grid content-start gap-2 rounded-xl border bg-card p-5">
          <h2 id="trend-title" className="font-display text-lg font-semibold tracking-tight">
            Last 12 months
          </h2>
          <p className="text-xs text-muted-foreground">Net worth at each month-end.</p>
          <NetWorthTrend
            points={d.trend.map((p) => ({
              ...point(formatMonthShort(p.date), p.netWorth.netWorth),
              snapshot: p.snapshot !== null,
            }))}
          />
          <ExcludedNote excluded={nw.unconvertible.map((a) => a.balance)} stale={nw.usedStaleRate} />
        </section>
      </div>

      {/* The period only affects cash-flow figures, so its picker sits with them. */}
      <section aria-labelledby="period-title" className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h2 id="period-title" className="font-display text-xl font-semibold tracking-tight">
            {periodLabel}
          </h2>
          <p className="text-sm text-muted-foreground">Income, spending and savings in this period.</p>
        </div>
        <PeriodPicker period={period} />
      </section>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income">
          <Amount money={cf.income} />
        </Stat>
        <Stat label="Spending" note="Expenses minus refunds">
          <Amount money={cf.householdSpend} colored={false} />
        </Stat>
        <Stat label="Net cash flow">
          <Amount money={cf.netCashFlow} sign="always" />
        </Stat>
        <Stat
          label="Savings rate"
          note={cf.savingsRate === null ? "No income in this period" : "Net cash flow ÷ income"}
        >
          {cf.savingsRate === null ? "—" : formatPercent(cf.savingsRate)}
        </Stat>
      </div>
      <div className="mb-6">
        <ExcludedNote excluded={cf.excluded} stale={cf.usedStaleRate} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Spending by category" href={`/reports?tab=categories&from=${period.from}&to=${period.to}`}>
          <CategoryBars rows={d.spending.rows} total={d.spending.total} name={ctx.categoryName} />
        </Section>

        <Section title="Budgets this month" href="/budgets">
          {d.budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No budgets for this month.{" "}
              <Link className="text-primary hover:underline" href="/budgets">
                Set some
              </Link>
              .
            </p>
          ) : (
            <ul className="grid gap-3">
              {d.budgets.map((b) => (
                <li key={b.budget.id} className="grid gap-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{b.budget.categoryId ? ctx.categoryName(b.budget.categoryId) : "All spending"}</span>
                    <span className="text-muted-foreground">
                      <Amount money={b.actual} colored={false} className="text-foreground" /> of{" "}
                      <Amount money={b.budget.amount} colored={false} />
                    </span>
                  </div>
                  <Meter fraction={b.used} state={b.state} label={`${formatPercent(b.used)} of budget used`} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Account balances" href="/accounts">
          <ul className="grid divide-y">
            {d.balances.map(({ account, balance }) => (
              <li key={account.id} className="flex justify-between gap-3 py-2 text-sm">
                <Link href={`/accounts/${account.id}`} className="truncate hover:underline">
                  {account.name}
                  {account.class === "liability" && <span className="text-muted-foreground"> (owed)</span>}
                </Link>
                <Amount money={balance} colored={account.class === "asset"} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Savings goals" href="/goals">
          {d.goals.goals.filter((g) => g.goal.status === "active").length === 0 ? (
            <p className="text-sm text-muted-foreground">No active goals.</p>
          ) : (
            <ul className="grid gap-3">
              {d.goals.goals
                .filter((g) => g.goal.status === "active")
                .map(({ goal, progress }) => (
                  <li key={goal.id} className="grid gap-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <Link href={`/goals/${goal.id}`} className="hover:underline">
                        {goal.name}
                      </Link>
                      <span className="text-muted-foreground">
                        {progress.status === "ok" ? (
                          <>
                            <Amount money={progress.progress} colored={false} className="text-foreground" /> of{" "}
                            <Amount money={goal.target} colored={false} />
                          </>
                        ) : (
                          "Needs an exchange rate"
                        )}
                      </span>
                    </div>
                    {progress.status === "ok" && (
                      <Meter fraction={progress.fraction} label={`${formatPercent(progress.ratio)} of target`} />
                    )}
                  </li>
                ))}
            </ul>
          )}
        </Section>

        <Section title="Investments" href="/investments">
          {d.portfolio.holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holdings yet.{" "}
              <Link href="/investments/assets/new" className="underline">
                Add an asset
              </Link>{" "}
              to start.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Estimated value</dt>
                <dd>
                  <Amount money={d.portfolio.value} colored={false} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Unrealized</dt>
                <dd>
                  <Amount money={d.portfolio.unrealized} sign="always" />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Realized (all time)</dt>
                <dd>
                  <Amount money={d.portfolio.realized} sign="always" />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Dividends & interest</dt>
                <dd>
                  <Amount money={d.portfolio.income} colored={false} />
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="sr-only">Valuation basis</dt>
                <dd className="text-xs text-muted-foreground">
                  {d.portfolio.oldestValuation
                    ? `Manual valuations; oldest used ${formatDate(d.portfolio.oldestValuation)}.`
                    : "Your own valuations, never live prices."}
                  {d.portfolio.unvalued.length > 0 && ` ${d.portfolio.unvalued.length} unvalued, not included.`}
                </dd>
              </div>
            </dl>
          )}
        </Section>

        <Section title="Recent transactions" href="/transactions">
          {d.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <TransactionList items={d.recent} compact />
          )}
        </Section>
      </div>
    </>
  );
}
