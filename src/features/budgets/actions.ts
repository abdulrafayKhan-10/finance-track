"use server";

import { revalidatePath } from "next/cache";
import { copyBudgets, deleteBudget, setBudget } from "@/data/repositories/budgets";
import { getProfile } from "@/data/repositories/profile";
import { addMonths } from "@/domain/dates";
import { requireUser } from "@/lib/auth";
import { uuid } from "@/lib/validation/form";
import { isoMonth, positiveAmount } from "@/lib/validation/planning";
import { type ActionState, failure } from "../action-state";

/** Sets (or replaces) one budget. An empty category means the overall limit. Budgets use the reporting currency. */
export async function saveBudget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const month = isoMonth.safeParse(formData.get("month"));
  const rawCategory = formData.get("category_id");
  const category = typeof rawCategory === "string" && rawCategory ? uuid("a category").safeParse(rawCategory) : null;
  if (!month.success) return { error: "Choose a month." };
  if (category && !category.success) return { error: "That category no longer exists." };
  try {
    const profile = await getProfile();
    const amount = positiveAmount(formData.get("amount"), profile.baseCurrency);
    if (!amount.ok) return { fieldErrors: { amount: amount.error } };
    await setBudget(month.data, category?.data ?? null, amount.money);
  } catch (error) {
    return failure(error, { FT007: "Budgets can only be set on top-level expense categories." });
  }
  revalidatePath("/budgets");
  revalidatePath("/");
  return { success: "Saved." };
}

export async function removeBudget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("a budget").safeParse(formData.get("id"));
  if (!id.success) return { error: "That budget no longer exists." };
  try {
    await deleteBudget(id.data);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/budgets");
  revalidatePath("/");
  return { success: "Budget removed." };
}

export async function copyPreviousMonth(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const month = isoMonth.safeParse(formData.get("month"));
  if (!month.success) return { error: "Choose a month." };
  let created: number;
  try {
    created = await copyBudgets(addMonths(month.data, -1), month.data);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/budgets");
  return {
    success:
      created === 0
        ? "Nothing to copy: last month had no budgets that this month lacks."
        : `Copied ${created} budget${created === 1 ? "" : "s"} from last month.`,
  };
}
