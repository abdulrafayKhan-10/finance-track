import { Lock } from "lucide-react";
import Link from "next/link";
import { Amount } from "@/components/money/amount";
import { Badge } from "@/components/ui/badge";
import type { TransactionView } from "@/features/transactions/queries";
import { formatDate } from "@/lib/format";
import { KIND_LABELS } from "@/lib/labels";

function Title({ t }: { t: TransactionView }) {
  return <>{t.description || t.payee || KIND_LABELS[t.kind]}</>;
}

function Flags({ t }: { t: TransactionView }) {
  return (
    <>
      {t.status === "pending" && <Badge variant="warning">pending</Badge>}
      {t.reconciliationId && (
        <Badge variant="outline">
          <Lock aria-hidden /> reconciled
        </Badge>
      )}
    </>
  );
}

/** Transfers show the amount moved, without a sign: they are neither income nor spending. */
function Headline({ t, className }: { t: TransactionView; className?: string }) {
  return (
    <Amount
      money={t.headline}
      sign={t.kind === "transfer" ? "never" : "always"}
      colored={t.kind !== "transfer"}
      className={className}
    />
  );
}

export function TransactionList({ items }: { items: TransactionView[] }) {
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Transactions</caption>
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">
              Date
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Description
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Type
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Account
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Category
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((t) => (
            <tr key={t.id} className="hover:bg-accent/50">
              <td className="py-2 pr-3 whitespace-nowrap">{formatDate(t.occurredOn)}</td>
              <td className="py-2 pr-3">
                <Link href={`/transactions/${t.id}`} className="font-medium hover:underline">
                  <Title t={t} />
                </Link>
                <span className="ml-2 inline-flex gap-1 align-middle">
                  <Flags t={t} />
                </span>
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{KIND_LABELS[t.kind]}</td>
              <td className="py-2 pr-3 text-muted-foreground">{t.accountLabel}</td>
              <td className="py-2 pr-3 text-muted-foreground">{t.categoryLabel ?? "—"}</td>
              <td className="py-2 text-right">
                <Headline t={t} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="grid divide-y rounded-xl border md:hidden">
        {items.map((t) => (
          <li key={t.id}>
            <Link href={`/transactions/${t.id}`} className="flex gap-3 p-4">
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="truncate font-medium">
                  <Title t={t} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(t.occurredOn)} · {t.categoryLabel ?? KIND_LABELS[t.kind]} · {t.accountLabel}
                </span>
                <span className="flex gap-1">
                  <Flags t={t} />
                </span>
              </span>
              <Headline t={t} className="font-medium" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
