import "server-only";
import type { Allocation, Goal } from "@/domain/goals/goals";
import { isCurrencyCode, Money } from "@/domain/money";
import { DataError, throwIfError } from "@/lib/errors";
import type { AllocationRow, Database, GoalRow } from "../supabase/database.types";
import { createClient } from "../supabase/server";

export type GoalRecord = Goal & { description: string | null; completedOn: string | null; createdAt: string };
export type AllocationRecord = Allocation & { id: string; note: string | null; createdAt: string };

const GOAL_COLUMNS =
  "id, user_id, name, description, target_amount::text, currency, target_date, funding_mode, linked_account_id, status, completed_on, created_at, updated_at";

function toGoal(r: GoalRow): GoalRecord {
  if (!isCurrencyCode(r.currency)) throw new DataError("unknown_currency");
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    target: Money.of(r.target_amount, r.currency),
    targetDate: r.target_date,
    status: r.status,
    fundingMode: r.funding_mode,
    linkedAccountId: r.linked_account_id,
    completedOn: r.completed_on,
    createdAt: r.created_at,
  };
}

export async function listGoals(): Promise<GoalRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("savings_goals").select(GOAL_COLUMNS).order("created_at");
  throwIfError(error);
  return (data as unknown as GoalRow[]).map(toGoal);
}

export async function getGoal(id: string): Promise<GoalRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("savings_goals").select(GOAL_COLUMNS).eq("id", id).maybeSingle();
  throwIfError(error);
  return data ? toGoal(data as unknown as GoalRow) : null;
}

type GoalInsert = Database["public"]["Tables"]["savings_goals"]["Insert"];
type GoalUpdate = Database["public"]["Tables"]["savings_goals"]["Update"];

export async function insertGoal(values: GoalInsert): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("savings_goals").insert(values).select("id").single();
  throwIfError(error);
  return data!.id;
}

export async function updateGoal(id: string, values: GoalUpdate): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("savings_goals").update(values).eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}

export async function deleteGoal(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("savings_goals").delete().eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}

/** All allocations (optionally for one goal), oldest first, in each goal's currency. */
export async function listAllocations(goals: readonly GoalRecord[], goalId?: string): Promise<AllocationRecord[]> {
  const supabase = await createClient();
  let query = supabase
    .from("goal_allocations")
    .select("id, user_id, goal_id, allocated_on, amount::text, source_account_id, note, created_at")
    .order("allocated_on")
    .order("created_at");
  if (goalId) query = query.eq("goal_id", goalId);
  const { data, error } = await query;
  throwIfError(error);
  const currencyOf = new Map(goals.map((g) => [g.id, g.target.currency]));
  return (data as unknown as AllocationRow[]).flatMap((r) => {
    const currency = currencyOf.get(r.goal_id);
    return currency
      ? [
          {
            id: r.id,
            goalId: r.goal_id,
            amount: Money.of(r.amount, currency),
            sourceAccountId: r.source_account_id,
            on: r.allocated_on,
            note: r.note,
            createdAt: r.created_at,
          },
        ]
      : [];
  });
}

export async function insertAllocation(
  values: Database["public"]["Tables"]["goal_allocations"]["Insert"],
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("goal_allocations").insert(values);
  throwIfError(error);
}

export async function deleteAllocation(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("goal_allocations").delete().eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}
