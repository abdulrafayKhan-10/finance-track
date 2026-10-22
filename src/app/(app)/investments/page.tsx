import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/app-shell/not-built-yet";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Investments" };

export default async function InvestmentsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Investments" description="Holdings valued by your own manual valuations." />
      <NotBuiltYet
        phase={5}
        features={[
          "Stocks, funds, gold, crypto, fixed income, cash-like and custom assets",
          "Weighted-average cost, realized and unrealized gains",
          "Dated manual valuations, never shown as live prices",
        ]}
      />
    </>
  );
}
