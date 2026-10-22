import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/app-shell/not-built-yet";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Net worth" };

export default async function NetWorthPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Net worth" description="Assets minus liabilities, with reproducible snapshots." />
      <NotBuiltYet
        phase={4}
        features={[
          "Explicit asset and liability inclusion rules",
          "Snapshots that keep the valuation dates and exchange rates used",
        ]}
      />
    </>
  );
}
