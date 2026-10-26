import type { TransactionPayload } from "@/data/supabase/database.types";
import { buildLines, type EntryInput } from "@/domain/ledger";
import type { TransactionMeta } from "@/lib/validation/transactions";

/**
 * The RPC payload for an entry: signed lines from the domain, amounts at the
 * currency's precision. `refundOfId` keeps an existing refund link on edit.
 */
export function toTransactionPayload(
  entry: EntryInput,
  meta: TransactionMeta,
  refundOfId: string | null = null,
): TransactionPayload {
  return {
    kind: entry.kind,
    occurred_on: meta.occurredOn,
    description: meta.description,
    payee: meta.payee,
    notes: meta.notes,
    tags: meta.tags,
    status: meta.status,
    refund_of_id: entry.kind === "refund" ? refundOfId : null,
    lines: buildLines(entry).map((l) => ({
      account_id: l.accountId,
      amount: l.amount.toFixed(),
      category_id: l.categoryId,
    })),
  };
}
