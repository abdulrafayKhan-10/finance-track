import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/app-shell/not-built-yet";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Reports" description="Monthly and yearly reports with CSV export." />
      <NotBuiltYet
        phase={4}
        features={[
          "Income and expenses, cash flow, savings rate, categories",
          "Budget performance, portfolio allocation and gains (Phase 5)",
        ]}
      />
    </>
  );
}
