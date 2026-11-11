import Link from "next/link";
import { Amount } from "@/components/money/amount";
import { Badge } from "@/components/ui/badge";
import { averageCost, type Holding } from "@/domain/investments";
import { formatDate, formatQuantity } from "@/lib/format";

/** "Manual valuation · 31 Mar 2026" or "Par value (assumed)": never "price" or "live". */
export function ValuationLabel({ holding }: { holding: Holding }) {
  const v = holding.valuation;
  if (v.status === "unvalued") return <Badge variant="warning">unvalued</Badge>;
  return (
    <span className="text-xs text-muted-foreground">
      {v.basis === "par" ? "Par value (assumed)" : `Manual valuation · ${formatDate(v.valuedOn)}`}
    </span>
  );
}

/**
 * Open positions: quantity, cost, estimated value and unrealized gain in the
 * asset's own currency. Unvalued rows show their cost, clearly not as value.
 */
export function HoldingsTable({
  holdings,
  accountName,
  showAsset = true,
}: {
  holdings: Holding[];
  accountName: (id: string) => string;
  showAsset?: boolean;
}) {
  if (holdings.length === 0) return <p className="text-sm text-muted-foreground">Nothing held right now.</p>;
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Holdings</caption>
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            {showAsset && (
              <th scope="col" className="py-2 pr-3 font-medium">
                Asset
              </th>
            )}
            <th scope="col" className="py-2 pr-3 font-medium">
              Account
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Quantity
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Cost basis
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Estimated value
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Unrealized
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {holdings.map((h) => {
            const avg = averageCost(h.position);
            return (
              <tr key={`${h.position.accountId}|${h.asset.id}`} className="align-top">
                {showAsset && (
                  <td className="py-2 pr-3">
                    <Link href={`/investments/assets/${h.asset.id}`} className="font-medium hover:underline">
                      {h.asset.name}
                    </Link>
                    {h.asset.symbol && <span className="ml-1 text-xs text-muted-foreground">{h.asset.symbol}</span>}
                  </td>
                )}
                <td className="py-2 pr-3 text-muted-foreground">{accountName(h.position.accountId)}</td>
                <td className="tabular py-2 pr-3 text-right whitespace-nowrap">
                  {formatQuantity(h.position.quantity)} {h.asset.unitLabel}
                </td>
                <td className="py-2 pr-3 text-right">
                  <Amount money={h.position.costBasis} colored={false} />
                  {avg && (
                    <span className="block text-xs text-muted-foreground">
                      avg <Amount money={avg.rounded()} colored={false} />
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right">
                  {h.valuation.status === "valued" ? (
                    <Amount money={h.valuation.value} colored={false} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  <span className="block">
                    <ValuationLabel holding={h} />
                  </span>
                </td>
                <td className="py-2 text-right">
                  {h.valuation.status === "valued" ? (
                    <Amount money={h.valuation.unrealized} sign="always" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="grid divide-y rounded-xl border md:hidden">
        {holdings.map((h) => (
          <li key={`${h.position.accountId}|${h.asset.id}`} className="grid gap-1 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="grid min-w-0">
                {showAsset ? (
                  <Link href={`/investments/assets/${h.asset.id}`} className="truncate font-medium">
                    {h.asset.name}
                  </Link>
                ) : (
                  <span className="font-medium">{accountName(h.position.accountId)}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatQuantity(h.position.quantity)} {h.asset.unitLabel}
                  {showAsset && ` · ${accountName(h.position.accountId)}`}
                </span>
              </span>
              <span className="text-right">
                {h.valuation.status === "valued" ? (
                  <Amount money={h.valuation.value} colored={false} className="font-medium" />
                ) : (
                  <Badge variant="warning">unvalued</Badge>
                )}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Cost <Amount money={h.position.costBasis} colored={false} />
              </span>
              {h.valuation.status === "valued" && (
                <span>
                  Unrealized <Amount money={h.valuation.unrealized} sign="always" />
                </span>
              )}
            </div>
            {h.valuation.status === "valued" && <ValuationLabel holding={h} />}
          </li>
        ))}
      </ul>
    </>
  );
}
