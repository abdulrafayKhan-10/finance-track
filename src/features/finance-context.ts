import "server-only";
import { cache } from "react";
import { type AccountRecord, listAccounts } from "@/data/repositories/accounts";
import { type Category, listCategories } from "@/data/repositories/categories";
import { type ExchangeRateRecord, listExchangeRates } from "@/data/repositories/exchange-rates";
import { getProfile, type Profile } from "@/data/repositories/profile";
import type { CategoryParents } from "@/domain/budgets/budgets";
import { todayIn } from "@/domain/dates";

export type FinanceContext = {
  profile: Profile;
  today: string;
  accounts: AccountRecord[];
  rates: ExchangeRateRecord[];
  categories: Category[];
  /** Category → its top-level parent (null for top-level categories). */
  parents: CategoryParents;
  categoryName: (id: string | null) => string;
};

/** Reference data most screens need, loaded once per request. */
export const loadFinanceContext = cache(async (): Promise<FinanceContext> => {
  const [profile, accounts, rates, categories] = await Promise.all([
    getProfile(),
    listAccounts(),
    listExchangeRates(),
    listCategories(),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  return {
    profile,
    today: todayIn(profile.timezone),
    accounts,
    rates,
    categories,
    parents: new Map(categories.map((c) => [c.id, c.parentId])),
    categoryName: (id) => (id === null ? "No category" : (byId.get(id)?.name ?? "Unknown category")),
  };
});
