import "server-only";
import { accountTotals } from "@/data/repositories/accounts";
import { listBudgets } from "@/data/repositories/budgets";
import { listTransactions, type TransactionRecord } from "@/data/repositories/transactions";
import { createClient } from "@/data/supabase/server";
import { fetchAll } from "@/data/supabase/paging";
import { isIsoDate } from "@/domain/dates";
import { averageCost, valueHoldings } from "@/domain/investments";
import { accountBalance, displayBalance } from "@/domain/ledger";
import { ASSET_CATEGORY_LABELS } from "@/lib/asset-meta";
import { BACKUP_TABLE_NAMES, BACKUP_TABLES, type BackupRow, buildBackup, PROFILE_COLUMNS } from "@/lib/backup";
import { type CsvCell, toCsv } from "@/lib/csv/csv";
import { DataError } from "@/lib/errors";
import { ACCOUNT_TYPE_LABELS, KIND_LABELS } from "@/lib/labels";
import { loadFinanceContext } from "../finance-context";
import { getGoals } from "../goals/queries";
import { loadInvestments } from "../investments/queries";
import {
  getBudgetReport,
  getCategoryReport,
  getInvestmentReport,
  getMonthlyReport,
  getYearlyReport,
} from "../reports/queries";
import { parseSearch } from "../transactions/queries";

export const EXPORT_KINDS = [
  "transactions",
  "accounts",
  "categories",
  "assets",
  "valuations",
  "holdings",
  "budgets",
  "goals",
  "allocations",
  "exchange-rates",
  "report-monthly",
  "report-categories",
  "report-budgets",
  "report-yearly",
  "report-investments",
  "backup",
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export type ExportFile = { filename: string; contentType: string; body: string };

const money = (m: { toFixed: () => string } | null | undefined) => (m ? m.toFixed() : "");
const year = (params: URLSearchParams, today: string) => {
  const y = params.get("year");
  return y && /^\d{4}$/.test(y) ? y : today.slice(0, 4);
};

/** Every transaction matching the filters, page by page (the list RPC returns at most 200). */
async function allTransactions(params: URLSearchParams, accounts: Parameters<typeof listTransactions>[0]) {
  const search = parseSearch(Object.fromEntries(params.entries()));
  const items: TransactionRecord[] = [];
  let cursor: { occurred_on: string; created_at: string; id: string } | undefined;
  for (let i = 0; i < 1000; i++) {
    const page = await listTransactions(
      accounts,
      {
        q: search.q,
        account_id: search.account,
        category_id: search.category,
        kinds: search.kind ? [search.kind] : undefined,
        status: search.status,
        from: search.from,
        to: search.to,
        tag: search.tag,
        order: "asc",
        cursor,
      },
      200,
    );
    items.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return items;
}

/** Builds one export for the signed-in user. Every figure comes from the same queries the pages use. */
export async function buildExport(kind: ExportKind, params: URLSearchParams): Promise<ExportFile> {
  const ctx = await loadFinanceContext();
  const stamp = ctx.today;
  const csv = (name: string, header: string[], rows: CsvCell[][]): ExportFile => ({
    filename: `finance-track-${name}-${stamp}.csv`,
    contentType: "text/csv; charset=utf-8",
    body: toCsv(header, rows),
  });
  const accountName = (id: string | null) => (id ? (ctx.accounts.find((a) => a.id === id)?.name ?? "") : "");
  const categoryName = (id: string | null) => (id ? ctx.categoryName(id) : "");

  switch (kind) {
    case "transactions": {
      const [items, inv] = await Promise.all([allTransactions(params, ctx.accounts), loadInvestments()]);
      const assetName = new Map(inv.assets.map((a) => [a.id, a.name]));
      const rows: CsvCell[][] = [];
      for (const t of items) {
        const common = [t.occurredOn, KIND_LABELS[t.kind], t.status, t.description, t.payee ?? ""];
        const tail = [t.assetId ? (assetName.get(t.assetId) ?? "") : "", t.notes ?? "", t.tags.join(" "), t.id];
        // One row per cash line and per holding movement, so amounts always sit next to their account.
        for (const l of t.lines) {
          rows.push([
            ...common,
            accountName(l.accountId),
            l.amount.currency,
            l.amount.toFixed(),
            categoryName(l.categoryId),
            "",
            "",
            "",
            ...tail,
          ]);
        }
        for (const m of t.movements) {
          rows.push([
            ...common,
            accountName(m.accountId),
            "",
            "",
            "",
            m.quantity.toFixed(),
            m.unitPrice?.toFixed() ?? "",
            m.fee.toFixed(),
            ...tail,
          ]);
        }
      }
      return csv(
        "transactions",
        [
          "Date",
          "Type",
          "Status",
          "Description",
          "Payee",
          "Account",
          "Currency",
          "Amount",
          "Category",
          "Quantity",
          "Unit price",
          "Fee",
          "Asset",
          "Notes",
          "Tags",
          "Transaction ID",
        ],
        rows,
      );
    }
    case "accounts": {
      const postings = await accountTotals(ctx.accounts);
      return csv(
        "accounts",
        [
          "Name",
          "Type",
          "Currency",
          "Opening balance",
          "Opening date",
          "Balance today",
          "Status",
          "In net worth",
          "Institution",
          "Notes",
        ],
        ctx.accounts.map((a) => [
          a.name,
          ACCOUNT_TYPE_LABELS[a.type],
          a.currency,
          displayBalance(a, a.openingBalance).toFixed(),
          a.openingDate,
          displayBalance(a, accountBalance(a, postings)).toFixed(),
          a.status,
          a.includeInNetWorth ? "yes" : "no",
          a.institution ?? "",
          a.notes ?? "",
        ]),
      );
    }
    case "categories":
      return csv(
        "categories",
        ["Name", "Kind", "Parent", "Archived", "System"],
        ctx.categories.map((c) => [
          c.name,
          c.kind,
          categoryName(c.parentId),
          c.isArchived ? "yes" : "no",
          c.systemKey ? "yes" : "no",
        ]),
      );
    case "assets": {
      const inv = await loadInvestments();
      return csv(
        "assets",
        ["Name", "Symbol", "Category", "Currency", "Unit", "Decimal places", "Valuation", "Status", "Details", "Notes"],
        inv.assets.map((a) => [
          a.name,
          a.symbol ?? "",
          ASSET_CATEGORY_LABELS[a.category],
          a.currency,
          a.unitLabel,
          a.quantityScale,
          a.valuationMode === "par" ? "par value" : "manual",
          a.status,
          Object.entries(a.details)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join("; "),
          a.notes ?? "",
        ]),
      );
    }
    case "valuations": {
      const inv = await loadInvestments();
      const asset = new Map(inv.assets.map((a) => [a.id, a]));
      return csv(
        "valuations",
        ["Asset", "Date", "Currency", "Unit price", "Entered as", "Total entered", "Quantity at entry", "Source"],
        inv.valuations.map((v) => [
          asset.get(v.assetId)?.name ?? "",
          v.valuedOn,
          asset.get(v.assetId)?.currency ?? "",
          v.unitPrice.toFixed(),
          v.enteredAs === "total_value" ? "total value" : "unit price",
          v.enteredTotal?.toFixed() ?? "",
          v.quantityAtEntry?.toFixed() ?? "",
          v.sourceNote ?? "",
        ]),
      );
    }
    case "holdings": {
      const inv = await loadInvestments();
      const holdings = valueHoldings(inv, ctx.today, ctx.profile.baseCurrency, ctx.rates);
      return csv(
        "holdings",
        [
          "Asset",
          "Account",
          "Quantity",
          "Unit",
          "Currency",
          "Cost basis",
          "Average cost",
          "Valuation date",
          "Unit value",
          "Estimated value",
          "Unrealized",
          `Value in ${ctx.profile.baseCurrency}`,
        ],
        holdings.map((h) => {
          const v = h.valuation;
          return [
            h.asset.name,
            accountName(h.position.accountId),
            h.position.quantity.toFixed(),
            h.asset.unitLabel,
            h.asset.currency,
            h.position.costBasis.toFixed(),
            money(averageCost(h.position)),
            v.status === "valued" ? (v.basis === "par" ? "par value" : v.valuedOn) : "unvalued",
            v.status === "valued" ? v.unitPrice.toFixed() : "",
            v.status === "valued" ? v.value.toFixed() : "",
            v.status === "valued" ? v.unrealized.toFixed() : "",
            v.status === "valued" ? money(h.converted) : "",
          ];
        }),
      );
    }
    case "budgets": {
      const budgets = await listBudgets("1900-01", "2999-12");
      return csv(
        "budgets",
        ["Month", "Category", "Amount", "Currency"],
        budgets.map((b) => [
          b.month,
          b.categoryId ? categoryName(b.categoryId) : "Overall",
          b.amount.toFixed(),
          b.amount.currency,
        ]),
      );
    }
    case "goals": {
      const { goals } = await getGoals();
      return csv(
        "goals",
        ["Name", "Target", "Currency", "Target date", "Funded by", "Status", "Progress"],
        goals.map(({ goal, progress, linkedAccountName }) => [
          goal.name,
          goal.target.toFixed(),
          goal.target.currency,
          goal.targetDate ?? "",
          goal.fundingMode === "linked_account" ? `Account: ${linkedAccountName ?? ""}` : "Allocations",
          goal.status,
          progress.status === "ok" ? progress.progress.toFixed() : "unavailable",
        ]),
      );
    }
    case "allocations": {
      const { goals } = await getGoals();
      return csv(
        "allocations",
        ["Goal", "Date", "Amount", "Currency", "From account", "Note"],
        goals.flatMap(({ goal, allocations }) =>
          allocations.map((a) => [
            goal.name,
            a.on,
            a.amount.toFixed(),
            a.amount.currency,
            accountName(a.sourceAccountId),
            a.note ?? "",
          ]),
        ),
      );
    }
    case "exchange-rates":
      return csv(
        "exchange-rates",
        ["Base", "Quote", "Rate (1 base = rate quote)", "Effective from", "Source"],
        ctx.rates.map((r) => [r.base, r.quote, r.rate.toString(), r.effectiveOn, r.sourceNote ?? ""]),
      );
    case "report-monthly": {
      const y = year(params, ctx.today);
      const { months } = await getMonthlyReport(y);
      return csv(
        `monthly-${y}`,
        [
          "Month",
          "Income",
          "Spending",
          "Net cash flow",
          "Savings rate",
          "Investment income",
          "Investment fees",
          "Adjustments",
          "Currency",
        ],
        months.map(({ month, summary: s }) => [
          month,
          s.income.toFixed(),
          s.householdSpend.toFixed(),
          s.netCashFlow.toFixed(),
          s.savingsRate ? s.savingsRate.times(100).toFixed(1) + "%" : "n/a",
          s.investmentIncome.toFixed(),
          s.investmentCosts.toFixed(),
          s.adjustments.toFixed(),
          s.currency,
        ]),
      );
    }
    case "report-categories": {
      const from = params.get("from");
      const to = params.get("to");
      const period = {
        from: from && isIsoDate(from) ? from : `${ctx.today.slice(0, 7)}-01`,
        to: to && isIsoDate(to) ? to : ctx.today,
      };
      const report = await getCategoryReport(period);
      return csv(
        `categories-${period.from}-to-${period.to}`,
        ["Category", "Subcategory", "Net spending", "Currency"],
        report.rows.flatMap((r) => [
          [categoryName(r.categoryId) || "No category", "", r.amount.toFixed(), r.amount.currency],
          ...r.children
            .filter((c) => c.categoryId !== r.categoryId)
            .map((c) => [
              categoryName(r.categoryId),
              categoryName(c.categoryId),
              c.amount.toFixed(),
              c.amount.currency,
            ]),
        ]),
      );
    }
    case "report-budgets": {
      const y = year(params, ctx.today);
      const { statuses } = await getBudgetReport(y);
      return csv(
        `budgets-${y}`,
        ["Month", "Category", "Budget", "Actual", "Remaining", "Used", "Status", "Currency"],
        statuses.map((s) => [
          s.budget.month,
          s.budget.categoryId ? categoryName(s.budget.categoryId) : "Overall",
          s.budget.amount.toFixed(),
          s.actual.toFixed(),
          s.remaining.toFixed(),
          s.used.times(100).toFixed(0) + "%",
          s.state,
          s.budget.amount.currency,
        ]),
      );
    }
    case "report-yearly": {
      const { years } = await getYearlyReport();
      return csv(
        "yearly",
        ["Year", "Income", "Spending", "Net cash flow", "Savings rate", "Currency"],
        years.map((y) => [
          y.year,
          y.income.toFixed(),
          y.householdSpend.toFixed(),
          y.netCashFlow.toFixed(),
          y.savingsRate ? y.savingsRate.times(100).toFixed(1) + "%" : "n/a",
          y.income.currency,
        ]),
      );
    }
    case "report-investments": {
      const y = year(params, ctx.today);
      const { months } = await getInvestmentReport(y);
      return csv(
        `investments-${y}`,
        ["Month", "Dividends & interest", "Realized gain", "Investment fees", "Currency"],
        months.map((m) => [m.month, m.income.toFixed(), m.realized.toFixed(), m.fees.toFixed(), m.income.currency]),
      );
    }
    case "backup": {
      const backup = await exportBackup(new Date().toISOString());
      return {
        filename: `finance-track-backup-${stamp}.json`,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(backup),
      };
    }
  }
}

/** The full JSON backup: every user table with ids, read page by page. */
async function exportBackup(exportedAt: string) {
  const supabase = await createClient();
  // The typed client only knows the tables the app queries; the backup reads them all by name.
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        order: (c: string) => {
          range: (a: number, b: number) => PromiseLike<{ data: BackupRow[] | null; error: { code?: string } | null }>;
        };
        single: () => PromiseLike<{ data: BackupRow | null; error: { code?: string } | null }>;
      };
    };
  };
  const profile = await db.from("profiles").select(PROFILE_COLUMNS).single();
  if (profile.error) throw new DataError(profile.error.code ?? "unknown");
  const tables = {} as Record<(typeof BACKUP_TABLE_NAMES)[number], BackupRow[]>;
  for (const t of BACKUP_TABLE_NAMES) {
    const r = await fetchAll((a, b) => db.from(t).select(BACKUP_TABLES[t]).order("id").range(a, b));
    if (r.error) throw new DataError(r.error.code ?? "unknown");
    tables[t] = r.data;
  }
  return buildBackup(profile.data, tables, exportedAt);
}
