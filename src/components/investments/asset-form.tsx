"use client";

import { useState } from "react";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ASSET_CATEGORIES, type AssetCategory, PAR_CATEGORIES } from "@/domain/investments/types";
import { CURRENCY_CODES } from "@/domain/money/currencies";
import type { ActionState } from "@/features/action-state";
import {
  ASSET_CATEGORY_HINTS,
  ASSET_CATEGORY_LABELS,
  CATEGORY_DEFAULTS,
  DETAIL_FIELDS,
  GRAMS_PER_TOLA,
} from "@/lib/asset-meta";

export type AssetFormValues = {
  id?: string;
  name: string;
  symbol: string;
  category: AssetCategory;
  currency: string;
  unit_label: string;
  quantity_scale: string;
  valuation_mode: "manual" | "par";
  notes: string;
  details: Record<string, string>;
};

export function AssetForm({
  action,
  initial,
  locked,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initial: AssetFormValues;
  /** True once the asset has history: the currency is fixed. */
  locked: boolean;
}) {
  const [state, onSubmit, pending] = useActionForm(action, {});
  const [category, setCategory] = useState<AssetCategory>(initial.category);
  const [unitLabel, setUnitLabel] = useState(initial.unit_label);
  const [scale, setScale] = useState(initial.quantity_scale);
  const [mode, setMode] = useState(initial.valuation_mode);
  const e = state.fieldErrors ?? {};
  const parAllowed = PAR_CATEGORIES.includes(category);

  const chooseCategory = (next: AssetCategory) => {
    setCategory(next);
    // Only a brand-new asset follows the category defaults; an existing one keeps what was chosen.
    if (!initial.id) {
      setUnitLabel(CATEGORY_DEFAULTS[next].unitLabel);
      setScale(String(CATEGORY_DEFAULTS[next].quantityScale));
    }
    if (!PAR_CATEGORIES.includes(next)) setMode("manual");
  };

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-5" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <FormMessage error={state.error} />

      <SelectField
        id="category"
        label="Category"
        value={category}
        onChange={(ev) => chooseCategory(ev.target.value as AssetCategory)}
        error={e.category}
        hint={ASSET_CATEGORY_HINTS[category]}
      >
        {ASSET_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {ASSET_CATEGORY_LABELS[c]}
          </option>
        ))}
      </SelectField>

      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <FormField id="name" label="Name" defaultValue={initial.name} maxLength={100} error={e.name} />
        <FormField
          id="symbol"
          label="Symbol (optional)"
          defaultValue={initial.symbol}
          maxLength={30}
          error={e.symbol}
          hint="e.g. OGDC, MEZNPETF"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {locked ? (
          <>
            <input type="hidden" name="currency" value={initial.currency} />
            <FormField
              id="currency_display"
              label="Currency"
              value={initial.currency}
              readOnly
              disabled
              hint="Fixed once it has history."
            />
          </>
        ) : (
          <SelectField id="currency" label="Currency" defaultValue={initial.currency} error={e.currency}>
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        )}
        <FormField
          id="unit_label"
          label="Unit"
          value={unitLabel}
          onChange={(ev) => setUnitLabel(ev.target.value)}
          maxLength={20}
          error={e.unit_label}
          hint={category === "gold" ? `1 tola = ${GRAMS_PER_TOLA} g` : undefined}
        />
        <SelectField
          id="quantity_scale"
          label="Decimal places"
          value={scale}
          onChange={(ev) => setScale(ev.target.value)}
          error={e.quantity_scale}
        >
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={String(i)}>
              {i === 0 ? "0 (whole units)" : i}
            </option>
          ))}
        </SelectField>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">How is it valued?</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="valuation_mode"
            value="manual"
            checked={mode === "manual"}
            onChange={() => setMode("manual")}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            <span className="font-medium">My own dated valuations</span>
            <span className="block text-xs text-muted-foreground">
              You enter a price or total value on a date. Until then it is shown as unvalued and left out of net worth.
            </span>
          </span>
        </label>
        <label className={parAllowed ? "flex items-start gap-2 text-sm" : "flex items-start gap-2 text-sm opacity-50"}>
          <input
            type="radio"
            name="valuation_mode"
            value="par"
            checked={mode === "par"}
            onChange={() => setMode("par")}
            disabled={!parAllowed}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            <span className="font-medium">Par value (1 per unit)</span>
            <span className="block text-xs text-muted-foreground">
              For certificates, deposits and prize bonds counted at face value: enter the face value as the quantity.
              Labelled “par value (assumed)”.
            </span>
          </span>
        </label>
        {e.valuation_mode && <p className="text-sm text-destructive">{e.valuation_mode}</p>}
      </fieldset>

      {DETAIL_FIELDS[category].length > 0 && (
        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Details (optional)</legend>
          {DETAIL_FIELDS[category].map((f) => (
            <FormField
              key={`${category}-${f.key}`}
              id={`detail_${f.key}`}
              label={f.label}
              type={f.type === "date" ? "date" : "text"}
              inputMode={f.type === "percent" ? "decimal" : undefined}
              defaultValue={initial.details[f.key] ?? ""}
              maxLength={f.max}
              hint={f.hint}
              error={e[`detail_${f.key}`]}
            />
          ))}
        </fieldset>
      )}

      <div className="grid gap-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" defaultValue={initial.notes} maxLength={2000} />
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…" className="justify-self-start">
        {initial.id ? "Save asset" : "Create asset"}
      </SubmitButton>
    </form>
  );
}
