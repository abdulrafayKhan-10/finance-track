"use client";

import { useMemo, useState } from "react";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { isIsoDate } from "@/domain/dates";
import { accountBalance, type Account, displayBalance, storedFromDisplay } from "@/domain/ledger";
import { type CurrencyCode, Money, parseAmount } from "@/domain/money";
import type { ActionState } from "@/features/action-state";
import { formatDate, formatMoney } from "@/lib/format";

export type ReconcilePosting = {
  transactionId: string;
  occurredOn: string;
  description: string;
  /** Stored sign, decimal string. */
  amount: string;
  status: "cleared" | "pending";
};

export type ReconcileAccount = {
  id: string;
  currency: CurrencyCode;
  class: "asset" | "liability";
  openingBalance: string;
  openingDate: string;
};

export function ReconcileForm({
  action,
  account,
  postings,
  defaultDate,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  account: ReconcileAccount;
  postings: ReconcilePosting[];
  defaultDate: string;
}) {
  const [state, onSubmit, pending] = useActionForm(action, {});
  const [date, setDate] = useState(defaultDate);
  const [statement, setStatement] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const e = state.fieldErrors ?? {};
  const liability = account.class === "liability";

  const domainAccount: Account = useMemo(
    () => ({
      id: account.id,
      name: "",
      type: liability ? "credit_card" : "bank",
      class: account.class,
      currency: account.currency,
      openingBalance: Money.of(account.openingBalance, account.currency),
      openingDate: account.openingDate,
      status: "active",
      includeInNetWorth: true,
      isLiquid: true,
    }),
    [account, liability],
  );

  const validDate = isIsoDate(date);
  const candidates = postings.filter((p) => p.status === "pending" && validDate && p.occurredOn <= date);
  const asPostings = postings.map((p) => ({
    accountId: account.id,
    amount: Money.of(p.amount, account.currency),
    occurredOn: p.occurredOn,
    status: p.status === "cleared" || ticked.has(p.transactionId) ? ("cleared" as const) : ("pending" as const),
  }));
  const cleared = validDate ? accountBalance(domainAccount, asPostings, { asOf: date, clearedOnly: true }) : null;
  const parsed = statement.trim() ? parseAmount(statement, account.currency) : null;
  const difference = cleared && parsed?.ok ? storedFromDisplay(domainAccount, parsed.money).minus(cleared) : null;

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-5" noValidate>
      <input type="hidden" name="account_id" value={account.id} />
      <FormMessage error={state.error} />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="statement_date"
          label="Statement date"
          type="date"
          value={date}
          onChange={(ev) => setDate(ev.target.value)}
          error={e.statement_date}
        />
        <FormField
          id="statement_balance"
          label={
            liability ? `Amount owed on the statement (${account.currency})` : `Statement balance (${account.currency})`
          }
          inputMode="decimal"
          value={statement}
          onChange={(ev) => setStatement(ev.target.value)}
          error={e.statement_balance}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Pending items on or before the statement date</legend>
        <p className="text-xs text-muted-foreground">
          Tick the ones that appear on the statement; they will be marked cleared.
        </p>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="grid divide-y rounded-xl border">
            {candidates.map((p) => (
              <li key={p.transactionId} className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  name="clear"
                  value={p.transactionId}
                  id={`clear-${p.transactionId}`}
                  checked={ticked.has(p.transactionId)}
                  onChange={() => toggle(p.transactionId)}
                  className="size-5 accent-[var(--primary)] md:size-4"
                />
                <label
                  htmlFor={`clear-${p.transactionId}`}
                  className="flex flex-1 flex-wrap justify-between gap-2 text-sm"
                >
                  <span>
                    {formatDate(p.occurredOn)} · {p.description || "Untitled"}
                  </span>
                  <span className="tabular">
                    {formatMoney(displayBalance(domainAccount, Money.of(p.amount, account.currency)), {
                      sign: "always",
                    })}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <dl className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2" aria-live="polite">
        <div>
          <dt className="text-xs text-muted-foreground">
            Cleared {liability ? "amount owed" : "balance"} on that date
          </dt>
          <dd className="tabular text-lg font-semibold">
            {cleared ? formatMoney(displayBalance(domainAccount, cleared)) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Difference (statement − cleared)</dt>
          <dd
            className={
              difference && !difference.isZero()
                ? "tabular text-lg font-semibold text-warning"
                : "tabular text-lg font-semibold"
            }
          >
            {difference
              ? difference.isZero()
                ? "None: reconciled"
                : formatMoney(displayBalance(domainAccount, difference), { sign: "always" })
              : "—"}
          </dd>
        </div>
      </dl>

      <CheckboxField
        id="create_adjustment"
        label="Record an adjustment for any difference"
        hint="Adds a cleared adjustment dated on the statement date so the cleared balance matches the statement. Leave unticked to keep investigating."
      />
      <FormField id="note" label="Note (optional)" maxLength={500} error={e.note} />
      <SubmitButton pending={pending} pendingLabel="Saving…" className="justify-self-start">
        Save reconciliation
      </SubmitButton>
    </form>
  );
}
