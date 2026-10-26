import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { point } from "@/components/charts/chart-data";
import { NetWorthTrend } from "@/components/charts/net-worth-trend";
import { CategoryBars } from "@/components/figures/category-bars";
import { ExcludedNote } from "@/components/figures/excluded-note";
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
    <section className="grid content-start gap-3 rounded-xl border bg-card p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
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

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Dashboard" description={`Figures for ${periodLabel.toLowerCase()} · balances as of today`} />
        <PeriodPicker period={period} />
      </div>

      <section
        aria-label="Net worth"
        className="mb-6 grid gap-4 rounded-xl border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
      >
        <div className="grid content-start gap-3">
          <span className="text-sm text-muted-foreground">Net worth today</span>
          <Amount money={nw.netWorth} className="text-4xl font-semibold tracking-tight md:text-5xl" />
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Cash and bank (liquid)</dt>
              <dd>
                <Amount money={nw.liquid} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Investment accounts (cash)</dt>
              <dd>
                <Amount money={nw.investmentCash} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">All assets</dt>
              <dd>
                <Amount money={nw.assets} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Owed</dt>
              <dd>
                <Amount money={nw.liabilities} colored={false} />
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Investment holdings are valued from Phase 5; until then only cash is counted.
          </p>
          <ExcludedNote excluded={nw.unconvertible.map((a) => a.balance)} stale={nw.usedStaleRate} />
        </div>
        <div className="grid content-start gap-1">
          <span className="text-sm text-muted-foreground">Last 12 months (month-end)</span>
          <NetWorthTrend
            points={d.trend.map((p) => ({
              ...point(formatMonthShort(p.date), p.netWorth.netWorth),
              snapshot: p.snapshot !== null,
            }))}
          />
        </div>
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

        <Section title="Investments">
          <p className="text-sm text-muted-foreground">
            Portfolio valuation arrives in Phase 5, using your own dated manual valuations.
          </p>
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
