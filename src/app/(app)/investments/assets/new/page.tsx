import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { AssetForm } from "@/components/investments/asset-form";
import { loadFinanceContext } from "@/features/finance-context";
import { saveAsset } from "@/features/investments/actions";
import { CATEGORY_DEFAULTS } from "@/lib/asset-meta";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New asset" };

export default async function NewAssetPage() {
  await requireUser();
  const ctx = await loadFinanceContext();
  return (
    <>
      <PageHeader
        title="New asset"
        description="Something you hold a quantity of. You record what you hold with transactions, and what it is worth with valuations."
      />
      <AssetForm
        action={saveAsset}
        locked={false}
        initial={{
          name: "",
          symbol: "",
          category: "stock_etf",
          currency: ctx.profile.baseCurrency,
          unit_label: CATEGORY_DEFAULTS.stock_etf.unitLabel,
          quantity_scale: String(CATEGORY_DEFAULTS.stock_etf.quantityScale),
          valuation_mode: "manual",
          notes: "",
          details: {},
        }}
      />
    </>
  );
}
