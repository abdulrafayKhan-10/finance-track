import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Amount } from "@/components/money/amount";
import { Badge } from "@/components/ui/badge";
import type { AccountGroup } from "@/features/accounts/queries";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";

export function AccountGroups({ groups }: { groups: AccountGroup[] }) {
  return (
    <div className="grid gap-8">
      {groups.map((group) =>
        group.items.length === 0 ? null : (
          <section key={group.key} aria-labelledby={`group-${group.key}`} className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`group-${group.key}`} className="font-semibold">
                {group.title}
              </h2>
              {group.key !== "inactive" && (
                <p className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  {group.totals.map((t) => (
                    <span key={t.currency}>
                      {t.currency} total <Amount money={t} className="font-medium text-foreground" />
                    </span>
                  ))}
                </p>
              )}
            </div>
            <ul className="grid divide-y overflow-hidden rounded-xl border">
              {group.items.map(({ account, balance, clearedBalance }) => (
                <li key={account.id}>
                  <Link href={`/accounts/${account.id}`} className="flex items-center gap-3 p-4 hover:bg-accent">
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-medium">{account.name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency}
                        {account.status !== "active" && <Badge variant="outline">{account.status}</Badge>}
                        {!account.includeInNetWorth && <Badge variant="outline">not in net worth</Badge>}
                      </span>
                    </span>
                    <span className="grid justify-items-end gap-0.5 text-right">
                      <Amount money={balance} className="font-medium" />
                      {!clearedBalance.equals(balance) && (
                        <span className="text-xs text-muted-foreground">
                          cleared <Amount money={clearedBalance} colored={false} />
                        </span>
                      )}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
