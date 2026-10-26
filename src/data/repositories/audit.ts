import "server-only";
import { throwIfError } from "@/lib/errors";
import { createClient } from "../supabase/server";

export type AuditEntry = {
  /** Groups every row written by one save. */
  txid: number;
  occurredAt: string;
  action: "created" | "edited" | "deleted";
};

/** History of a transaction, one entry per save, newest first. */
export async function transactionAudit(transactionId: string): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transaction_history", { p_id: transactionId });
  throwIfError(error);
  return (data ?? []).map((r) => ({
    txid: Number(r.txid),
    occurredAt: r.occurred_at,
    action: r.header_actions.includes("insert")
      ? "created"
      : r.header_actions.includes("delete")
        ? "deleted"
        : "edited",
  }));
}
