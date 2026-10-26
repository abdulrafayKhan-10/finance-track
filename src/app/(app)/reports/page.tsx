import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { IncomeExpenseChart } from "@/components/charts/income-expense";
import { CategoryBars } from "@/components/figures/category-bars";
import { ExcludedNote } from "@/components/figures/excluded-note";
import { Amount } from "@/components/money/amount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firstDay, isIsoDate, lastDay, monthOf } from "@/domain/dates";
import { loadFinanceContext } from "@/features/finance-context";
import { getBudgetReport, getCategoryReport, getMonthlyReport, getYearlyReport } from "@/features/reports/queries";
import { requireUser } from "@/lib/auth";
import { formatDate, formatMoney, formatMonthLong, formatMonthShort, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

const TABS = [
  { key: "monthly", label: "Monthly" },
  { key: "categories", label: "Categories" },
  { key: "budgets", label: "Budgets" },
  { key: "yearly", label: "Yearly" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function YearNav({ tab, year, current }: { tab: Tab; year: number; current: number }) {
  return (
    <nav aria-label="Year" className="mb-4 flex items-center gap-3 text-sm">
      <Link className="text-primary hover:underline" href={`/reports?tab=${tab}&year=${year - 1}`}>
        ← {year - 1}
      </Link>
      <span className="font-medium">{year}</span>
      {year < current && (
        <Link className="text-primary hover:underline" href={`/reports?tab=${tab}&year=${year + 1}`}>
          {year + 1} →
        </Link>
      )}
    </nav>
  );
}

async function Monthly({ year, current }: { year: number; current: number }) {
  const { months, total } = await getMonthlyReport(String(year));
  return (
    <>
      <YearNav tab="monthly" year={year} current={current} />
      <IncomeExpenseChart
        points={months.map((m) => ({
          label: formatMonthShort(m.month),
          a: Number(m.summary.income.toFixed()),
          aDisplay: formatMoney(m.summary.income),
          b: Number(m.summary.householdSpend.toFixed()),
          bDisplay: formatMoney(m.summary.householdSpend),
        }))}
      />
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">Income, spending, net cash flow and savings rate per month</caption>
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">
                Month
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Income
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Spending
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Net cash flow
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Savings rate
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Investment income
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {months.map(({ month, summary: s }) => (
              <tr key={month}>
                <td className="py-2 pr-3">{formatMonthLong(month)}</td>
                <td className="py-2 pr-3 text-right">
                  <Amount money={s.income} />
                </td>
                <td className="py-2 pr-3 text-right">
                  <Amount money={s.householdSpend} colored={false} />
                </td>
                <td className="py-2 pr-3 text-right">
                  <Amount money={s.netCashFlow} sign="always" />
                </td>
                <td className="py-2 pr-3 text-right">{s.savingsRate === null ? "—" : formatPercent(s.savingsRate)}</td>
                <td className="py-2 text-right">
                  <Amount money={s.investmentIncome} />
                </td>
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot className="border-t font-medium">
              <tr>
                <td className="py-2 pr-3">{year}</td>
                <td className="py-2 pr-3 text-right">
                  <Amount money={total.income} />
                </td>
                <td className="py-2 pr-3 text-right">
                  <Amount money={total.householdSpend} colored={false} />
                </td>
                <td className="py-2 pr-3 text-right">
                  <Amount money={total.netCashFlow} sign="always" />
                </td>
                <td className="py-2 pr-3 text-right">
                  {total.savingsRate === null ? "—" : formatPercent(total.savingsRate)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Income includes dividends and interest. Spending is expenses minus refunds. Transfers, adjustments and
        investment purchases are not included. Savings rate is net cash flow ÷ income, shown as “—” when there was no
        income.
      </p>
      {total && (
        <div className="mt-3">
          <ExcludedNote excluded={total.excluded} />
        </div>
      )}
    </>
  );
}

async function Categories({ from, to }: { from: string; to: string }) {
  const r = await getCategoryReport({ from, to });
  return (
    <>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="categories" />
        <div className="grid gap-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={from} className="w-auto" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={to} className="w-auto" />
        </div>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </form>
      <p className="mb-4 text-sm text-muted-foreground">
        {formatDate(from)} – {formatDate(to)} · total spending{" "}
        <Amount money={r.total} colored={false} className="text-foreground" />
      </p>
      <CategoryBars rows={r.rows} total={r.total} name={r.ctx.categoryName} limit={20} />
      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-muted-foreground">Breakdown by subcategory</summary>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y">
            {r.rows.map((row) => (
              <tr key={row.categoryId ?? "none"} className="align-top">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {r.ctx.categoryName(row.categoryId)}
                </th>
                <td className="py-2">
                  <ul className="grid gap-0.5">
                    {row.children.map((c) => (
                      <li key={c.categoryId} className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{r.ctx.categoryName(c.categoryId)}</span>
                        <Amount money={c.amount} colored={false} />
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <div className="mt-3">
        <ExcludedNote excluded={r.excluded} />
      </div>
    </>
  );
}

async function Budgets({ year, current }: { year: number; current: number }) {
  const { statuses, ctx } = await getBudgetReport(String(year));
  return (
    <>
      <YearNav tab="budgets" year={year} current={current} />
      {statuses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No budgets in {year}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Month
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Budget
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Budgeted
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Actual
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Used
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {statuses.map((s) => (
                <tr key={s.budget.id}>
                  <td className="py-2 pr-3">{formatMonthShort(s.budget.month)}</td>
                  <td className="py-2 pr-3">
                    {s.budget.categoryId ? ctx.categoryName(s.budget.categoryId) : "All spending"}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Amount money={s.budget.amount} colored={false} />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Amount money={s.actual} colored={false} />
                  </td>
                  <td className={cn("py-2 text-right", s.state === "over" && "text-destructive")}>
                    {formatPercent(s.used)}
                    {s.state === "over" && " (over)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

async function Yearly() {
  const { years } = await getYearlyReport();
  if (years.length === 0) return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="border-b text-left text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="py-2 pr-3 font-medium">
            Year
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">
            Income
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">
            Spending
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">
            Net cash flow
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            Savings rate
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {years.map((y) => (
          <tr key={y.year}>
            <td className="py-2 pr-3">
              <Link className="hover:underline" href={`/reports?tab=monthly&year=${y.year}`}>
                {y.year}
              </Link>
            </td>
            <td className="py-2 pr-3 text-right">
              <Amount money={y.income} />
            </td>
            <td className="py-2 pr-3 text-right">
              <Amount money={y.householdSpend} colored={false} />
            </td>
            <td className="py-2 pr-3 text-right">
              <Amount money={y.netCashFlow} sign="always" />
            </td>
            <td className="py-2 text-right">{y.savingsRate === null ? "—" : formatPercent(y.savingsRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireUser();
  const ctx = await loadFinanceContext();
  const p = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === p.tab)?.key ?? "monthly";
  const current = Number(ctx.today.slice(0, 4));
  const yearParam = Number(p.year);
  const year = Number.isInteger(yearParam) && yearParam >= 1900 && yearParam <= current ? yearParam : current;
  const from = typeof p.from === "string" && isIsoDate(p.from) ? p.from : firstDay(monthOf(ctx.today));
  const toRaw = typeof p.to === "string" && isIsoDate(p.to) ? p.to : lastDay(monthOf(ctx.today));
  const to = toRaw < from ? from : toRaw;

  return (
    <>
      <PageHeader
        title="Reports"
        description={`All figures in ${ctx.profile.baseCurrency}, each amount converted at the rate on its own date.`}
      />
      <nav aria-label="Report" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/reports?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              tab === t.key
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "monthly" && <Monthly year={year} current={current} />}
      {tab === "categories" && <Categories from={from} to={to} />}
      {tab === "budgets" && <Budgets year={year} current={current} />}
      {tab === "yearly" && <Yearly />}
      <p className="mt-8 text-xs text-muted-foreground">CSV export of reports arrives in Phase 6.</p>
    </>
  );
}
