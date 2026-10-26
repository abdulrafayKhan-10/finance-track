import "server-only";
import { type Category, categoryUsage, listCategories } from "@/data/repositories/categories";
import type { CategoryKind } from "@/data/supabase/database.types";

export type CategoryNode = Category & { lineCount: number; children: (Category & { lineCount: number })[] };

/** Categories as a two-level tree per kind, with usage counts. */
export async function getCategoryTree(): Promise<Record<CategoryKind, CategoryNode[]>> {
  const [categories, usage] = await Promise.all([listCategories(), categoryUsage()]);
  const withCount = categories.map((c) => ({ ...c, lineCount: usage.get(c.id) ?? 0 }));
  const roots = withCount
    .filter((c) => c.parentId === null)
    .map((c) => ({ ...c, children: withCount.filter((x) => x.parentId === c.id) }));
  return {
    expense: roots.filter((c) => c.kind === "expense"),
    income: roots.filter((c) => c.kind === "income"),
  };
}

/** Plain option list for selects: "Food & groceries", "Food & groceries › Restaurants". */
export type CategoryOption = { id: string; label: string; kind: CategoryKind; archived: boolean };

export async function getCategoryOptions(): Promise<CategoryOption[]> {
  const categories = await listCategories();
  const byId = new Map(categories.map((c) => [c.id, c]));
  return categories
    .map((c) => {
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      return { id: c.id, label: parent ? `${parent.name} › ${c.name}` : c.name, kind: c.kind, archived: c.isArchived };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function getCategoryNames(): Promise<Map<string, string>> {
  return new Map((await getCategoryOptions()).map((c) => [c.id, c.label]));
}
