import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/app-shell/not-built-yet";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Accounts" description="Cash, bank, wallets, savings, investment accounts, cards and loans." />
      <NotBuiltYet
        phase={3}
        features={[
          "Opening balances and derived balances",
          "Reconciliation with an audit history",
          "Archive instead of delete once an account has history",
        ]}
      />
    </>
  );
}
