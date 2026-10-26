import "server-only";
import type { IsoDate } from "@/domain/dates";
import type { Account, LedgerLine } from "@/domain/ledger";
import { Money } from "@/domain/money";
import { throwIfError } from "@/lib/errors";
import { createClient } from "../supabase/server";

/** Ledger lines (with kind, date and status) in a period; both bounds optional. */
export async function ledgerLines(accounts: readonly Account[], from?: IsoDate, to?: IsoDate): Promise<LedgerLine[]> {
  const supabase = await createClient();
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const { data, error } = await supabase.rpc("ledger_lines", { p_from: from ?? null, p_to: to ?? null });
  throwIfError(error);
  return (data ?? []).flatMap((r) => {
    const currency = currencyOf.get(r.account_id);
    return currency
      ? [
          {
            transactionId: r.transaction_id,
            accountId: r.account_id,
            amount: Money.of(r.amount, currency),
            categoryId: r.category_id,
            occurredOn: r.occurred_on,
            status: r.status,
            kind: r.kind,
          },
        ]
      : [];
  });
}
