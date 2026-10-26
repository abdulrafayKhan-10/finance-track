import "server-only";
import { DataError, throwIfError } from "@/lib/errors";
import type { CategoryKind, CategoryRow, Database } from "../supabase/database.types";
import { createClient } from "../supabase/server";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  isArchived: boolean;
  systemKey: string | null;
};

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentId: row.parent_id,
    isArchived: row.is_archived,
    systemKey: row.system_key,
  };
}

export async function listCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, user_id, name, kind, parent_id, color, icon, is_archived, system_key, created_at, updated_at")
    .order("name");
  throwIfError(error);
  return (data ?? []).map(toCategory);
}

/** Number of transaction lines per category (categories without lines are absent). */
export async function categoryUsage(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("category_usage");
  throwIfError(error);
  return new Map((data ?? []).map((r) => [r.category_id, Number(r.line_count)]));
}

type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];
type CategoryUpdate = Database["public"]["Tables"]["categories"]["Update"];

export async function insertCategory(values: CategoryInsert): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").insert(values).select("id").single();
  throwIfError(error);
  return data!.id;
}

export async function updateCategoryRow(id: string, values: CategoryUpdate): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").update(values).eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}

/** Deletes an unused, non-system category. A category in use fails on its foreign key (23503). */
export async function deleteCategoryRow(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").delete().eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}

export async function mergeCategories(from: string, into: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_category", { p_from: from, p_into: into });
  throwIfError(error);
}
