import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { GoalForm } from "@/components/goals/goal-form";
import { getAccountOptions } from "@/features/accounts/queries";
import { saveGoal } from "@/features/goals/actions";
import { getGoalForEdit } from "@/features/goals/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit goal" };

export default async function EditGoalPage({ params }: PageProps<"/goals/[id]/edit">) {
  await requireUser();
  const { id } = await params;
  const [found, accounts] = await Promise.all([getGoalForEdit(id), getAccountOptions()]);
  if (!found) notFound();
  const { goal, locked } = found;
  return (
    <>
      <PageHeader title={`Edit ${goal.name}`} />
      <GoalForm
        action={saveGoal}
        accounts={accounts.filter(
          (a) => a.class === "asset" && (a.status !== "archived" || a.id === goal.linkedAccountId),
        )}
        locked={locked}
        initial={{
          id: goal.id,
          name: goal.name,
          description: goal.description ?? "",
          target_amount: goal.target.toFixed(),
          currency: goal.target.currency,
          target_date: goal.targetDate ?? "",
          funding_mode: goal.fundingMode,
          linked_account_id: goal.linkedAccountId ?? "",
        }}
      />
    </>
  );
}
