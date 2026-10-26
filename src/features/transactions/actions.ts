"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listAccounts } from "@/data/repositories/accounts";
import {
  createTransactionRpc,
  deleteTransactionRpc,
  getTransaction,
  updateTransactionRpc,
} from "@/data/repositories/transactions";
import { EntryError } from "@/domain/ledger";
import { requireUser } from "@/lib/auth";
import { withNotice } from "@/lib/notice";
import { safeNextPath } from "@/lib/safe-redirect";
import { uuid } from "@/lib/validation/form";
import { parseTransactionForm } from "@/lib/validation/transactions";
import { type ActionState, failure } from "../action-state";
import { toTransactionPayload } from "./payload";

function revalidateLedger() {
  revalidatePath("/transactions");
  revalidatePath("/accounts", "layout");
  revalidatePath("/");
}

/** Creates a transaction, or replaces one when `id` is present. */
export async function saveTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? uuid("a transaction").safeParse(rawId) : null;
  if (id && !id.success) return { error: "That transaction no longer exists." };

  let savedId: string;
  try {
    const accounts = await listAccounts();
    const parsed = parseTransactionForm(formData, accounts);
    if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

    if (id) {
      const existing = await getTransaction(accounts, id.data);
      if (!existing) return { error: "That transaction no longer exists." };
      const expected = String(formData.get("expected_updated_at") ?? "");
      const payload = toTransactionPayload(parsed.entry, parsed.meta, existing.refundOfId);
      await updateTransactionRpc(id.data, payload, expected, formData.get("unlock") === "on");
      savedId = id.data;
    } else {
      savedId = await createTransactionRpc(toTransactionPayload(parsed.entry, parsed.meta));
    }
  } catch (error) {
    if (error instanceof EntryError) return { error: error.message };
    return failure(error);
  }
  revalidateLedger();
  redirect(withNotice(safeNextPath(formData.get("return_to"), `/transactions/${savedId}`), "saved"));
}

export async function deleteTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("a transaction").safeParse(formData.get("id"));
  if (!id.success) return { error: "That transaction no longer exists." };
  try {
    await deleteTransactionRpc(
      id.data,
      String(formData.get("expected_updated_at") ?? ""),
      formData.get("unlock") === "on",
    );
  } catch (error) {
    return failure(error);
  }
  revalidateLedger();
  redirect(withNotice(safeNextPath(formData.get("return_to"), "/transactions"), "deleted"));
}
