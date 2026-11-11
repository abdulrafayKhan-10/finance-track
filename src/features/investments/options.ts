import "server-only";
import { listAccounts } from "@/data/repositories/accounts";
import { listAssets } from "@/data/repositories/investments";
import type { AccountOption } from "../accounts/queries";

export type AssetOption = {
  id: string;
  name: string;
  currency: string;
  unitLabel: string;
  quantityScale: number;
  archived: boolean;
};

/** Plain options for the investment form (no Money or Dec objects cross to the client). */
export async function investmentFormOptions(): Promise<{
  assets: AssetOption[];
  investmentAccounts: AccountOption[];
  cashAccounts: AccountOption[];
}> {
  const [accounts, assets] = await Promise.all([listAccounts(), listAssets()]);
  const option = (a: (typeof accounts)[number]): AccountOption => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    class: a.class,
    status: a.status,
  });
  return {
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      unitLabel: a.unitLabel,
      quantityScale: a.quantityScale,
      archived: a.status === "archived",
    })),
    investmentAccounts: accounts.filter((a) => a.type === "investment").map(option),
    cashAccounts: accounts.filter((a) => a.class === "asset").map(option),
  };
}
