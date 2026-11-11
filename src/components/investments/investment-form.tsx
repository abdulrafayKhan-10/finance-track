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
import { INVESTMENT_KINDS, type InvestmentKind } from "@/domain/investments/types";
import type { ActionState } from "@/features/action-state";
import type { AccountOption } from "@/features/accounts/queries";
import type { InvestmentFormValues } from "@/features/investments/form-values";
import type { AssetOption } from "@/features/investments/options";
import { INVESTMENT_KIND_HINTS } from "@/lib/asset-meta";
import { KIND_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const HOLDING_KINDS: InvestmentKind[] = ["buy", "sell", "opening_holding", "split"];
const CASH_KINDS: InvestmentKind[] = ["buy", "sell", "dividend", "interest", "investment_fee"];

export function InvestmentForm({
  action,
  assets,
  investmentAccounts,
  cashAccounts,
  initial,
  id,
  expectedUpdatedAt,
  locked = false,
  cancelHref,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  assets: AssetOption[];
  /** Investment-type accounts, which hold positions. */
  investmentAccounts: AccountOption[];
  /** Asset-class accounts that can pay or receive money. */
  cashAccounts: AccountOption[];
  initial: InvestmentFormValues;
  id?: string;
  expectedUpdatedAt?: string;
  locked?: boolean;
  cancelHref: string;
}) {
  const [state, onSubmit, pending] = useActionForm(action, {});
  const [kind, setKind] = useState<InvestmentKind>(initial.kind);
  const [assetId, setAssetId] = useState(initial.asset_id);
  const [holdingId, setHoldingId] = useState(initial.account_id);
  const [cashId, setCashId] = useState(initial.cash_account_id || initial.account_id);
  const e = state.fieldErrors ?? {};

  const asset = assets.find((a) => a.id === assetId);
  const cash = cashAccounts.find((a) => a.id === cashId);
  const crossCurrency = Boolean(asset && cash && asset.currency !== cash.currency);
  const inCurrency = asset ? ` (${asset.currency})` : "";
  const usableAssets = assets.filter((a) => !a.archived || a.id === initial.asset_id);
  const usable = (list: AccountOption[], keep: string) => list.filter((a) => a.status !== "archived" || a.id === keep);

  const moneyIn = kind === "sell" || kind === "dividend" || kind === "interest";

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-5" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      {expectedUpdatedAt && <input type="hidden" name="expected_updated_at" value={expectedUpdatedAt} />}
      <FormMessage error={state.error} />

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {INVESTMENT_KINDS.map((k) => (
            <label
              key={k}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 md:min-h-9",
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
        <p className="text-xs text-muted-foreground">{INVESTMENT_KIND_HINTS[kind]}</p>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="asset_id"
          label={kind === "investment_fee" ? "Asset (optional)" : "Asset"}
          value={assetId}
          onChange={(ev) => setAssetId(ev.target.value)}
          error={e.asset_id}
        >
          <option value="">{kind === "investment_fee" ? "Not about one asset" : "Choose an asset"}</option>
          {usableAssets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>
        <FormField id="occurred_on" label="Date" type="date" defaultValue={initial.occurred_on} error={e.occurred_on} />
      </div>
      {assets.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No assets yet.{" "}
          <Link href="/investments/assets/new" className="underline">
            Add an asset
          </Link>{" "}
          first.
        </p>
      )}

      {HOLDING_KINDS.includes(kind) && (
        <SelectField
          id="account_id"
          label="Held in (investment account)"
          value={holdingId}
          onChange={(ev) => setHoldingId(ev.target.value)}
          error={e.account_id}
          hint={investmentAccounts.length === 0 ? "Create an account of type “Investment account” first." : undefined}
        >
          <option value="">Choose an investment account</option>
          {usable(investmentAccounts, initial.account_id).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>
      )}

      {(kind === "buy" || kind === "sell" || kind === "opening_holding") && (
        <FormField
          id="quantity"
          label={`Quantity${asset ? ` (${asset.unitLabel})` : ""}`}
          inputMode="decimal"
          defaultValue={initial.quantity}
          error={e.quantity}
          hint={
            asset
              ? asset.quantityScale === 0
                ? "Whole units only."
                : `Up to ${asset.quantityScale} decimal places.`
              : undefined
          }
        />
      )}

      {kind === "split" && (
        <FormField
          id="quantity_change"
          label={`Units added${asset ? ` (${asset.unitLabel})` : ""}`}
          inputMode="decimal"
          defaultValue={initial.quantity_change}
          error={e.quantity_change}
          hint="E.g. a 1-for-1 bonus on 100 shares adds 100. Use a minus sign for a reverse split. Total cost stays the same."
        />
      )}

      {(kind === "buy" || kind === "sell") && (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="unit_price"
            label={`Price per unit${inCurrency}`}
            inputMode="decimal"
            defaultValue={initial.unit_price}
            error={e.unit_price}
          />
          <FormField
            id="fee"
            label={`Fees and taxes${inCurrency} (optional)`}
            inputMode="decimal"
            defaultValue={initial.fee}
            error={e.fee}
            hint={kind === "buy" ? "Added to the cost." : "Taken from the proceeds."}
          />
        </div>
      )}

      {kind === "opening_holding" && (
        <FormField
          id="cost_amount"
          label={`Total cost you paid${inCurrency}`}
          inputMode="decimal"
          defaultValue={initial.cost_amount}
          error={e.cost_amount}
          hint="What you originally paid in total, including fees. Not today’s value: add that as a valuation."
        />
      )}

      {CASH_KINDS.includes(kind) && (
        <SelectField
          id="cash_account_id"
          label={moneyIn ? "Paid into" : "Paid from"}
          value={cashId}
          onChange={(ev) => setCashId(ev.target.value)}
          error={e.cash_account_id}
          hint={
            kind === "buy" || kind === "sell"
              ? "Often the investment account’s own cash, or your bank account."
              : undefined
          }
        >
          <option value="">Choose an account</option>
          {usable(cashAccounts, initial.cash_account_id).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>
      )}

      {(kind === "buy" || kind === "sell") && crossCurrency && (
        <FormField
          id="cash_amount"
          label={`Amount ${moneyIn ? "received" : "paid"} (${cash!.currency})`}
          inputMode="decimal"
          defaultValue={initial.cash_amount}
          error={e.cash_amount}
          hint={`The account is in ${cash!.currency} and the asset in ${asset!.currency}. Enter what actually left or reached the account.`}
        />
      )}

      {(kind === "dividend" || kind === "interest" || kind === "investment_fee") && (
        <FormField
          id="amount"
          label={`Amount${cash ? ` (${cash.currency})` : ""}`}
          inputMode="decimal"
          defaultValue={initial.amount}
          error={e.amount}
        />
      )}

      <FormField
        id="description"
        label="Description (optional)"
        defaultValue={initial.description}
        maxLength={200}
        error={e.description}
        hint="Left empty, it becomes e.g. “Buy · OGDC”."
      />
      <div className="grid gap-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" defaultValue={initial.notes} maxLength={2000} />
      </div>
      <SelectField id="status" label="Status" defaultValue={initial.status}>
        <option value="cleared">Cleared</option>
        <option value="pending">Pending</option>
      </SelectField>
      {locked && <CheckboxField id="unlock" label="Yes, change it even though it is reconciled" />}

      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {id ? "Save changes" : "Save transaction"}
        </SubmitButton>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
