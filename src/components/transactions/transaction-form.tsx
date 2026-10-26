"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CASH_KINDS, type CashKind } from "@/domain/ledger/types";
import type { ActionState } from "@/features/action-state";
import type { AccountOption } from "@/features/accounts/queries";
import type { CategoryOption } from "@/features/categories/queries";
import type { TransactionFormValues } from "@/features/transactions/form-values";
import { KIND_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const KIND_HINTS: Record<CashKind, string> = {
  expense: "Money spent. Card purchases count here on the purchase date.",
  income: "Money earned: salary, business income, gifts received.",
  transfer: "Money moved between your own accounts, including paying a credit card. Not income or spending.",
  refund: "Money returned for an earlier expense. It reduces spending in its category.",
  adjustment: "A correction to a balance, e.g. after reconciling. Not income or spending; a reason is required.",
};

export function TransactionForm({
  action,
  accounts,
  categories,
  initial,
  id,
  expectedUpdatedAt,
  locked = false,
  returnTo,
  cancelHref,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  accounts: AccountOption[];
  categories: CategoryOption[];
  initial: TransactionFormValues;
  id?: string;
  expectedUpdatedAt?: string;
  locked?: boolean;
  returnTo?: string;
  cancelHref: string;
}) {
  const [state, onSubmit, pending] = useActionForm(action, {});
  const [kind, setKind] = useState<CashKind>(initial.kind);
  const [accountId, setAccountId] = useState(initial.account_id);
  const [fromId, setFromId] = useState(initial.from_account_id);
  const [toId, setToId] = useState(initial.to_account_id);
  const e = state.fieldErrors ?? {};

  // Accounts used by this transaction stay selectable even if archived since.
  const usable = accounts.filter(
    (a) =>
      a.status !== "archived" || [initial.account_id, initial.from_account_id, initial.to_account_id].includes(a.id),
  );
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const account = byId.get(accountId);
  const from = byId.get(fromId);
  const to = byId.get(toId);
  const crossCurrency = Boolean(from && to && from.currency !== to.currency);
  const categoryKind = kind === "income" ? "income" : "expense";
  const categoryChoices = categories.filter(
    (c) => c.kind === categoryKind && (!c.archived || c.id === initial.category_id),
  );

  const accountOptions = (
    <>
      <option value="">Choose an account</option>
      {usable.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} ({a.currency})
        </option>
      ))}
    </>
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-5" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      {expectedUpdatedAt && <input type="hidden" name="expected_updated_at" value={expectedUpdatedAt} />}
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      <FormMessage error={state.error} />

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {CASH_KINDS.map((k) => (
            <label
              key={k}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 md:min-h-9",
                kind === k
                  ? "border-primary bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="sr-only"
              />
              {KIND_LABELS[k]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{KIND_HINTS[kind]}</p>
      </fieldset>

      {kind === "transfer" ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id="from_account_id"
              label="From"
              value={fromId}
              onChange={(ev) => setFromId(ev.target.value)}
              error={e.from_account_id}
            >
              {accountOptions}
            </SelectField>
            <SelectField
              id="to_account_id"
              label="To"
              value={toId}
              onChange={(ev) => setToId(ev.target.value)}
              error={e.to_account_id}
            >
              {accountOptions}
            </SelectField>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="amount"
              label={`Amount sent${from ? ` (${from.currency})` : ""}`}
              inputMode="decimal"
              defaultValue={initial.amount}
              error={e.amount}
            />
            {crossCurrency && (
              <FormField
                id="received_amount"
                label={`Amount received (${to!.currency})`}
                inputMode="decimal"
                defaultValue={initial.received_amount}
                error={e.received_amount}
                hint="What arrived after conversion. The rate is implied by the two amounts."
              />
            )}
          </div>
        </>
      ) : (
        <>
          <SelectField
            id="account_id"
            label="Account"
            value={accountId}
            onChange={(ev) => setAccountId(ev.target.value)}
            error={e.account_id}
          >
            {accountOptions}
          </SelectField>
          {kind === "adjustment" && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Direction</legend>
              {(["increase", "decrease"] as const).map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="direction"
                    value={d}
                    defaultChecked={initial.direction === d}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {account?.class === "liability"
                    ? d === "increase"
                      ? "Increase the amount owed"
                      : "Decrease the amount owed"
                    : d === "increase"
                      ? "Increase the balance"
                      : "Decrease the balance"}
                </label>
              ))}
              {e.direction && <p className="text-sm text-destructive">{e.direction}</p>}
            </fieldset>
          )}
          <FormField
            id="amount"
            label={`Amount${account ? ` (${account.currency})` : ""}`}
            inputMode="decimal"
            defaultValue={initial.amount}
            error={e.amount}
            hint={
              kind === "expense" || kind === "income" || kind === "refund"
                ? "Enter a positive amount; the type decides the direction."
                : undefined
            }
          />
          {kind !== "adjustment" && (
            <SelectField
              id="category_id"
              label="Category"
              defaultValue={initial.category_id}
              key={categoryKind}
              error={e.category_id}
            >
              <option value="">Choose a category</option>
              {categoryChoices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </SelectField>
          )}
        </>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="occurred_on"
          label="Date"
          type="date"
          defaultValue={initial.occurred_on}
          required
          error={e.occurred_on}
        />
        <SelectField
          id="status"
          label="Status"
          defaultValue={initial.status}
          hint="Pending items are left out of the cleared balance used for reconciling."
        >
          <option value="cleared">Cleared</option>
          <option value="pending">Pending</option>
        </SelectField>
      </div>
      <FormField
        id="description"
        label="Description"
        defaultValue={initial.description}
        maxLength={200}
        error={e.description}
      />
      {kind !== "transfer" && (
        <FormField
          id="payee"
          label="Payee or payer (optional)"
          defaultValue={initial.payee}
          maxLength={100}
          error={e.payee}
        />
      )}
      <FormField
        id="tags"
        label="Tags (optional)"
        defaultValue={initial.tags}
        hint="Separate with commas."
        error={e.tags}
      />
      <div className="grid gap-2">
        <Label htmlFor="notes">{kind === "adjustment" ? "Reason (required)" : "Notes (optional)"}</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={initial.notes}
          maxLength={2000}
          aria-invalid={e.notes ? true : undefined}
          aria-describedby={e.notes ? "notes-error" : undefined}
        />
        {e.notes && (
          <p id="notes-error" className="text-sm text-destructive">
            {e.notes}
          </p>
        )}
      </div>

      {(locked || state.needsUnlock) && (
        <div className="rounded-lg border border-warning/50 p-4">
          <CheckboxField
            id="unlock"
            label="Unlock this reconciled transaction"
            hint="It is part of a reconciliation. Changing it detaches it, and the account will show “changed since reconciled”."
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {id ? "Save changes" : "Add transaction"}
        </SubmitButton>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
