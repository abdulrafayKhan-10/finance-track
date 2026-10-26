import "server-only";
import type { Budget } from "@/domain/budgets/budgets";
import { type IsoMonth, firstDay } from "@/domain/dates";
import { isCurrencyCode, Money } from "@/domain/money";
import { DataError, throwIfError } from "@/lib/errors";
import type { BudgetRow } from "../supabase/database.types";
import { createClient } from "../supabase/server";

/** Budgets for the months from `from` to `to` inclusive. */
export async function listBudgets(from: IsoMonth, to: IsoMonth): Promise<Budget[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .select("id, user_id, month, category_id, amount::text, currency, created_at, updated_at")
    .gte("month", firstDay(from))
    .lte("month", firstDay(to))
    .order("month");
  throwIfError(error);
  return (data as unknown as BudgetRow[]).flatMap((r) =>
    isCurrencyCode(r.currency)
      ? [{ id: r.id, month: r.month.slice(0, 7), categoryId: r.category_id, amount: Money.of(r.amount, r.currency) }]
      : [],
  );
}

/** Creates or replaces the budget for (month, category). */
export async function setBudget(month: IsoMonth, categoryId: string | null, amount: Money): Promise<void> {
  const supabase = await createClient();
  let query = supabase.from("budgets").select("id").eq("month", firstDay(month));
  query = categoryId ? query.eq("category_id", categoryId) : query.is("category_id", null);
  const { data: existing, error: findError } = await query.maybeSingle();
  throwIfError(findError);
  const values = { amount: amount.toFixed(), currency: amount.currency };
  const { error } = existing
    ? await supabase.from("budgets").update(values).eq("id", existing.id)
    : await supabase.from("budgets").insert({ month: firstDay(month), category_id: categoryId, ...values });
  throwIfError(error);
}

export async function deleteBudget(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("budgets").delete().eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}

export async function copyBudgets(from: IsoMonth, to: IsoMonth): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_budgets", { p_from: firstDay(from), p_to: firstDay(to) });
  throwIfError(error);
  return Number(data ?? 0);
}
