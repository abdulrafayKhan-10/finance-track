import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/app-shell/not-built-yet";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Savings goals" };

export default async function GoalsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Savings goals" description="Targets funded by a linked account or explicit allocations." />
      <NotBuiltYet
        phase={4}
        features={["Progress, target dates and contribution history", "Never double-counted in net worth"]}
      />
    </>
  );
}
