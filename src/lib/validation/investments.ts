import { z } from "zod";
import type { MovementPayload, TransactionPayload } from "@/data/supabase/database.types";
import {
  ASSET_CATEGORIES,
  type Asset,
  INVESTMENT_KINDS,
  type InvestmentKind,
  PAR_CATEGORIES,
} from "@/domain/investments/types";
import type { Account } from "@/domain/ledger";
import { CURRENCY_CODES, type CurrencyCode, Dec, minorUnits, type Money, parseAmount } from "@/domain/money";
import { DETAIL_FIELDS } from "@/lib/asset-meta";
import { KIND_LABELS } from "@/lib/labels";
import { fieldErrors, type FieldErrors } from "./auth";
import { AMOUNT_ERRORS, formObject, isoDate, optionalText, requiredText } from "./form";

type Result<T> = { ok: true; values: T } | { ok: false; fieldErrors: FieldErrors };

// Numbers ------------------------------------------------------------------------------

const clean = (input: unknown) => (typeof input === "string" ? input.trim().replace(/[,\s_]/g, "") : "");

/** A quantity typed by the user. More decimals than the asset allows is an error, never rounded. */
export function parseQuantity(
  input: unknown,
  scale: number,
  { allowNegative = false }: { allowNegative?: boolean } = {},
): { ok: true; value: Dec } | { ok: false; error: string } {
  const s = clean(input);
  if (s === "") return { ok: false, error: "Enter a quantity." };
  if (!/^-?\d{1,17}(\.\d+)?$/.test(s)) return { ok: false, error: "Enter a number, like 10 or 2.5." };
  const decimals = s.split(".")[1]?.length ?? 0;
  if (decimals > scale) {
    return {
      ok: false,
      error:
        scale === 0
          ? "This asset is counted in whole units."
          : `This asset allows at most ${scale} decimal place${scale === 1 ? "" : "s"}.`,
    };
  }
  const value = new Dec(s);
  if (value.isZero()) return { ok: false, error: "The quantity can't be zero." };
  if (value.isNegative() && !allowNegative) return { ok: false, error: "Enter a quantity greater than zero." };
  return { ok: true, value };
}

/** A unit price in the asset currency: up to 10 decimal places, zero allowed (e.g. a worthless holding). */
export function parseUnitPrice(input: unknown): { ok: true; value: Dec } | { ok: false; error: string } {
  const s = clean(input);
  if (s === "") return { ok: false, error: "Enter a price per unit." };
  if (!/^\d{1,17}(\.\d{1,10})?$/.test(s)) return { ok: false, error: "Enter a price with up to 10 decimal places." };
  return { ok: true, value: new Dec(s) };
}

function money(
  input: unknown,
  currency: CurrencyCode,
  { allowZero = false, optional = false }: { allowZero?: boolean; optional?: boolean } = {},
): { ok: true; money: Money | null } | { ok: false; error: string } {
  if (optional && clean(input) === "") return { ok: true, money: null };
  const r = parseAmount(typeof input === "string" ? input : "", currency);
  if (!r.ok) return { ok: false, error: AMOUNT_ERRORS[r.error] };
  if (r.money.isNegative() || (!allowZero && r.money.isZero())) {
    return { ok: false, error: allowZero ? "Enter zero or more." : "Enter an amount greater than zero." };
  }
  return { ok: true, money: r.money };
}

// Assets -----------------------------------------------------------------------------------

const assetSchema = z
  .object({
    name: requiredText(100, "a name"),
    symbol: optionalText(30),
    category: z.enum(ASSET_CATEGORIES, { error: "Choose a category." }),
    currency: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
    unit_label: requiredText(20, "a unit, like shares or tola"),
    quantity_scale: z.coerce
      .number({ error: "Choose the decimal places." })
      .int({ error: "Choose the decimal places." })
      .min(0, { error: "Choose between 0 and 10." })
      .max(10, { error: "Choose between 0 and 10." }),
    valuation_mode: z.enum(["manual", "par"]).default("manual"),
    notes: optionalText(2000),
  })
  .refine((v) => v.valuation_mode === "manual" || PAR_CATEGORIES.includes(v.category), {
    error: "Par value is only available for fixed income and cash-like assets.",
    path: ["valuation_mode"],
  });

export type AssetValues = z.infer<typeof assetSchema> & { details: Record<string, string> };

export function parseAssetForm(formData: FormData): Result<AssetValues> {
  const raw = formObject(formData);
  const r = assetSchema.safeParse(raw);
  if (!r.success) return { ok: false, fieldErrors: fieldErrors(r.error) };
  const details: Record<string, string> = {};
  const errors: FieldErrors = {};
  for (const f of DETAIL_FIELDS[r.data.category]) {
    const value = (raw[`detail_${f.key}`] ?? "").trim();
    if (!value) continue;
    if (f.type === "date" && !isoDate.safeParse(value).success) errors[`detail_${f.key}`] = "Enter a valid date.";
    else if (f.type === "percent" && !/^\d{1,3}(\.\d{1,4})?$/.test(value))
      errors[`detail_${f.key}`] = "Enter a percentage, like 12.5.";
    else if (value.length > (f.max ?? 100)) errors[`detail_${f.key}`] = `Use at most ${f.max} characters.`;
    else details[f.key] = value;
  }
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };
  return { ok: true, values: { ...r.data, details } };
}

// Valuations ---------------------------------------------------------------------------------

const valuationSchema = z.object({
  asset_id: z.uuid({ error: "That asset no longer exists." }),
  valued_on: isoDate,
  entered_as: z.enum(["unit_price", "total_value"]).default("unit_price"),
  amount: z.string().default(""),
  source_note: optionalText(200),
});

export type ValuationInput =
  | { assetId: string; valuedOn: string; enteredAs: "unit_price"; unitPrice: Dec; sourceNote: string | null }
  | { assetId: string; valuedOn: string; enteredAs: "total_value"; total: Money; sourceNote: string | null };

export function parseValuationForm(formData: FormData, asset: Pick<Asset, "currency">): Result<ValuationInput> {
  const r = valuationSchema.safeParse(formObject(formData));
  if (!r.success) return { ok: false, fieldErrors: fieldErrors(r.error) };
  const common = { assetId: r.data.asset_id, valuedOn: r.data.valued_on, sourceNote: r.data.source_note };
  if (r.data.entered_as === "unit_price") {
    const p = parseUnitPrice(r.data.amount);
    if (!p.ok) return { ok: false, fieldErrors: { amount: p.error } };
    return { ok: true, values: { ...common, enteredAs: "unit_price", unitPrice: p.value } };
  }
  const t = money(r.data.amount, asset.currency, { allowZero: true });
  if (!t.ok) return { ok: false, fieldErrors: { amount: t.error } };
  return { ok: true, values: { ...common, enteredAs: "total_value", total: t.money! } };
}

// Investment transactions -----------------------------------------------------------------------

const txSchema = z.object({
  kind: z.enum(INVESTMENT_KINDS, { error: "Choose a transaction type." }),
  occurred_on: isoDate,
  asset_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  description: optionalText(200),
  notes: optionalText(2000),
  status: z.enum(["cleared", "pending"]).default("cleared"),
});

/** Field names used by the form, per kind. */
export const NEEDS = {
  holdingAccount: ["buy", "sell", "opening_holding", "split"],
  cashAccount: ["buy", "sell", "dividend", "interest", "investment_fee"],
  quantity: ["buy", "sell", "opening_holding", "split"],
  price: ["buy", "sell"],
} as const satisfies Record<string, readonly InvestmentKind[]>;

const needs = (list: readonly InvestmentKind[], kind: InvestmentKind) => list.includes(kind);

/**
 * Validates an investment transaction form against the user's accounts and
 * assets and returns the RPC payload. Quantities and amounts are never rounded,
 * except the cash leg of a same-currency buy or sell (quantity × price ± fee),
 * which is rounded half-even to the currency's minor units, as a broker would.
 */
export function parseInvestmentForm(
  formData: FormData,
  accounts: readonly Account[],
  assets: readonly Asset[],
): Result<TransactionPayload> {
  const raw = formObject(formData);
  const r = txSchema.safeParse(raw);
  if (!r.success) return { ok: false, fieldErrors: fieldErrors(r.error) };
  const { kind } = r.data;
  const errors: FieldErrors = {};

  const asset = r.data.asset_id ? assets.find((a) => a.id === r.data.asset_id) : undefined;
  if (kind !== "investment_fee" && !asset) errors.asset_id = "Choose an asset.";
  if (r.data.asset_id && !asset) errors.asset_id = "That asset no longer exists.";

  const holding = needs(NEEDS.holdingAccount, kind) ? accounts.find((a) => a.id === raw.account_id) : undefined;
  if (needs(NEEDS.holdingAccount, kind) && holding?.type !== "investment")
    errors.account_id = "Choose the investment account that holds it.";

  const cash = needs(NEEDS.cashAccount, kind) ? accounts.find((a) => a.id === raw.cash_account_id) : undefined;
  if (needs(NEEDS.cashAccount, kind) && cash?.class !== "asset")
    errors.cash_account_id =
      kind === "sell" || kind === "dividend" || kind === "interest"
        ? "Choose the account the money goes into."
        : "Choose the account the money comes from.";

  let quantity: Dec | null = null;
  if (needs(NEEDS.quantity, kind) && asset) {
    const q = parseQuantity(kind === "split" ? raw.quantity_change : raw.quantity, asset.quantityScale, {
      allowNegative: kind === "split",
    });
    if (q.ok) quantity = q.value;
    else errors[kind === "split" ? "quantity_change" : "quantity"] = q.error;
  }

  let price: Dec | null = null;
  if (needs(NEEDS.price, kind)) {
    const p = parseUnitPrice(raw.unit_price);
    if (p.ok) price = p.value;
    else errors.unit_price = p.error;
  }

  let fee: Money | null = null;
  if (needs(NEEDS.price, kind) && asset) {
    const f = money(raw.fee, asset.currency, { allowZero: true, optional: true });
    if (f.ok) fee = f.money;
    else errors.fee = f.error;
  }

  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };

  const lines: TransactionPayload["lines"] = [];
  const movements: MovementPayload[] = [];

  switch (kind) {
    case "buy":
    case "sell": {
      const a = asset!;
      const gross = quantity!.times(price!);
      const feeAmount = fee?.amount ?? new Dec(0);
      let cashAmount: Dec;
      if (cash!.currency === a.currency) {
        const net = kind === "buy" ? gross.plus(feeAmount) : gross.minus(feeAmount);
        cashAmount = net.toDecimalPlaces(minorUnits(a.currency), Dec.ROUND_HALF_EVEN);
        if (!cashAmount.greaterThan(0)) {
          return { ok: false, fieldErrors: { fee: "The fee can't be more than the sale amount." } };
        }
      } else {
        const c = money(raw.cash_amount, cash!.currency);
        if (!c.ok) return { ok: false, fieldErrors: { cash_amount: c.error } };
        cashAmount = c.money!.amount;
      }
      const fixed = cashAmount.toFixed(minorUnits(cash!.currency));
      lines.push({ account_id: cash!.id, amount: kind === "buy" ? `-${fixed}` : fixed, category_id: null });
      movements.push({
        account_id: holding!.id,
        quantity: (kind === "buy" ? quantity! : quantity!.negated()).toString(),
        unit_price: price!.toString(),
        fee: feeAmount.toString(),
      });
      break;
    }
    case "opening_holding": {
      const c = money(raw.cost_amount, asset!.currency, { allowZero: true });
      if (!c.ok) return { ok: false, fieldErrors: { cost_amount: c.error } };
      movements.push({ account_id: holding!.id, quantity: quantity!.toString(), cost_amount: c.money!.toFixed() });
      break;
    }
    case "split":
      movements.push({ account_id: holding!.id, quantity: quantity!.toString() });
      break;
    case "dividend":
    case "interest":
    case "investment_fee": {
      const c = money(raw.amount, cash!.currency);
      if (!c.ok) return { ok: false, fieldErrors: { amount: c.error } };
      const fixed = c.money!.toFixed();
      lines.push({ account_id: cash!.id, amount: kind === "investment_fee" ? `-${fixed}` : fixed, category_id: null });
      break;
    }
  }

  return {
    ok: true,
    values: {
      kind,
      occurred_on: r.data.occurred_on,
      description: r.data.description ?? (asset ? `${KIND_LABELS[kind]} · ${asset.name}` : KIND_LABELS[kind]),
      payee: null,
      notes: r.data.notes,
      tags: [],
      status: r.data.status,
      refund_of_id: null,
      asset_id: asset?.id ?? null,
      lines,
      movements,
    },
  };
}
