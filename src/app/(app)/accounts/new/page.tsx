import type { Metadata } from "next";
import { AccountForm } from "@/components/accounts/account-form";
import { PageHeader } from "@/components/app-shell/page-header";
import { todayIn } from "@/domain/dates";
import { loadFinanceContext } from "@/features/finance-context";
import { saveAccount } from "@/features/accounts/actions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New account" };

export default async function NewAccountPage() {
  await requireUser();
  const profile = await loadFinanceContext().then((c) => c.profile);
  return (
    <>
      <PageHeader
        title="New account"
        description="The opening balance is what the account held (or owed) on the opening date."
      />
      <AccountForm
        action={saveAccount}
        hasTransactions={false}
        initial={{
          name: "",
          type: "bank",
          currency: profile.baseCurrency,
          opening_balance: "0",
          opening_date: todayIn(profile.timezone),
          institution: "",
          notes: "",
          include_in_net_worth: true,
          is_liquid: true,
          status: "active",
        }}
      />
    </>
  );
}
