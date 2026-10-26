import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountForm } from "@/components/accounts/account-form";
import { PageHeader } from "@/components/app-shell/page-header";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { accountsWithLines, getAccount } from "@/data/repositories/accounts";
import { displayBalance } from "@/domain/ledger";
import { deleteAccount, saveAccount } from "@/features/accounts/actions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit account" };

export default async function EditAccountPage({ params }: PageProps<"/accounts/[id]/edit">) {
  await requireUser();
  const { id } = await params;
  const [account, used] = await Promise.all([getAccount(id), accountsWithLines()]);
  if (!account) notFound();
  const hasTransactions = used.has(account.id);

  return (
    <>
      <PageHeader title={`Edit ${account.name}`} />
      <AccountForm
        action={saveAccount}
        hasTransactions={hasTransactions}
        initial={{
          id: account.id,
          name: account.name,
          type: account.type,
          currency: account.currency,
          opening_balance: displayBalance(account, account.openingBalance).toFixed(),
          opening_date: account.openingDate,
          institution: account.institution ?? "",
          notes: account.notes ?? "",
          include_in_net_worth: account.includeInNetWorth,
          is_liquid: account.isLiquid,
          status: account.status,
        }}
      />
      <section className="mt-10 grid max-w-xl justify-items-start gap-2 border-t pt-6">
        <h2 className="font-medium">Delete account</h2>
        {hasTransactions ? (
          <p className="text-sm text-muted-foreground">
            This account has transactions, so deleting it would change your history. Set its status to Archived instead.
          </p>
        ) : (
          <ConfirmAction
            action={deleteAccount}
            fields={{ id: account.id }}
            triggerLabel="Delete account"
            title={`Delete “${account.name}”?`}
            description="The account has no transactions. This can't be undone, but the deletion is kept in the audit history."
            confirmLabel="Delete account"
          />
        )}
      </section>
    </>
  );
}
