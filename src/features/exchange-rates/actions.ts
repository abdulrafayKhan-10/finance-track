"use server";

import { revalidatePath } from "next/cache";
import { deleteExchangeRate, insertExchangeRate } from "@/data/repositories/exchange-rates";
import { requireUser } from "@/lib/auth";
import { uuid } from "@/lib/validation/form";
import { parseRateForm } from "@/lib/validation/planning";
import { type ActionState, failure } from "../action-state";

export async function addExchangeRate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = parseRateForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  try {
    await insertExchangeRate(parsed.values);
  } catch (error) {
    return failure(error, {
      "23505": "There is already a rate for that pair on that date. Delete it first to replace it.",
    });
  }
  revalidatePath("/", "layout");
  return {
    success: `Saved 1 ${parsed.values.base} = ${parsed.values.rate} ${parsed.values.quote} from ${parsed.values.effective_on}.`,
  };
}

export async function removeExchangeRate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("a rate").safeParse(formData.get("id"));
  if (!id.success) return { error: "That rate no longer exists." };
  try {
    await deleteExchangeRate(id.data);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return { success: "Rate deleted." };
}
