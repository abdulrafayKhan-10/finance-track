import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { getProfile } from "@/data/repositories/profile";
import { todayIn } from "@/domain/dates";
import { CASH_KINDS, type CashKind } from "@/domain/ledger";
import { getAccountOptions } from "@/features/accounts/queries";
import { getCategoryOptions } from "@/features/categories/queries";
import { saveTransaction } from "@/features/transactions/actions";
import { emptyFormValues } from "@/features/transactions/form-values";
import { requireUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "New transaction" };

export default async function NewTransactionPage({ searchParams }: PageProps<"/transactions/new">) {
  await requireUser();
  const [params, profile, accounts, categories] = await Promise.all([
    searchParams,
    getProfile(),
    getAccountOptions(),
    getCategoryOptions(),
  ]);
  const kind = (CASH_KINDS as readonly string[]).includes(String(params.kind)) ? (params.kind as CashKind) : "expense";
  const account = accounts.find((a) => a.id === params.account && a.status !== "archived")?.id ?? "";
  const returnTo = safeNextPath(params.return_to, "");

  return (
    <>
      <PageHeader title="New transaction" />
      <TransactionForm
        action={saveTransaction}
        accounts={accounts}
        categories={categories}
        initial={emptyFormValues({
          kind,
          occurred_on: todayIn(profile.timezone),
          account_id: account,
          from_account_id: account,
        })}
        returnTo={returnTo || undefined}
        cancelHref={returnTo || "/transactions"}
      />
    </>
  );
}
