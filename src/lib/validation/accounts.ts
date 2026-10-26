import { z } from "zod";
import { ACCOUNT_TYPES, classOf, storedFromDisplay } from "@/domain/ledger";
import { CURRENCY_CODES, parseAmount } from "@/domain/money";
import { type FieldErrors, fieldErrors } from "./auth";
import { AMOUNT_ERRORS, checkbox, formObject, isoDate, optionalText, requiredText } from "./form";

const schema = z.object({
  name: requiredText(100, "a name"),
  type: z.enum(ACCOUNT_TYPES, { error: "Choose an account type." }),
  currency: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
  opening_balance: z.string().default("0"),
  opening_date: isoDate,
  institution: optionalText(100),
  notes: optionalText(2000),
  include_in_net_worth: checkbox,
  is_liquid: checkbox,
  status: z.enum(["active", "closed", "archived"]).default("active"),
});

export type AccountValues = {
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  currency: (typeof CURRENCY_CODES)[number];
  /** Stored sign convention (amount owed on a liability is negative). */
  opening_balance: string;
  opening_date: string;
  institution: string | null;
  notes: string | null;
  include_in_net_worth: boolean;
  is_liquid: boolean;
  status: "active" | "closed" | "archived";
};

/**
 * The opening balance is entered as displayed: money held for assets, amount
 * owed for liabilities (negative = overdrawn / overpaid card).
 */
export function parseAccountForm(
  formData: FormData,
): { ok: true; values: AccountValues } | { ok: false; fieldErrors: FieldErrors } {
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const amount = parseAmount(v.opening_balance.trim() === "" ? "0" : v.opening_balance, v.currency);
  if (!amount.ok) return { ok: false, fieldErrors: { opening_balance: AMOUNT_ERRORS[amount.error] } };
  const stored = storedFromDisplay({ class: classOf(v.type) }, amount.money);
  return { ok: true, values: { ...v, opening_balance: stored.toFixed() } };
}
