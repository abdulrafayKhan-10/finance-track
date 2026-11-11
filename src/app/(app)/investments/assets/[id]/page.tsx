import { Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/app-shell/notice";
import { PageHeader } from "@/components/app-shell/page-header";
import { Stat } from "@/components/figures/stat";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { HoldingsTable } from "@/components/investments/holdings-table";
import { Amount } from "@/components/money/amount";
import { ActionForm } from "@/components/planning/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money, ZERO } from "@/domain/money";
import { addValuation, removeAsset, removeValuation, setAssetStatus } from "@/features/investments/actions";
import { getAssetPage } from "@/features/investments/queries";
import { ASSET_CATEGORY_LABELS, DETAIL_FIELDS } from "@/lib/asset-meta";
import { requireUser } from "@/lib/auth";
import { formatDate, formatQuantity } from "@/lib/format";
import { KIND_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Asset" };

export default async function AssetPage({ params, searchParams }: PageProps<"/investments/assets/[id]">) {
  await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const page = await getAssetPage(id);
  if (!page) notFound();
  const { asset, ctx, holdings, positions, valuations, transactions } = page;
  const c = asset.currency;
  const accountName = (accountId: string) => ctx.accounts.find((a) => a.id === accountId)?.name ?? "Unknown account";

  const quantity = holdings.reduce((sum, h) => sum.plus(h.position.quantity), ZERO);
  const cost = Money.sum(
    holdings.map((h) => h.position.costBasis),
    c,
  );
  const valued = holdings.filter((h) => h.valuation.status === "valued");
  const value = Money.sum(
    valued.map((h) => (h.valuation.status === "valued" ? h.valuation.value : Money.zero(c))),
    c,
  );
  const realized = Money.sum(
    positions.map((p) => p.realized),
    c,
  );
  const latest = valuations[0];
  const detailFields = DETAIL_FIELDS[asset.category].filter((f) => typeof asset.details[f.key] === "string");

  return (
    <>
      <Notice value={query.notice} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={asset.name}
          description={[
            ASSET_CATEGORY_LABELS[asset.category],
            asset.symbol,
            `${c}, counted in ${asset.unitLabel}`,
            asset.valuationMode === "par" ? "par value" : null,
            asset.status === "archived" ? "archived" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/investments/assets/${asset.id}/edit`}>
              <Pencil aria-hidden /> Edit
            </Link>
          </Button>
          {asset.status === "active" && (
            <Button asChild>
              <Link href={`/investments/new?asset=${asset.id}`}>
                <Plus aria-hidden /> Transaction
              </Link>
            </Button>
          )}
        </div>
      </div>

      {detailFields.length > 0 && (
        <dl className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {detailFields.map((f) => (
            <div key={f.key} className="flex gap-1">
              <dt className="text-muted-foreground">{f.label}:</dt>
              <dd>
                {f.type === "date"
                  ? formatDate(String(asset.details[f.key]))
                  : `${String(asset.details[f.key])}${f.type === "percent" ? "%" : ""}`}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {asset.notes && <p className="mb-4 text-sm text-muted-foreground">{asset.notes}</p>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Held">
          <span className="tabular">
            {formatQuantity(quantity)} {asset.unitLabel}
          </span>
        </Stat>
        <Stat label="Cost basis">
          <Amount money={cost} colored={false} />
        </Stat>
        <Stat
          label="Estimated value"
          note={
            asset.valuationMode === "par"
              ? "Par value (assumed)"
              : latest
                ? `Manual valuation · ${formatDate(latest.valuedOn)}`
                : "No valuation yet"
          }
        >
          {valued.length > 0 || quantity.isZero() ? (
            <Amount money={value} colored={false} />
          ) : (
            <Badge variant="warning">unvalued</Badge>
          )}
        </Stat>
        <Stat label="Realized gain" note="From sales, all time">
          <Amount money={realized} sign="always" />
        </Stat>
      </div>

      <section className="mb-8 grid gap-3" aria-labelledby="positions-title">
        <h2 id="positions-title" className="font-semibold">
          By account
        </h2>
        <HoldingsTable holdings={holdings} accountName={accountName} showAsset={false} />
      </section>

      {asset.valuationMode === "manual" && (
        <section className="mb-8 grid gap-4" aria-labelledby="val-title">
          <h2 id="val-title" className="font-semibold">
            Valuations
          </h2>
          <p className="text-sm text-muted-foreground">
            Your own estimate of what one {asset.unitLabel.replace(/s$/, "")} was worth on a date (or the total for all
            you held). Each figure uses the latest valuation on or before its date.
          </p>
          <ActionForm
            action={addValuation}
            fields={{ asset_id: asset.id }}
            submitLabel="Save valuation"
            className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
          >
            <FormField id="valued_on" label="Date" type="date" defaultValue={ctx.today} />
            <SelectField id="entered_as" label="I’m entering" defaultValue="unit_price">
              <option value="unit_price">Value of one {asset.unitLabel.replace(/s$/, "")}</option>
              <option value="total_value">Total value of everything held</option>
            </SelectField>
            <FormField id="amount" label={`Amount (${c})`} inputMode="decimal" />
            <FormField
              id="source_note"
              label="Source (optional)"
              maxLength={200}
              hint="e.g. PSX close, jeweller quote"
            />
          </ActionForm>
          {valuations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No valuations yet.</p>
          ) : (
            <ul className="grid divide-y rounded-xl border">
              {valuations.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                  <span className="grid">
                    <span>
                      {formatDate(v.valuedOn)} · <Amount money={Money.of(v.unitPrice, c)} colored={false} /> per{" "}
                      {asset.unitLabel.replace(/s$/, "")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {v.enteredAs === "total_value" && v.enteredTotal && v.quantityAtEntry
                        ? `Entered as a total of ${Money.of(v.enteredTotal, c).toFixed()} ${c} for ${formatQuantity(v.quantityAtEntry)} ${asset.unitLabel}`
                        : "Manual valuation"}
                      {v.sourceNote && ` · ${v.sourceNote}`}
                    </span>
                  </span>
                  <ConfirmAction
                    action={removeValuation}
                    fields={{ id: v.id, asset_id: asset.id }}
                    triggerLabel="Delete"
                    title={`Delete the valuation for ${formatDate(v.valuedOn)}?`}
                    description="Figures from that date on will use the previous valuation, or show the holding as unvalued."
                    confirmLabel="Delete valuation"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mb-8 grid gap-3" aria-labelledby="tx-title">
        <h2 id="tx-title" className="font-semibold">
          Transactions
        </h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="grid divide-y rounded-xl border">
            {transactions.map((t) => {
              const m = t.movements[0];
              const cash = t.lines[0];
              return (
                <li key={t.id}>
                  <Link
                    href={`/transactions/${t.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-accent/50"
                  >
                    <span className="grid">
                      <span className="font-medium">
                        {KIND_LABELS[t.kind]}
                        {m && ` ${formatQuantity(m.quantity.abs())} ${asset.unitLabel}`}
                        {m?.unitPrice && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            @ {Money.of(m.unitPrice, c).toFixed()}
                          </span>
                        )}
                        {t.status === "pending" && (
                          <Badge variant="warning" className="ml-2">
                            pending
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(t.occurredOn)}
                        {m && ` · ${accountName(m.accountId)}`}
                        {cash && ` · ${cash.amount.isNegative() ? "from" : "into"} ${accountName(cash.accountId)}`}
                      </span>
                    </span>
                    {cash && <Amount money={cash.amount} sign="always" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap gap-2 border-t pt-6">
        <ActionForm
          action={setAssetStatus}
          fields={{ id: asset.id, status: asset.status === "active" ? "archived" : "active" }}
          submitLabel={asset.status === "active" ? "Archive" : "Restore"}
          variant="outline"
        />
        {!page.hasHistory && (
          <ConfirmAction
            action={removeAsset}
            fields={{ id: asset.id }}
            triggerLabel="Delete asset"
            title={`Delete “${asset.name}”?`}
            description="It has no transactions or valuations, so nothing else changes."
            confirmLabel="Delete asset"
          />
        )}
      </section>
    </>
  );
}
