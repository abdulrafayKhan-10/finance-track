import "server-only";
import type { IsoDate } from "@/domain/dates";
import type { Asset, AssetCashLine, HoldingMovement, Valuation } from "@/domain/investments";
import type { Account } from "@/domain/ledger";
import { dec, isCurrencyCode, Money } from "@/domain/money";
import { DataError, throwIfError } from "@/lib/errors";
import type { AssetRow, AssetValuationRow, Database } from "../supabase/database.types";
import { createClient } from "../supabase/server";

export type AssetRecord = Asset & {
  details: Record<string, unknown>;
  notes: string | null;
  updatedAt: string;
};

const ASSET_COLUMNS =
  "id, user_id, name, symbol, category, currency, quantity_scale, unit_label, valuation_mode, details, price_source, status, notes, created_at, updated_at";

function toAsset(r: AssetRow): AssetRecord | null {
  if (!isCurrencyCode(r.currency)) return null;
  return {
    id: r.id,
    name: r.name,
    symbol: r.symbol,
    category: r.category,
    currency: r.currency,
    quantityScale: r.quantity_scale,
    unitLabel: r.unit_label,
    valuationMode: r.valuation_mode,
    status: r.status,
    details: r.details ?? {},
    notes: r.notes,
    updatedAt: r.updated_at,
  };
}

export async function listAssets(): Promise<AssetRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("assets").select(ASSET_COLUMNS).order("name");
  throwIfError(error);
  return ((data ?? []) as AssetRow[]).flatMap((r) => toAsset(r) ?? []);
}

export async function insertAsset(values: Database["public"]["Tables"]["assets"]["Insert"]): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("assets").insert(values).select("id").single();
  throwIfError(error);
  return data!.id;
}

export async function updateAsset(id: string, values: Database["public"]["Tables"]["assets"]["Update"]): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("assets").update(values).eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}

/** Only possible while nothing references the asset; otherwise it must be archived (23503). */
export async function deleteAsset(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("assets").delete().eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}

// Valuations -----------------------------------------------------------------------

export async function listValuations(): Promise<Valuation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("asset_valuations")
    .select(
      "id, user_id, asset_id, valued_on, unit_price::text, entered_as, entered_total::text, quantity_at_entry::text, source, source_note, created_at, updated_at",
    )
    .order("valued_on", { ascending: false });
  throwIfError(error);
  return ((data ?? []) as unknown as AssetValuationRow[]).map((r) => ({
    id: r.id,
    assetId: r.asset_id,
    valuedOn: r.valued_on,
    unitPrice: dec(r.unit_price),
    enteredAs: r.entered_as,
    enteredTotal: r.entered_total === null ? null : dec(r.entered_total),
    quantityAtEntry: r.quantity_at_entry === null ? null : dec(r.quantity_at_entry),
    sourceNote: r.source_note,
  }));
}

export async function insertValuation(
  values: Database["public"]["Tables"]["asset_valuations"]["Insert"],
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("asset_valuations").insert(values);
  throwIfError(error);
}

export async function deleteValuation(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("asset_valuations").delete().eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}

// Movements and cash lines -------------------------------------------------------------

export async function listMovements(to?: IsoDate): Promise<HoldingMovement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("holding_movements_list", { p_to: to ?? null });
  throwIfError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    transactionId: r.transaction_id,
    accountId: r.account_id,
    assetId: r.asset_id,
    kind: r.kind,
    occurredOn: r.occurred_on,
    createdAt: r.created_at,
    quantity: dec(r.quantity),
    unitPrice: r.unit_price === null ? null : dec(r.unit_price),
    fee: dec(r.fee),
    costAmount: r.cost_amount === null ? null : dec(r.cost_amount),
  }));
}

export async function listAssetCashLines(accounts: readonly Account[], to?: IsoDate): Promise<AssetCashLine[]> {
  const supabase = await createClient();
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const { data, error } = await supabase.rpc("asset_cash_lines", { p_to: to ?? null });
  throwIfError(error);
  return (data ?? []).flatMap((r) => {
    const currency = currencyOf.get(r.account_id);
    return currency
      ? [
          {
            transactionId: r.transaction_id,
            assetId: r.asset_id,
            kind: r.kind,
            occurredOn: r.occurred_on,
            accountId: r.account_id,
            amount: Money.of(r.amount, currency),
          },
        ]
      : [];
  });
}
