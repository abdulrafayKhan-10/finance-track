import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/app-shell/not-built-yet";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Dashboard" description="Net worth, cash flow and progress at a glance." />
      <NotBuiltYet
        phase={4}
        features={[
          "Net worth split into cash and investment valuations",
          "Income, expenses, net cash flow and savings rate for a chosen period",
          "Spending by category, budget and goal progress, net-worth trend",
        ]}
      />
    </>
  );
}
