import { z } from "zod";
import { isIsoMonth } from "@/domain/dates";
import { CURRENCY_CODES, Dec, type Money, parseAmount } from "@/domain/money";
import { type FieldErrors, fieldErrors } from "./auth";
import { AMOUNT_ERRORS, formObject, isoDate, optionalText, requiredText } from "./form";

type Result<T> = { ok: true; values: T } | { ok: false; fieldErrors: FieldErrors };

export const isoMonth = z.string().refine(isIsoMonth, { error: "Choose a month." });

/** A positive amount in a given currency, never rounded. */
export function positiveAmount(
  input: unknown,
  currency: (typeof CURRENCY_CODES)[number],
): { ok: true; money: Money } | { ok: false; error: string } {
  const r = parseAmount(typeof input === "string" ? input : "", currency);
  if (!r.ok) return { ok: false, error: AMOUNT_ERRORS[r.error] };
  if (!r.money.isPositive()) return { ok: false, error: "Enter an amount greater than zero." };
  return { ok: true, money: r.money };
}

// Exchange rates ---------------------------------------------------------------

const rateSchema = z
  .object({
    base: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
    quote: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
    rate: z
      .string()
      .trim()
      .regex(/^\d{1,11}(\.\d{1,12})?$/, { error: "Enter a positive number with up to 12 decimal places." }),
    effective_on: isoDate,
    source_note: optionalText(200),
  })
  .refine((v) => v.base !== v.quote, { error: "Choose two different currencies.", path: ["quote"] })
  .refine((v) => new Dec(v.rate).greaterThan(0), { error: "The rate must be greater than zero.", path: ["rate"] });

export function parseRateForm(formData: FormData): Result<z.infer<typeof rateSchema>> {
  const r = rateSchema.safeParse(formObject(formData));
  return r.success ? { ok: true, values: r.data } : { ok: false, fieldErrors: fieldErrors(r.error) };
}

// Goals ------------------------------------------------------------------------

const goalSchema = z
  .object({
    name: requiredText(100, "a name"),
    description: optionalText(1000),
    target_amount: z.string().default(""),
    currency: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
    target_date: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(isoDate.nullable()),
    funding_mode: z.enum(["linked_account", "allocations"], { error: "Choose how the goal is funded." }),
    linked_account_id: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .refine(
    (v) =>
      v.funding_mode !== "linked_account" || (v.linked_account_id && z.uuid().safeParse(v.linked_account_id).success),
    {
      error: "Choose the account this goal follows.",
      path: ["linked_account_id"],
    },
  );

export type GoalValues = Omit<z.infer<typeof goalSchema>, "target_amount"> & { target_amount: string };

export function parseGoalForm(formData: FormData): Result<GoalValues> {
  const r = goalSchema.safeParse(formObject(formData));
  if (!r.success) return { ok: false, fieldErrors: fieldErrors(r.error) };
  const amount = positiveAmount(r.data.target_amount, r.data.currency);
  if (!amount.ok) return { ok: false, fieldErrors: { target_amount: amount.error } };
  return {
    ok: true,
    values: {
      ...r.data,
      target_amount: amount.money.toFixed(),
      linked_account_id: r.data.funding_mode === "linked_account" ? r.data.linked_account_id : null,
    },
  };
}

const allocationSchema = z.object({
  direction: z.enum(["allocate", "release"]).default("allocate"),
  amount: z.string().default(""),
  allocated_on: isoDate,
  source_account_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.uuid().safeParse(v).success, { error: "Choose a valid account." }),
  note: optionalText(500),
});

export function parseAllocationForm(formData: FormData, currency: (typeof CURRENCY_CODES)[number]) {
  const r = allocationSchema.safeParse(formObject(formData));
  if (!r.success) return { ok: false as const, fieldErrors: fieldErrors(r.error) };
  const amount = positiveAmount(r.data.amount, currency);
  if (!amount.ok) return { ok: false as const, fieldErrors: { amount: amount.error } };
  const signed = r.data.direction === "release" ? amount.money.negate() : amount.money;
  return { ok: true as const, values: { ...r.data, amount: signed.toFixed() } };
}
