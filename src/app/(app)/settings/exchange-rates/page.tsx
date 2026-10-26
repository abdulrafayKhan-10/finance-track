import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { ActionForm } from "@/components/planning/action-form";
import { CURRENCY_CODES } from "@/domain/money";
import { addExchangeRate, removeExchangeRate } from "@/features/exchange-rates/actions";
import { loadFinanceContext } from "@/features/finance-context";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Exchange rates" };

export default async function ExchangeRatesPage() {
  await requireUser();
  const ctx = await loadFinanceContext();
  const used = [...new Set(ctx.accounts.map((a) => a.currency))].filter((c) => c !== ctx.profile.baseCurrency);
  return (
    <>
      <PageHeader
        title="Exchange rates"
        description={`Your own dated rates. An amount on a given date uses the latest rate on or before that date; today's rate is never applied to the past. Reporting currency: ${ctx.profile.baseCurrency}.`}
      />
      {used.length > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          Your accounts use {used.join(", ")} besides {ctx.profile.baseCurrency}: add a rate for each from the earliest
          date you need.
        </p>
      )}
      <ActionForm
        action={addExchangeRate}
        submitLabel="Add rate"
        className="mb-8 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <SelectField id="base" label="1 unit of" defaultValue={used[0] ?? "USD"}>
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
        <FormField id="rate" label="equals" inputMode="decimal" placeholder="e.g. 280.25" />
        <SelectField id="quote" label="of" defaultValue={ctx.profile.baseCurrency}>
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
        <FormField id="effective_on" label="From date" type="date" defaultValue={ctx.today} />
        <div className="sm:col-span-2 lg:col-span-4">
          <FormField
            id="source_note"
            label="Source (optional)"
            maxLength={200}
            placeholder="e.g. bank statement, SBP rate"
          />
        </div>
      </ActionForm>
      {ctx.rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rates yet. Amounts in other currencies show as “not included” until a rate exists.
        </p>
      ) : (
        <ul className="grid divide-y rounded-xl border">
          {ctx.rates.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <span className="grid">
                <span className="tabular font-medium">
                  1 {r.base} = {r.rate.toString()} {r.quote}
                </span>
                <span className="text-xs text-muted-foreground">
                  from {formatDate(r.effectiveOn)}
                  {r.sourceNote && ` · ${r.sourceNote}`}
                </span>
              </span>
              <ConfirmAction
                action={removeExchangeRate}
                fields={{ id: r.id }}
                triggerLabel="Delete"
                title={`Delete 1 ${r.base} = ${r.rate.toString()} ${r.quote} (${formatDate(r.effectiveOn)})?`}
                description="Reports that used this rate will use the next earlier rate, or show the amounts as not included."
                confirmLabel="Delete rate"
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
