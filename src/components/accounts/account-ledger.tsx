import { Lock } from "lucide-react";
import Link from "next/link";
import { Amount } from "@/components/money/amount";
import { Badge } from "@/components/ui/badge";
import type { LedgerRow } from "@/features/accounts/queries";
import { formatDate } from "@/lib/format";
import { KIND_LABELS } from "@/lib/labels";

/** Postings on one account with the running balance; a table on desktop, cards on mobile. */
export function AccountLedger({
  rows,
  accountNames,
  categoryNames,
  liability,
}: {
  rows: LedgerRow[];
  accountNames: Map<string, string>;
  categoryNames: Map<string, string>;
  liability: boolean;
}) {
  const detail = (r: LedgerRow) => {
    const p = r.posting;
    if (p.kind === "transfer" && p.otherAccountId) {
      const other = accountNames.get(p.otherAccountId) ?? "another account";
      return p.amount.isNegative() ? `To ${other}` : `From ${other}`;
    }
    return p.categoryId ? (categoryNames.get(p.categoryId) ?? KIND_LABELS[p.kind]) : KIND_LABELS[p.kind];
  };
  // Shown in the account's own terms: for a card, a purchase raises the amount owed.
  // Liability changes are not coloured: a lower amount owed is good news, not spending.
  const effect = (r: LedgerRow) => (liability ? r.posting.amount.negate() : r.posting.amount);

  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Transactions on this account, newest first</caption>
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">
              Date
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Description
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Category / transfer
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {liability ? "Change in owed" : "Amount"}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {liability ? "Owed after" : "Balance"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={`${r.posting.transactionId}-${i}`} className="hover:bg-accent/50">
              <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.posting.occurredOn)}</td>
              <td className="py-2 pr-3">
                <Link href={`/transactions/${r.posting.transactionId}`} className="font-medium hover:underline">
                  {r.posting.description || r.posting.payee || KIND_LABELS[r.posting.kind]}
                </Link>
                <span className="ml-2 inline-flex gap-1 align-middle">
                  {r.posting.status === "pending" && <Badge variant="warning">pending</Badge>}
                  {r.posting.locked && (
                    <Badge variant="outline">
                      <Lock aria-hidden /> reconciled
                    </Badge>
                  )}
                </span>
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{detail(r)}</td>
              <td className="py-2 pr-3 text-right">
                <Amount money={effect(r)} sign="always" colored={!liability} />
              </td>
              <td className="py-2 text-right">
                <Amount money={r.balanceAfter} colored={false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="grid divide-y rounded-xl border md:hidden">
        {rows.map((r, i) => (
          <li key={`${r.posting.transactionId}-${i}`}>
            <Link href={`/transactions/${r.posting.transactionId}`} className="flex gap-3 p-4">
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate font-medium">
                  {r.posting.description || r.posting.payee || KIND_LABELS[r.posting.kind]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(r.posting.occurredOn)} · {detail(r)}
                  {r.posting.status === "pending" && " · pending"}
                  {r.posting.locked && " · reconciled"}
                </span>
              </span>
              <span className="grid justify-items-end gap-0.5 text-right">
                <Amount money={effect(r)} sign="always" colored={!liability} className="font-medium" />
                <Amount money={r.balanceAfter} colored={false} className="text-xs text-muted-foreground" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
