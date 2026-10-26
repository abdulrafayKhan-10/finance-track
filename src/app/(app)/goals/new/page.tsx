import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { GoalForm } from "@/components/goals/goal-form";
import { getAccountOptions } from "@/features/accounts/queries";
import { loadFinanceContext } from "@/features/finance-context";
import { saveGoal } from "@/features/goals/actions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New goal" };

export default async function NewGoalPage() {
  await requireUser();
  const [ctx, accounts] = await Promise.all([loadFinanceContext(), getAccountOptions()]);
  return (
    <>
      <PageHeader title="New goal" />
      <GoalForm
        action={saveGoal}
        accounts={accounts.filter((a) => a.class === "asset" && a.status !== "archived")}
        locked={false}
        initial={{
          name: "",
          description: "",
          target_amount: "",
          currency: ctx.profile.baseCurrency,
          target_date: "",
          funding_mode: "allocations",
          linked_account_id: "",
        }}
      />
    </>
  );
}
