import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/app-shell/not-built-yet";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Budgets" description="Monthly limits by category." />
      <NotBuiltYet
        phase={4}
        features={[
          "Budgeted, actual, remaining and percentage used",
          "Over-budget warnings and history",
          "Transfers, card payments and investments never count as spending",
        ]}
      />
    </>
  );
}
