import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { ExcludedNote } from "@/components/figures/excluded-note";
import { Meter } from "@/components/figures/meter";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Amount } from "@/components/money/amount";
import { ActionForm } from "@/components/planning/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMonths, isIsoMonth, monthOf } from "@/domain/dates";
import { copyPreviousMonth, removeBudget, saveBudget } from "@/features/budgets/actions";
import { type BudgetRowView, getBudgetMonth } from "@/features/budgets/queries";
import { loadFinanceContext } from "@/features/finance-context";
import { requireUser } from "@/lib/auth";
import { formatMonthLong, formatMonthShort, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Budgets" };

function BudgetRow({ row, month, currency }: { row: BudgetRowView; month: string; currency: string }) {
  const s = row.status;
  return (
    <li className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)] md:items-center">
      <div className="grid gap-1">
        <span className="font-medium">{row.name}</span>
        <span className="text-xs text-muted-foreground">
          Spent <Amount money={row.spent} colored={false} className="text-foreground" />
          {s && (
            <>
              {" "}
              · {s.remaining.isNegative() ? "over by " : "left "}
              <Amount
                money={s.remaining.abs()}
                colored={false}
                className={s.remaining.isNegative() ? "text-destructive" : "text-foreground"}
              />
            </>
          )}
        </span>
        {s && (
          <Meter fraction={s.used} state={s.state} label={`${row.name}: ${formatPercent(s.used)} of budget used`} />
        )}
      </div>
      <ActionForm
        action={saveBudget}
        fields={{ month, category_id: row.categoryId ?? "" }}
        submitLabel={s ? "Update" : "Set"}
        variant="secondary"
        className="flex flex-wrap items-start gap-2"
      >
        <label className="sr-only" htmlFor={`amount-${row.categoryId ?? "all"}`}>
          Budget for {row.name} ({currency})
        </label>
        <Input
          id={`amount-${row.categoryId ?? "all"}`}
          name="amount"
          inputMode="decimal"
          placeholder={`Budget (${currency})`}
          defaultValue={s ? s.budget.amount.toFixed() : ""}
          className="w-36"
        />
      </ActionForm>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex gap-3">
          {row.history.map((h) => (
            <span key={h.month} className="grid">
              <span>{formatMonthShort(h.month)}</span>
              <Amount money={h.spent} colored={false} className="text-foreground" />
            </span>
          ))}
        </span>
        {s && (
          <ConfirmAction
            action={removeBudget}
            fields={{ id: s.budget.id }}
            triggerLabel="Remove"
            title={`Remove the ${row.name} budget for ${formatMonthLong(month)}?`}
            description="Spending is not affected; only the limit is removed."
            confirmLabel="Remove budget"
          />
        )}
      </div>
    </li>
  );
}

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  await requireUser();
  const ctx = await loadFinanceContext();
  const params = await searchParams;
  const month = typeof params.month === "string" && isIsoMonth(params.month) ? params.month : monthOf(ctx.today);
  const data = await getBudgetMonth(month);

  return (
    <>
      <PageHeader
        title="Budgets"
        description={`Monthly limits in ${data.currency}. Spending is expenses minus refunds; transfers, card payments and investments never count.`}
      />
      <nav aria-label="Month" className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon">
          <Link href={`/budgets?month=${addMonths(month, -1)}`} aria-label="Previous month">
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <span className="min-w-40 text-center font-medium">{formatMonthLong(month)}</span>
        <Button asChild variant="outline" size="icon">
          <Link href={`/budgets?month=${addMonths(month, 1)}`} aria-label="Next month">
            <ChevronRight aria-hidden />
          </Link>
        </Button>
        {month !== monthOf(ctx.today) && (
          <Link href="/budgets" className="text-sm text-primary hover:underline">
            This month
          </Link>
        )}
        <ActionForm
          action={copyPreviousMonth}
          fields={{ month }}
          submitLabel="Copy last month's budgets"
          variant="ghost"
          className="ml-auto grid gap-1"
        />
      </nav>
      <div className="mb-4">
        <ExcludedNote excluded={data.excluded} />
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Budgets cover a category and its subcategories. The right-hand figures are spending in the previous{" "}
        {data.overall.history.length} months.
      </p>
      <ul className="grid divide-y rounded-xl border">
        <BudgetRow row={data.overall} month={month} currency={data.currency} />
        {data.rows.map((row) => (
          <BudgetRow key={row.categoryId} row={row} month={month} currency={data.currency} />
        ))}
      </ul>
    </>
  );
}
