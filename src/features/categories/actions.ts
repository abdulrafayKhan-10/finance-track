"use server";

import { revalidatePath } from "next/cache";
import { deleteCategoryRow, insertCategory, mergeCategories, updateCategoryRow } from "@/data/repositories/categories";
import { requireUser } from "@/lib/auth";
import { parseCategoryUpdate, parseNewCategory } from "@/lib/validation/categories";
import { uuid } from "@/lib/validation/form";
import { type ActionState, failure } from "../action-state";

const DUPLICATE = { "23505": "A category with that name already exists there." };

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = parseNewCategory(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  try {
    await insertCategory(parsed.values);
  } catch (error) {
    return failure(error, DUPLICATE);
  }
  revalidatePath("/settings/categories");
  return { success: `Added “${parsed.values.name}”.` };
}

export async function updateCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("a category").safeParse(formData.get("id"));
  const parsed = parseCategoryUpdate(formData);
  if (!id.success) return { error: "That category no longer exists." };
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  try {
    await updateCategoryRow(id.data, parsed.values);
  } catch (error) {
    return failure(error, DUPLICATE);
  }
  revalidatePath("/settings/categories");
  return { success: "Saved." };
}

export async function deleteCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("a category").safeParse(formData.get("id"));
  if (!id.success) return { error: "That category no longer exists." };
  try {
    await deleteCategoryRow(id.data);
  } catch (error) {
    return failure(error, {
      "23503": "This category is used by transactions or has subcategories. Merge or archive it instead.",
      FT404: "System categories can't be deleted.",
    });
  }
  revalidatePath("/settings/categories");
  return { success: "Category deleted." };
}

export async function mergeCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const from = uuid("a category").safeParse(formData.get("id"));
  const into = uuid("the category to merge into").safeParse(formData.get("into"));
  if (!from.success) return { error: "That category no longer exists." };
  if (!into.success) return { fieldErrors: { into: "Choose the category to merge into." } };
  try {
    await mergeCategories(from.data, into.data);
  } catch (error) {
    return failure(error, {
      FT007:
        "Merge into a different category of the same kind. System categories and categories with subcategories can't be merged away.",
    });
  }
  revalidatePath("/settings/categories");
  revalidatePath("/transactions");
  return { success: "Merged. Its transactions now use the other category." };
}
