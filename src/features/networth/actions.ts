"use server";

import { revalidatePath } from "next/cache";
import { listAccounts } from "@/data/repositories/accounts";
import { listExchangeRates } from "@/data/repositories/exchange-rates";
import { ledgerLines } from "@/data/repositories/ledger";
import { getProfile } from "@/data/repositories/profile";
import { deleteSnapshot, insertSnapshot } from "@/data/repositories/snapshots";
import { todayIn } from "@/domain/dates";
import { computeNetWorth, NET_WORTH_METHOD_VERSION, snapshotDetails } from "@/domain/networth/networth";
import { requireUser } from "@/lib/auth";
import { isoDate, uuid } from "@/lib/validation/form";
import { type ActionState, failure } from "../action-state";

/**
 * Freezes the net worth as of a date (today by default). The figures come
 * from the same domain function the pages use, with every input stored.
 */
export async function createSnapshot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const raw = formData.get("as_of");
  try {
    const profile = await getProfile();
    const today = todayIn(profile.timezone);
    const asOf = typeof raw === "string" && raw ? isoDate.safeParse(raw) : { success: true as const, data: today };
    if (!asOf.success) return { fieldErrors: { as_of: "Enter a valid date." } };
    if (asOf.data > today) return { fieldErrors: { as_of: "Snapshots can't be in the future." } };
    const [accounts, rates] = await Promise.all([listAccounts(), listExchangeRates()]);
    const lines = await ledgerLines(accounts, undefined, asOf.data);
    const nw = computeNetWorth(accounts, lines, asOf.data, profile.baseCurrency, rates);
    await insertSnapshot({
      as_of: asOf.data,
      base_currency: profile.baseCurrency,
      total_assets: nw.assets.toStorage(),
      total_liabilities: nw.liabilities.toStorage(),
      net_worth: nw.netWorth.toStorage(),
      method_version: NET_WORTH_METHOD_VERSION,
      details: snapshotDetails(nw),
    });
  } catch (error) {
    return failure(error, { "23505": "There is already a snapshot for that date. Delete it first to take a new one." });
  }
  revalidatePath("/net-worth");
  revalidatePath("/");
  return { success: "Snapshot saved." };
}

export async function removeSnapshot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("a snapshot").safeParse(formData.get("id"));
  if (!id.success) return { error: "That snapshot no longer exists." };
  try {
    await deleteSnapshot(id.data);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/net-worth");
  return { success: "Snapshot deleted." };
}
