"use server";

import { revalidatePath } from "next/cache";
import { updateProfileRow } from "@/data/repositories/profile";
import { requireUser } from "@/lib/auth";
import { parseProfileForm } from "@/lib/validation/profile";
import { type ActionState, failure } from "../action-state";

export async function saveProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseProfileForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  try {
    await updateProfileRow(user.id, parsed.values);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return { success: "Profile saved." };
}
