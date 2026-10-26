"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteAccountRow, insertAccount, updateAccountRow } from "@/data/repositories/accounts";
import { requireUser } from "@/lib/auth";
import { withNotice } from "@/lib/notice";
import { parseAccountForm } from "@/lib/validation/accounts";
import { uuid } from "@/lib/validation/form";
import { type ActionState, failure } from "../action-state";

export async function saveAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = formData.get("id");
  const parsed = parseAccountForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  let accountId: string;
  try {
    if (typeof id === "string" && id) {
      if (!uuid("an account").safeParse(id).success) return { error: "That account no longer exists." };
      await updateAccountRow(id, parsed.values);
      accountId = id;
    } else {
      accountId = await insertAccount({ ...parsed.values, status: "active" });
    }
  } catch (error) {
    return failure(error, { "23505": "You already have an account with that name." });
  }
  revalidatePath("/accounts");
  redirect(`/accounts/${accountId}`);
}

export async function deleteAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("an account").safeParse(formData.get("id"));
  if (!id.success) return { error: "That account no longer exists." };
  try {
    await deleteAccountRow(id.data);
  } catch (error) {
    return failure(error, {
      "23503": "This account has transactions or reconciliations, so it can't be deleted. Archive it instead.",
    });
  }
  revalidatePath("/accounts");
  redirect(withNotice("/accounts", "account_deleted"));
}
