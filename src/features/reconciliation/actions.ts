"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccount } from "@/data/repositories/accounts";
import { deleteReconciliationRow, reconcileRpc } from "@/data/repositories/reconciliations";
import { storedFromDisplay } from "@/domain/ledger";
import { parseAmount } from "@/domain/money";
import { requireUser } from "@/lib/auth";
import { withNotice } from "@/lib/notice";
import { AMOUNT_ERRORS, checkbox, isoDate, optionalText, uuid } from "@/lib/validation/form";
import { type ActionState, failure } from "../action-state";

export async function reconcile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const accountId = uuid("an account").safeParse(formData.get("account_id"));
  const date = isoDate.safeParse(formData.get("statement_date"));
  const note = optionalText(500).safeParse(formData.get("note") ?? "");
  if (!accountId.success) return { error: "That account no longer exists." };
  if (!date.success) return { fieldErrors: { statement_date: date.error.issues[0]?.message } };
  if (!note.success) return { fieldErrors: { note: note.error.issues[0]?.message } };
  const clearIds = formData
    .getAll("clear")
    .filter((v): v is string => typeof v === "string" && uuid("").safeParse(v).success);

  try {
    const account = await getAccount(accountId.data);
    if (!account) return { error: "That account no longer exists." };
    const amount = parseAmount(String(formData.get("statement_balance") ?? ""), account.currency);
    if (!amount.ok) return { fieldErrors: { statement_balance: AMOUNT_ERRORS[amount.error] } };
    await reconcileRpc({
      account_id: account.id,
      statement_date: date.data,
      // The statement shows the displayed balance (amount owed for liabilities).
      statement_balance: storedFromDisplay(account, amount.money).toFixed(),
      clear_transaction_ids: clearIds,
      create_adjustment: checkbox.parse(formData.get("create_adjustment")),
      note: note.data,
    });
  } catch (error) {
    return failure(error, { FT007: "Check the statement date (on or after the opening date) and balance." });
  }
  revalidatePath(`/accounts/${accountId.data}`, "layout");
  revalidatePath("/transactions");
  redirect(withNotice(`/accounts/${accountId.data}`, "reconciled"));
}

export async function undoReconciliation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("a reconciliation").safeParse(formData.get("id"));
  const accountId = uuid("an account").safeParse(formData.get("account_id"));
  if (!id.success || !accountId.success) return { error: "That reconciliation no longer exists." };
  try {
    await deleteReconciliationRow(id.data);
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/accounts/${accountId.data}`, "layout");
  redirect(withNotice(`/accounts/${accountId.data}/reconcile`, "reconciliation_undone"));
}
