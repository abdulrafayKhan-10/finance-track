"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteAllocation,
  deleteGoal,
  getGoal,
  insertAllocation,
  insertGoal,
  updateGoal,
} from "@/data/repositories/goals";
import { getProfile } from "@/data/repositories/profile";
import { todayIn } from "@/domain/dates";
import { requireUser } from "@/lib/auth";
import { uuid } from "@/lib/validation/form";
import { parseAllocationForm, parseGoalForm } from "@/lib/validation/planning";
import { type ActionState, failure } from "../action-state";

const GOAL_ERRORS = {
  "23505": "You already have a goal with that name.",
  FT007:
    "That change isn't possible: a goal can only follow an asset account, and its funding mode and currency are fixed once it has allocations.",
};

function revalidateGoals(id?: string) {
  revalidatePath("/goals");
  if (id) revalidatePath(`/goals/${id}`);
  revalidatePath("/");
}

export async function saveGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? uuid("a goal").safeParse(rawId) : null;
  if (id && !id.success) return { error: "That goal no longer exists." };
  const parsed = parseGoalForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  let goalId: string;
  try {
    if (id) {
      await updateGoal(id.data, parsed.values);
      goalId = id.data;
    } else {
      goalId = await insertGoal(parsed.values);
    }
  } catch (error) {
    return failure(error, GOAL_ERRORS);
  }
  revalidateGoals(goalId);
  redirect(`/goals/${goalId}`);
}

/** Marks a goal completed (today), reopens it, or archives it. */
export async function setGoalStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("a goal").safeParse(formData.get("id"));
  const status = formData.get("status");
  if (!id.success || (status !== "active" && status !== "completed" && status !== "archived"))
    return { error: "That goal no longer exists." };
  try {
    const profile = await getProfile();
    await updateGoal(id.data, { status, completed_on: status === "completed" ? todayIn(profile.timezone) : null });
  } catch (error) {
    return failure(error);
  }
  revalidateGoals(id.data);
  return {
    success: status === "completed" ? "Marked as completed." : status === "archived" ? "Archived." : "Reopened.",
  };
}

export async function removeGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("a goal").safeParse(formData.get("id"));
  if (!id.success) return { error: "That goal no longer exists." };
  try {
    await deleteGoal(id.data);
  } catch (error) {
    return failure(error);
  }
  revalidateGoals();
  redirect("/goals");
}

export async function addAllocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const goalId = uuid("a goal").safeParse(formData.get("goal_id"));
  if (!goalId.success) return { error: "That goal no longer exists." };
  try {
    const goal = await getGoal(goalId.data);
    if (!goal) return { error: "That goal no longer exists." };
    const parsed = parseAllocationForm(formData, goal.target.currency);
    if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
    await insertAllocation({
      goal_id: goal.id,
      allocated_on: parsed.values.allocated_on,
      amount: parsed.values.amount,
      source_account_id: parsed.values.source_account_id,
      note: parsed.values.note,
    });
  } catch (error) {
    return failure(error, {
      FT007: "You can't release more than is allocated, and the source account must use the goal's currency.",
    });
  }
  revalidateGoals(goalId.data);
  return { success: "Saved." };
}

export async function removeAllocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("an allocation").safeParse(formData.get("id"));
  const goalId = uuid("a goal").safeParse(formData.get("goal_id"));
  if (!id.success || !goalId.success) return { error: "That entry no longer exists." };
  try {
    await deleteAllocation(id.data);
  } catch (error) {
    return failure(error, { FT007: "Removing this would leave the goal with a negative allocated total." });
  }
  revalidateGoals(goalId.data);
  return { success: "Removed." };
}
