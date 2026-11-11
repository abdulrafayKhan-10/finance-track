import "server-only";
import type { IsoDate } from "@/domain/dates";
import { DataError, throwIfError } from "@/lib/errors";
import type { TransactionPayload } from "../supabase/database.types";
import { fetchAll } from "../supabase/paging";
import { createClient } from "../supabase/server";

export type ImportBatch = {
  id: string;
  fileName: string | null;
  rowCount: number;
  accountId: string | null;
  createdAt: string;
  transactionCount: number;
};

/** Thrown when the database rejected some import rows; carries only row numbers and codes. */
export class ImportRejectedError extends Error {
  constructor(readonly rows: { row: number; code: string }[]) {
    super("Import rejected");
    this.name = "ImportRejectedError";
  }
}

export async function importTransactionsRpc(
  fileName: string,
  summary: Record<string, string | number>,
  rows: (TransactionPayload & { import_fingerprint: string | null })[],
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_transactions", {
    p: { file_name: fileName, summary, rows },
  });
  if (error?.code === "FT010") {
    let parsed: { row: number; code: string }[] = [];
    try {
      const detail: unknown = JSON.parse(error.details ?? "[]");
      if (Array.isArray(detail)) {
        parsed = detail.flatMap((d) =>
          typeof d?.row === "number" && typeof d?.code === "string" ? [{ row: d.row, code: d.code }] : [],
        );
      }
    } catch {
      // keep an empty list; the caller still reports that nothing was saved
    }
    throw new ImportRejectedError(parsed);
  }
  throwIfError(error);
  return data as string;
}

export async function undoImportRpc(batchId: string, unlock: boolean): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_import", { p_batch_id: batchId, p_unlock: unlock });
  throwIfError(error);
  return data as number;
}

export async function listImportBatches(): Promise<ImportBatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, file_name, row_count, summary, created_at")
    .eq("kind", "transactions_csv")
    .order("created_at", { ascending: false })
    .limit(50);
  throwIfError(error);
  const ids = (data ?? []).map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const tx = await fetchAll((a, b) =>
      supabase.from("transactions").select("id, import_batch_id").in("import_batch_id", ids).order("id").range(a, b),
    );
    if (tx.error) throw new DataError(tx.error.code ?? "unknown");
    for (const t of tx.data) {
      if (t.import_batch_id) counts.set(t.import_batch_id, (counts.get(t.import_batch_id) ?? 0) + 1);
    }
  }
  return (data ?? []).map((r) => {
    const summary = (r.summary ?? {}) as Record<string, unknown>;
    const count = counts.get(r.id) ?? 0;
    return {
      id: r.id,
      fileName: r.file_name,
      rowCount: r.row_count,
      accountId: typeof summary.account_id === "string" ? summary.account_id : null,
      createdAt: r.created_at,
      transactionCount: count,
    };
  });
}

/** Fingerprints of earlier imports dated in a range, for duplicate detection. */
export async function importedFingerprints(from: IsoDate, to: IsoDate): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await fetchAll((a, b) =>
    supabase
      .from("transactions")
      .select("id, import_fingerprint")
      .not("import_fingerprint", "is", null)
      .gte("occurred_on", from)
      .lte("occurred_on", to)
      .order("id")
      .range(a, b),
  );
  if (error) throw new DataError(error.code ?? "unknown");
  return new Set(data.flatMap((r) => (r.import_fingerprint ? [r.import_fingerprint] : [])));
}
