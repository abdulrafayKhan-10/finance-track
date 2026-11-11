import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { InvestmentForm } from "@/components/investments/investment-form";
import { INVESTMENT_KINDS, type InvestmentKind } from "@/domain/investments/types";
import { loadFinanceContext } from "@/features/finance-context";
import { saveInvestmentTransaction } from "@/features/investments/actions";
import { emptyInvestmentValues } from "@/features/investments/form-values";
import { investmentFormOptions } from "@/features/investments/options";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New investment transaction" };

export default async function NewInvestmentTransactionPage({ searchParams }: PageProps<"/investments/new">) {
  await requireUser();
  const [ctx, query, options] = await Promise.all([loadFinanceContext(), searchParams, investmentFormOptions()]);
  const kind =
    typeof query.kind === "string" && (INVESTMENT_KINDS as readonly string[]).includes(query.kind)
      ? (query.kind as InvestmentKind)
      : "buy";
  const assetId =
    typeof query.asset === "string" && options.assets.some((a) => a.id === query.asset) ? query.asset : "";
  const onlyAccount = options.investmentAccounts.filter((a) => a.status !== "archived");
  const holding = onlyAccount.length === 1 ? onlyAccount[0]!.id : "";

  return (
    <>
      <PageHeader title="New investment transaction" />
      <InvestmentForm
        action={saveInvestmentTransaction}
        {...options}
        initial={emptyInvestmentValues({
          kind,
          occurred_on: ctx.today,
          asset_id: assetId,
          account_id: holding,
          cash_account_id: holding,
        })}
        cancelHref={assetId ? `/investments/assets/${assetId}` : "/investments"}
      />
    </>
  );
}
