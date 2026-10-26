import "server-only";
import type { Account } from "@/domain/ledger";
import { Money } from "@/domain/money";
import { DataError, throwIfError } from "@/lib/errors";
import type { ReconcilePayload, ReconciliationRow } from "../supabase/database.types";
import { createClient } from "../supabase/server";

export type Reconciliation = {
  id: string;
  statementDate: string;
  statementBalance: Money;
  computedClearedBalance: Money;
  difference: Money;
  adjustmentTransactionId: string | null;
  note: string | null;
  createdAt: string;
};

export async function listReconciliations(account: Account): Promise<Reconciliation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reconciliations")
    .select(
      "id, user_id, account_id, statement_date, statement_balance::text, computed_cleared_balance::text, difference::text, adjustment_transaction_id, note, created_at",
    )
    .eq("account_id", account.id)
    .order("statement_date", { ascending: false })
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data as unknown as ReconciliationRow[]).map((r) => ({
    id: r.id,
    statementDate: r.statement_date,
    statementBalance: Money.of(r.statement_balance, account.currency),
    computedClearedBalance: Money.of(r.computed_cleared_balance, account.currency),
    difference: Money.of(r.difference, account.currency),
    adjustmentTransactionId: r.adjustment_transaction_id,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export async function reconcileRpc(payload: ReconcilePayload): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reconcile_account", { p: payload });
  throwIfError(error);
  return data as string;
}

export async function deleteReconciliationRow(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reconciliations").delete().eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}
