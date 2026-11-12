import "server-only";
import { type ImportBatch, listImportBatches } from "@/data/repositories/imports";

export type { ImportBatch };

/** The most recent CSV imports, newest first, with how many of their transactions remain. */
export function getImportBatches(): Promise<ImportBatch[]> {
  return listImportBatches();
}
