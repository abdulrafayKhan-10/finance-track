import "server-only";
import type { IsoDate } from "@/domain/dates";
import type { Account, Posting } from "@/domain/ledger";
import { isCurrencyCode, Money } from "@/domain/money";
import { DataError, throwIfError } from "@/lib/errors";
import type { AccountRow, Database } from "../supabase/database.types";
import { createClient } from "../supabase/server";

export type AccountRecord = Account & {
  institution: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const COLUMNS =
  "id, user_id, name, type, class, currency, opening_balance::text, opening_date, institution, notes, status, include_in_net_worth, is_liquid, created_at, updated_at";

function toAccount(row: AccountRow): AccountRecord {
  if (!isCurrencyCode(row.currency)) throw new DataError("unknown_currency");
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    class: row.class,
    currency: row.currency,
    openingBalance: Money.of(row.opening_balance, row.currency),
    openingDate: row.opening_date,
    status: row.status,
    includeInNetWorth: row.include_in_net_worth,
    isLiquid: row.is_liquid,
    institution: row.institution,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAccounts(): Promise<AccountRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").select(COLUMNS).order("name");
  throwIfError(error);
  return (data as unknown as AccountRow[]).map(toAccount);
}

export async function getAccount(id: string): Promise<AccountRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").select(COLUMNS).eq("id", id).maybeSingle();
  throwIfError(error);
  return data ? toAccount(data as unknown as AccountRow) : null;
}

/**
 * Line totals per account and status, as postings: each row is a pre-summed
 * group, valid input for the domain balance functions.
 */
export async function accountTotals(accounts: readonly Account[], asOf?: IsoDate): Promise<Posting[]> {
  const supabase = await createClient();
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const { data, error } = await supabase.rpc("account_line_totals", { p_as_of: asOf ?? null });
  throwIfError(error);
  return (data ?? []).flatMap((row) => {
    const currency = currencyOf.get(row.account_id);
    return currency
      ? [
          {
            accountId: row.account_id,
            amount: Money.of(row.total, currency),
            occurredOn: row.last_on,
            status: row.status,
          },
        ]
      : [];
  });
}

/** Accounts that have at least one transaction line. */
export async function accountsWithLines(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_line_totals", { p_as_of: null });
  throwIfError(error);
  return new Set((data ?? []).map((r) => r.account_id));
}

type AccountInsert = Database["public"]["Tables"]["accounts"]["Insert"];
type AccountUpdate = Database["public"]["Tables"]["accounts"]["Update"];

export async function insertAccount(values: AccountInsert): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").insert(values).select("id").single();
  throwIfError(error);
  return data!.id;
}

export async function updateAccountRow(id: string, values: AccountUpdate): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").update(values).eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}

export async function deleteAccountRow(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").delete().eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}
