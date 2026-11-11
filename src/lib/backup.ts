import { z } from "zod";

/**
 * The JSON backup format (docs/03-data-model.md §3.9). Every user table is
 * exported with its ids so links survive a restore. Numbers, dates and
 * timestamps are cast to text so nothing loses precision on the way.
 * user_id is never exported: a restore always belongs to the signed-in user.
 */
export const BACKUP_FORMAT = "finance-track-backup";
export const BACKUP_VERSION = 1;

/** Tables in restore order, with the exact select list (PostgREST and SQL share the cast syntax). */
export const BACKUP_TABLES = {
  categories: "id, name, kind, parent_id, color, icon, is_archived, system_key, created_at::text, updated_at::text",
  accounts:
    "id, name, type, currency, opening_balance::text, opening_date::text, institution, notes, status, include_in_net_worth, is_liquid, created_at::text, updated_at::text",
  assets:
    "id, name, symbol, category, currency, quantity_scale, unit_label, valuation_mode, details, status, notes, created_at::text, updated_at::text",
  exchange_rates: "id, base, quote, rate::text, effective_on::text, source_note, created_at::text, updated_at::text",
  import_batches: "id, kind, file_name, row_count, summary, created_at::text",
  transactions:
    "id, kind, occurred_on::text, description, payee, notes, tags, status, refund_of_id, asset_id, import_batch_id, import_fingerprint, reconciliation_id, created_at::text, updated_at::text",
  transaction_lines: "id, transaction_id, account_id, amount::text, category_id, memo, created_at::text",
  holding_movements:
    "id, transaction_id, account_id, asset_id, quantity::text, unit_price::text, fee::text, cost_amount::text, created_at::text",
  reconciliations:
    "id, account_id, statement_date::text, statement_balance::text, computed_cleared_balance::text, difference::text, adjustment_transaction_id, note, created_at::text",
  asset_valuations:
    "id, asset_id, valued_on::text, unit_price::text, entered_as, entered_total::text, quantity_at_entry::text, source, source_note, created_at::text, updated_at::text",
  budgets: "id, month::text, category_id, amount::text, currency, created_at::text, updated_at::text",
  savings_goals:
    "id, name, description, target_amount::text, currency, target_date::text, funding_mode, linked_account_id, status, completed_on::text, created_at::text, updated_at::text",
  goal_allocations: "id, goal_id, allocated_on::text, amount::text, source_account_id, note, created_at::text",
  net_worth_snapshots:
    "id, as_of::text, base_currency, total_assets::text, total_liabilities::text, net_worth::text, method_version, details, created_at::text",
} as const;

export type BackupTable = keyof typeof BACKUP_TABLES;
export const BACKUP_TABLE_NAMES = Object.keys(BACKUP_TABLES) as BackupTable[];

export const PROFILE_COLUMNS = "display_name, base_currency, timezone, theme";

export type BackupRow = Record<string, unknown>;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exported_at: string;
  base_currency: string;
  data: { profile: BackupRow | null } & Record<BackupTable, BackupRow[]>;
};

export function buildBackup(
  profile: BackupRow | null,
  tables: Record<BackupTable, BackupRow[]>,
  exportedAt: string,
): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: exportedAt,
    base_currency: typeof profile?.base_currency === "string" ? profile.base_currency : "PKR",
    data: { profile, ...tables },
  };
}

/** Restores accept at most this many rows in total (a decade of daily entries is far below it). */
export const MAX_BACKUP_ROWS = 200_000;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

const row = z.record(z.string(), z.unknown());
const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT, { error: "This isn't a Finance Track backup file." }),
  version: z.literal(BACKUP_VERSION, { error: "This backup was made by a newer version of the app." }),
  exported_at: z.string(),
  data: z
    .object({
      profile: row.nullable().optional(),
      ...Object.fromEntries(BACKUP_TABLE_NAMES.map((t) => [t, z.array(row).default([])])),
    })
    .strip(),
});

/** Checks the envelope and sizes only; the database validates every row on restore. */
export function parseBackup(
  text: string,
): { ok: true; data: Record<string, unknown>; counts: Record<string, number> } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file isn't valid JSON." };
  }
  const r = backupSchema.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "This backup file is not valid." };
  const data = r.data.data as Record<string, unknown>;
  const counts = Object.fromEntries(
    BACKUP_TABLE_NAMES.map((t) => [t, Array.isArray(data[t]) ? (data[t] as unknown[]).length : 0]),
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total > MAX_BACKUP_ROWS) return { ok: false, error: "This backup is larger than a restore can take." };
  return { ok: true, data, counts };
}
