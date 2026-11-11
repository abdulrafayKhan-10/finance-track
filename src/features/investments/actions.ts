"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listAccounts } from "@/data/repositories/accounts";
import {
  deleteAsset,
  deleteValuation,
  insertAsset,
  insertValuation,
  listAssets,
  listMovements,
  updateAsset,
} from "@/data/repositories/investments";
import { createTransactionRpc, getTransaction, updateTransactionRpc } from "@/data/repositories/transactions";
import { quantityOn, unitPriceFromTotal } from "@/domain/investments";
import { requireUser } from "@/lib/auth";
import { withNotice } from "@/lib/notice";
import { uuid } from "@/lib/validation/form";
import { parseAssetForm, parseInvestmentForm, parseValuationForm } from "@/lib/validation/investments";
import { type ActionState, failure } from "../action-state";

const ASSET_ERRORS = {
  "23505": "You already have an asset with that name.",
  "23514": "Par value is only available for fixed income and cash-like assets.",
  FT002:
    "This asset already has transactions or valuations, so its currency can't change and its decimal places can't drop below what is recorded.",
};

const TX_ERRORS = {
  FT008: "That would sell or remove more than the account holds on that date. Check the quantity and the date.",
  FT009: "This asset is archived. Restore it before recording new transactions.",
  FT001: "That transaction doesn't add up. Check the accounts, quantity, price and amounts.",
};

function revalidateInvestments(assetId?: string | null) {
  revalidatePath("/investments", "layout");
  if (assetId) revalidatePath(`/investments/assets/${assetId}`);
  revalidatePath("/transactions");
  revalidatePath("/accounts", "layout");
  revalidatePath("/net-worth");
  revalidatePath("/");
}

const optionalId = (raw: FormDataEntryValue | null, label: string) =>
  typeof raw === "string" && raw ? uuid(label).safeParse(raw) : null;

// Assets ---------------------------------------------------------------------------------

export async function saveAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = optionalId(formData.get("id"), "an asset");
  if (id && !id.success) return { error: "That asset no longer exists." };
  const parsed = parseAssetForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  let assetId: string;
  try {
    const values = parsed.values;
    if (id) {
      await updateAsset(id.data, values);
      assetId = id.data;
    } else {
      assetId = await insertAsset(values);
    }
  } catch (error) {
    return failure(error, ASSET_ERRORS);
  }
  revalidateInvestments(assetId);
  redirect(withNotice(`/investments/assets/${assetId}`, "asset_saved"));
}

export async function setAssetStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("an asset").safeParse(formData.get("id"));
  const status = formData.get("status");
  if (!id.success || (status !== "active" && status !== "archived")) return { error: "That asset no longer exists." };
  try {
    await updateAsset(id.data, { status });
  } catch (error) {
    return failure(error);
  }
  revalidateInvestments(id.data);
  return { success: status === "archived" ? "Archived. Its history stays." : "Restored." };
}

export async function removeAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("an asset").safeParse(formData.get("id"));
  if (!id.success) return { error: "That asset no longer exists." };
  try {
    await deleteAsset(id.data);
  } catch (error) {
    return failure(error, { "23503": "This asset has transactions, so it can only be archived." });
  }
  revalidateInvestments();
  redirect(withNotice("/investments", "asset_deleted"));
}

// Valuations -------------------------------------------------------------------------------

export async function addValuation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  try {
    const assets = await listAssets();
    const asset = assets.find((a) => a.id === formData.get("asset_id"));
    if (!asset) return { error: "That asset no longer exists." };
    const parsed = parseValuationForm(formData, asset);
    if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
    const v = parsed.values;
    if (v.enteredAs === "unit_price") {
      await insertValuation({
        asset_id: asset.id,
        valued_on: v.valuedOn,
        unit_price: v.unitPrice.toString(),
        entered_as: "unit_price",
        source_note: v.sourceNote,
      });
    } else {
      // A total covers everything held on that date, across accounts.
      const quantity = quantityOn(await listMovements(v.valuedOn), null, asset.id, v.valuedOn);
      const unitPrice = unitPriceFromTotal(v.total, quantity);
      if (!unitPrice) {
        return {
          fieldErrors: { amount: "You held none of this asset on that date. Enter a price per unit instead." },
        };
      }
      await insertValuation({
        asset_id: asset.id,
        valued_on: v.valuedOn,
        unit_price: unitPrice.toString(),
        entered_as: "total_value",
        entered_total: v.total.toStorage(),
        quantity_at_entry: quantity.toString(),
        source_note: v.sourceNote,
      });
    }
    revalidateInvestments(asset.id);
  } catch (error) {
    return failure(error, {
      "23505": "There is already a valuation for that date. Delete it first to replace it.",
    });
  }
  return { success: "Valuation saved." };
}

export async function removeValuation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("a valuation").safeParse(formData.get("id"));
  if (!id.success) return { error: "That valuation no longer exists." };
  try {
    await deleteValuation(id.data);
  } catch (error) {
    return failure(error);
  }
  revalidateInvestments(typeof formData.get("asset_id") === "string" ? String(formData.get("asset_id")) : null);
  return { success: "Valuation deleted." };
}

// Transactions ---------------------------------------------------------------------------------

/** Creates an investment transaction, or replaces one when `id` is present. */
export async function saveInvestmentTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = optionalId(formData.get("id"), "a transaction");
  if (id && !id.success) return { error: "That transaction no longer exists." };
  let savedId: string;
  let assetId: string | null | undefined;
  try {
    const [accounts, assets] = await Promise.all([listAccounts(), listAssets()]);
    const parsed = parseInvestmentForm(formData, accounts, assets);
    if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
    assetId = parsed.values.asset_id;
    if (id) {
      const existing = await getTransaction(accounts, id.data);
      if (!existing) return { error: "That transaction no longer exists." };
      await updateTransactionRpc(
        id.data,
        parsed.values,
        String(formData.get("expected_updated_at") ?? ""),
        formData.get("unlock") === "on",
      );
      savedId = id.data;
    } else {
      savedId = await createTransactionRpc(parsed.values);
    }
  } catch (error) {
    return failure(error, TX_ERRORS);
  }
  revalidateInvestments(assetId);
  redirect(withNotice(assetId ? `/investments/assets/${assetId}` : `/transactions/${savedId}`, "saved"));
}
