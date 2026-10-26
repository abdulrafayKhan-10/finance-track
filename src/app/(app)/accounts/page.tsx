import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountGroups } from "@/components/accounts/account-groups";
import { Notice } from "@/components/app-shell/notice";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { getAccountsOverview } from "@/features/accounts/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  await requireUser();
  const [{ groups, count }, params] = await Promise.all([getAccountsOverview(), searchParams]);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Accounts"
          description="Balances are calculated from each opening balance and its transactions."
        />
        <Button asChild>
          <Link href="/accounts/new">
            <Plus aria-hidden /> New account
          </Link>
        </Button>
      </div>
      <Notice value={params.notice} />
      {count === 0 ? (
        <section className="grid justify-items-start gap-3 rounded-xl border border-dashed p-6">
          <h2 className="font-medium">No accounts yet</h2>
          <p className="text-sm text-muted-foreground">
            Add the places your money sits (cash, bank accounts, wallets, savings) and what you owe (credit cards,
            loans), each with its balance on a starting date.
          </p>
          <Button asChild>
            <Link href="/accounts/new">Add your first account</Link>
          </Button>
        </section>
      ) : (
        <AccountGroups groups={groups} />
      )}
    </>
  );
}
