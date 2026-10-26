import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { point } from "@/components/charts/chart-data";
import { NetWorthTrend } from "@/components/charts/net-worth-trend";
import { ExcludedNote } from "@/components/figures/excluded-note";
import { Stat } from "@/components/figures/stat";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormField } from "@/components/forms/form-field";
import { Amount } from "@/components/money/amount";
import { ActionForm } from "@/components/planning/action-form";
import { Badge } from "@/components/ui/badge";
import { displayBalance } from "@/domain/ledger";
import { createSnapshot, removeSnapshot } from "@/features/networth/actions";
import { getNetWorthPage } from "@/features/networth/queries";
import { requireUser } from "@/lib/auth";
import { formatDate, formatMonthShort } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Net worth" };

export default async function NetWorthPage() {
  await requireUser();
  const { ctx, current, trend, snapshots } = await getNetWorthPage();
  const byClass = (cls: "asset" | "liability") => current.accounts.filter((a) => a.class === cls);
  const excludedAccounts = ctx.accounts.filter((a) => !a.includeInNetWorth);

  return (
    <>
      <PageHeader
        title="Net worth"
        description={`Assets minus liabilities, in ${current.currency}, as of ${formatDate(current.asOf)}. Each balance is converted at the exchange rate in force on that date.`}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Net worth">
          <Amount money={current.netWorth} />
        </Stat>
        <Stat label="Assets">
          <Amount money={current.assets} />
        </Stat>
        <Stat label="Liabilities (owed)">
          <Amount money={current.liabilities} colored={false} />
        </Stat>
      </div>
      <div className="mb-6">
        <ExcludedNote excluded={current.unconvertible.map((a) => a.balance)} stale={current.usedStaleRate} />
      </div>

      <section className="mb-8 grid gap-2 rounded-xl border bg-card p-4" aria-labelledby="trend-title">
        <h2 id="trend-title" className="font-semibold">
          Last 24 months (month-end)
        </h2>
        <p className="text-xs text-muted-foreground">
          Recalculated from your records each time; dots mark months with a saved snapshot.
        </p>
        <NetWorthTrend
          points={trend.map((p) => ({
            ...point(formatMonthShort(p.date), p.netWorth.netWorth),
            snapshot: p.snapshot !== null,
          }))}
          height={260}
        />
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">Show as a table</summary>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-1">
                  Date
                </th>
                <th scope="col" className="py-1 text-right">
                  Net worth
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...trend].reverse().map((p) => (
                <tr key={p.date}>
                  <td className="py-1">{formatDate(p.date)}</td>
                  <td className="py-1 text-right">
                    <Amount money={p.netWorth.netWorth} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {(["asset", "liability"] as const).map((cls) => (
          <section key={cls} className="grid content-start gap-2" aria-labelledby={`nw-${cls}`}>
            <h2 id={`nw-${cls}`} className="font-semibold">
              {cls === "asset" ? "Assets" : "Liabilities"}
            </h2>
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-2 font-medium">
                    Account
                  </th>
                  <th scope="col" className="py-2 pr-2 text-right font-medium">
                    Balance
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    In {current.currency}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byClass(cls).map((a) => (
                  <tr key={a.accountId}>
                    <td className="py-2 pr-2">
                      <Link href={`/accounts/${a.accountId}`} className="hover:underline">
                        {a.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[a.type]}</div>
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <Amount money={displayBalance(a, a.balance)} colored={false} />
                    </td>
                    <td className="py-2 text-right">
                      {a.converted ? (
                        <>
                          <Amount money={displayBalance(a, a.converted)} colored={false} />
                          {a.rate && (
                            <div className="text-xs text-muted-foreground">
                              at {a.rate.rate.toDecimalPlaces(6).toString()} ({formatDate(a.rate.effectiveOn)})
                              {a.rate.stale && (
                                <Badge variant="warning" className="ml-1">
                                  old rate
                                </Badge>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-warning">No rate</span>
                      )}
                    </td>
                  </tr>
                ))}
                {byClass(cls).length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-2 text-muted-foreground">
                      None.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <p className="mb-8 text-xs text-muted-foreground">
        Not counted: savings-goal allocations (they earmark money already in these accounts)
        {excludedAccounts.length > 0 && (
          <>, and accounts you excluded: {excludedAccounts.map((a) => a.name).join(", ")}</>
        )}
        . Investment holdings are added in Phase 5.
      </p>

      <section className="grid gap-4 border-t pt-6" aria-labelledby="snap-title">
        <h2 id="snap-title" className="font-semibold">
          Snapshots
        </h2>
        <p className="text-sm text-muted-foreground">
          A snapshot freezes the figures for a date together with every balance and exchange rate used, so you can see
          later exactly what was counted.
        </p>
        <ActionForm action={createSnapshot} submitLabel="Save snapshot" className="flex flex-wrap items-end gap-3">
          <FormField id="as_of" label="Date (blank = today)" type="date" className="w-auto" />
        </ActionForm>
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No snapshots yet.</p>
        ) : (
          <ul className="grid divide-y rounded-xl border">
            {snapshots.map((s) => {
              const recalculated = trend.find((p) => p.date === s.asOf)?.netWorth.netWorth;
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div className="grid gap-0.5">
                    <span className="font-medium">{formatDate(s.asOf)}</span>
                    <span className="text-muted-foreground">
                      <Amount money={s.netWorth} /> · assets <Amount money={s.assets} colored={false} /> · owed{" "}
                      <Amount money={s.liabilities} colored={false} />
                    </span>
                    {recalculated && !recalculated.equals(s.netWorth) && (
                      <Badge variant="warning">
                        records changed since: now <Amount money={recalculated} colored={false} />
                      </Badge>
                    )}
                  </div>
                  <ConfirmAction
                    action={removeSnapshot}
                    fields={{ id: s.id }}
                    triggerLabel="Delete"
                    title={`Delete the snapshot for ${formatDate(s.asOf)}?`}
                    description="Only the frozen record is removed; your accounts and transactions are not affected."
                    confirmLabel="Delete snapshot"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
