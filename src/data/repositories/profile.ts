import "server-only";
import { cache } from "react";
import { type CurrencyCode, isCurrencyCode } from "@/domain/money";
import { DataError, throwIfError } from "@/lib/errors";
import type { Database } from "../supabase/database.types";
import { createClient } from "../supabase/server";

export type Profile = { displayName: string | null; baseCurrency: CurrencyCode; timezone: string };

export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("display_name, base_currency, timezone").single();
  throwIfError(error);
  if (!data || !isCurrencyCode(data.base_currency)) throw new DataError("profile_missing");
  return { displayName: data.display_name, baseCurrency: data.base_currency, timezone: data.timezone };
});

export async function updateProfileRow(
  userId: string,
  values: Database["public"]["Tables"]["profiles"]["Update"],
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update(values).eq("user_id", userId).select("user_id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}
