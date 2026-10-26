import "server-only";
import { isCurrencyCode, Money } from "@/domain/money";
import { DataError, throwIfError } from "@/lib/errors";
import type { Database, SnapshotRow } from "../supabase/database.types";
import { createClient } from "../supabase/server";

export type Snapshot = {
  id: string;
  asOf: string;
  assets: Money;
  liabilities: Money;
  netWorth: Money;
  methodVersion: number;
  details: Record<string, unknown>;
  createdAt: string;
};

export async function listSnapshots(): Promise<Snapshot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .select(
      "id, user_id, as_of, base_currency, total_assets::text, total_liabilities::text, net_worth::text, method_version, details, created_at",
    )
    .order("as_of", { ascending: false });
  throwIfError(error);
  return (data as unknown as SnapshotRow[]).flatMap((r) =>
    isCurrencyCode(r.base_currency)
      ? [
          {
            id: r.id,
            asOf: r.as_of,
            assets: Money.of(r.total_assets, r.base_currency),
            liabilities: Money.of(r.total_liabilities, r.base_currency),
            netWorth: Money.of(r.net_worth, r.base_currency),
            methodVersion: r.method_version,
            details: r.details,
            createdAt: r.created_at,
          },
        ]
      : [],
  );
}

export async function insertSnapshot(
  values: Database["public"]["Tables"]["net_worth_snapshots"]["Insert"],
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("net_worth_snapshots").insert(values);
  throwIfError(error);
}

export async function deleteSnapshot(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("net_worth_snapshots").delete().eq("id", id).select("id");
  throwIfError(error);
  if (!data?.length) throw new DataError("FT404");
}
