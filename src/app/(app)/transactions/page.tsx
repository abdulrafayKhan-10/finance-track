import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/app-shell/not-built-yet";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Transactions" description="Income, expenses, transfers, refunds and adjustments." />
      <NotBuiltYet
        phase={3}
        features={[
          "Manual entry, editing and deletion with confirmation",
          "Search, filters and pagination",
          "CSV import and export (Phase 6)",
        ]}
      />
    </>
  );
}
