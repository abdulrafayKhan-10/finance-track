"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listAccounts } from "@/data/repositories/accounts";
import { listCategories } from "@/data/repositories/categories";
import {
  ImportRejectedError,
  importedFingerprints,
  importTransactionsRpc,
  undoImportRpc,
} from "@/data/repositories/imports";
import { ledgerLines } from "@/data/repositories/ledger";
import { requireUser } from "@/lib/auth";
import { parseCsv } from "@/lib/csv/csv";
import {
  DATE_FORMATS,
  type DuplicateFlag,
  flagDuplicates,
  type ImportMapping,
  type ImportRow,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  mapImportRows,
} from "@/lib/csv/import";
import { userMessage } from "@/lib/errors";
import { uuid } from "@/lib/validation/form";
import { type ActionState, failure } from "../action-state";

const column = z.number().int().min(0).max(200).nullable();
const inputSchema = z.object({
  text: z.string().max(MAX_IMPORT_BYTES, { error: "The file is too large (max 900 KB). Split it into smaller files." }),
  fileName: z.string().max(200),
  mapping: z.object({
    accountId: z.uuid({ error: "Choose the account these transactions belong to." }),
    hasHeader: z.boolean(),
    dateColumn: z.number().int().min(0).max(200),
    dateFormat: z.enum(DATE_FORMATS),
    amountMode: z.enum(["signed", "split"]),
    amountColumn: column,
    outColumn: column,
    inColumn: column,
    invert: z.boolean(),
    descriptionColumn: column,
    payeeColumn: column,
    categoryColumn: column,
    notesColumn: column,
  }),
});

export type ImportInput = z.infer<typeof inputSchema>;

export type PreviewRow = ImportRow & { duplicate: DuplicateFlag; categoryName: string | null };

export type PreviewResult =
  | {
      ok: true;
      rows: PreviewRow[];
      currency: string;
      accountName: string;
      counts: { total: number; valid: number; invalid: number; duplicates: number };
    }
  | { ok: false; error: string };

/** Parses and validates the file against the user's data. Shared by preview and commit. */
async function analyse(raw: unknown): Promise<PreviewResult & { mapping?: ImportMapping; fileName?: string }> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the file and mapping." };
  const { text, mapping, fileName } = parsed.data;
  if (
    mapping.amountMode === "signed"
      ? mapping.amountColumn === null
      : mapping.outColumn === null && mapping.inColumn === null
  ) {
    return { ok: false, error: "Choose the amount column(s)." };
  }

  const table = parseCsv(text);
  const dataRows = table.rows.length - (mapping.hasHeader ? 1 : 0);
  if (dataRows <= 0) return { ok: false, error: "The file has no rows to import." };
  if (dataRows > MAX_IMPORT_ROWS) return { ok: false, error: `At most ${MAX_IMPORT_ROWS} rows per import.` };

  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  const account = accounts.find((a) => a.id === mapping.accountId);
  if (!account || account.status === "archived") return { ok: false, error: "Choose an active account." };
  const fallbackIncome = categories.find((c) => c.systemKey === "uncategorized_income");
  const fallbackExpense = categories.find((c) => c.systemKey === "uncategorized_expense");
  if (!fallbackIncome || !fallbackExpense) return { ok: false, error: "Your uncategorized categories are missing." };

  const rows = mapImportRows(
    table.rows,
    mapping,
    account.currency,
    categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, archived: c.isArchived })),
    { income: fallbackIncome.id, expense: fallbackExpense.id },
  );
  for (const r of rows) {
    if (r.date && r.date < account.openingDate) r.errors.push("Before the account’s opening date");
  }

  const dates = rows.flatMap((r) => (r.date ? [r.date] : [])).sort();
  const from = dates[0];
  const to = dates.at(-1);
  const [fingerprints, lines] =
    from && to
      ? await Promise.all([importedFingerprints(from, to), ledgerLines(accounts, from, to)])
      : [new Set<string>(), []];
  const flags = flagDuplicates(
    rows,
    fingerprints,
    lines.filter((l) => l.accountId === account.id).map((l) => ({ date: l.occurredOn, amount: l.amount.toStorage() })),
  );
  const name = new Map(categories.map((c) => [c.id, c.name]));
  const preview = rows.map((r, i) => ({
    ...r,
    duplicate: r.errors.length ? null : flags[i]!,
    categoryName: r.categoryId ? (name.get(r.categoryId) ?? null) : null,
  }));
  const invalid = preview.filter((r) => r.errors.length > 0).length;
  return {
    ok: true,
    rows: preview,
    currency: account.currency,
    accountName: account.name,
    counts: {
      total: preview.length,
      valid: preview.length - invalid,
      invalid,
      duplicates: preview.filter((r) => r.duplicate).length,
    },
    mapping,
    fileName,
  };
}

export async function previewImport(input: ImportInput): Promise<PreviewResult> {
  await requireUser();
  try {
    const { mapping: _m, fileName: _f, ...result } = await analyse(input);
    return result;
  } catch (error) {
    return { ok: false, error: failure(error).error ?? "Something went wrong." };
  }
}

export type CommitResult = { ok: true; created: number; batchId: string } | { ok: false; error: string };

/** Re-validates from the same file and mapping, then saves the chosen rows in one all-or-nothing call. */
export async function commitImport(input: ImportInput & { include: number[] }): Promise<CommitResult> {
  await requireUser();
  const include = z
    .array(z.number().int().min(1))
    .max(MAX_IMPORT_ROWS + 1)
    .safeParse(input.include);
  if (!include.success || include.data.length === 0) return { ok: false, error: "Tick at least one row to import." };
  let rows: PreviewRow[] = [];
  try {
    const result = await analyse(input);
    if (!result.ok || !result.mapping) return { ok: false, error: result.ok ? "Check the file." : result.error };
    const chosen = new Set(include.data);
    rows = result.rows.filter((r) => chosen.has(r.line));
    const broken = rows.filter((r) => r.errors.length > 0);
    if (broken.length > 0) {
      return {
        ok: false,
        error: `Rows with problems can't be imported (line ${broken.map((r) => r.line).join(", ")}).`,
      };
    }
    const payloads = rows.map((r) => ({
      kind: r.kind!,
      occurred_on: r.date!,
      description: r.description,
      payee: r.payee,
      notes: r.notes,
      tags: ["imported"],
      status: "cleared" as const,
      refund_of_id: null,
      lines: [{ account_id: result.mapping!.accountId, amount: r.amount!, category_id: r.categoryId }],
      import_fingerprint: r.fingerprint,
    }));
    const batchId = await importTransactionsRpc(
      result.fileName ?? "import.csv",
      { account_id: result.mapping.accountId, rows_in_file: result.counts.total, imported: payloads.length },
      payloads,
    );
    revalidatePath("/", "layout");
    return { ok: true, created: payloads.length, batchId };
  } catch (error) {
    if (error instanceof ImportRejectedError) {
      const detail = error.rows
        .slice(0, 5)
        .map((r) => `Line ${rows[r.row - 1]?.line ?? r.row}: ${userMessage({ code: r.code })}`)
        .join(" ");
      return { ok: false, error: `Nothing was saved. ${detail}` };
    }
    return { ok: false, error: failure(error).error ?? "Something went wrong." };
  }
}

export async function undoImport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = uuid("an import").safeParse(formData.get("id"));
  if (!id.success) return { error: "That import no longer exists." };
  if (
    String(formData.get("confirm") ?? "")
      .trim()
      .toUpperCase() !== "UNDO"
  ) {
    return { fieldErrors: { confirm: "Type UNDO to confirm." } };
  }
  try {
    const removed = await undoImportRpc(id.data, formData.get("unlock") === "on");
    revalidatePath("/", "layout");
    return { success: `Import undone: ${removed} transaction${removed === 1 ? "" : "s"} removed.` };
  } catch (error) {
    return failure(error, {
      FT006: "Some of these transactions are reconciled. Tick the unlock box to remove them anyway.",
    });
  }
}
