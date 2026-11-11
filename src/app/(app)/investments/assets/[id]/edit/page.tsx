import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { AssetForm } from "@/components/investments/asset-form";
import { saveAsset } from "@/features/investments/actions";
import { getAssetPage } from "@/features/investments/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit asset" };

export default async function EditAssetPage({ params }: PageProps<"/investments/assets/[id]/edit">) {
  await requireUser();
  const { id } = await params;
  const page = await getAssetPage(id);
  if (!page) notFound();
  const { asset } = page;
  return (
    <>
      <PageHeader title={`Edit ${asset.name}`} />
      <AssetForm
        action={saveAsset}
        locked={page.hasHistory}
        initial={{
          id: asset.id,
          name: asset.name,
          symbol: asset.symbol ?? "",
          category: asset.category,
          currency: asset.currency,
          unit_label: asset.unitLabel,
          quantity_scale: String(asset.quantityScale),
          valuation_mode: asset.valuationMode,
          notes: asset.notes ?? "",
          details: Object.fromEntries(
            Object.entries(asset.details).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
          ),
        }}
      />
    </>
  );
}
