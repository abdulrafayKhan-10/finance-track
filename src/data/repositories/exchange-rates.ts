import "server-only";
import type { ExchangeRate } from "@/domain/fx/fx";
import { dec, isCurrencyCode } from "@/domain/money";
import { DataError, throwIfError } from "@/lib/errors";
import type { Database, ExchangeRateRow } from "../supabase/database.types";
import { createClient } from "../supabase/server";

export type ExchangeRateRecord = ExchangeRate & { id: string; sourceNote: string | null };

export async function listExchangeRates(): Promise<ExchangeRateRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("id, user_id, base, quote, rate::text, effective_on, source_note, created_at, updated_at")
    .order("effective_on", { ascending: false })
    .order("base")
    .order("quote");
  throwIfError(error);
  return (data as unknown as ExchangeRateRow[]).flatMap((r) =>
    isCurrencyCode(r.base) && isCurrencyCode(r.quote)
      ? [
          {
            id: r.id,
            base: r.base,
            quote: r.quote,
            rate: dec(r.rate),
            effectiveOn: r.effective_on,
            sourceNote: r.source_note,
          },
        ]
      : [],
  );
}

export async function insertExchangeRate(
  values: Database["public"]["Tables"]["exchange_rates"]["Insert"],
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("exchange_rates").insert(values);
  throwIfError(error);
}

export async function deleteExchangeRate(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("exchange_rates").delete().eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}
