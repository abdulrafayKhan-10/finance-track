import { z } from "zod";
import { isIsoDate } from "@/domain/dates";
import type { AmountParseError } from "@/domain/money";

/** Shared field schemas for FormData input (all values arrive as strings). */

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Use at most ${max} characters.` })
    .optional()
    .transform((v) => (v ? v : null));

export const requiredText = (max: number, label: string) =>
  z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(1, { error: `Enter ${label}.` })
    .max(max, { error: `Use at most ${max} characters.` });

export const isoDate = z
  .string({ error: "Enter a date." })
  .refine((v) => isIsoDate(v), { error: "Enter a valid date." })
  .refine((v) => v >= "1900-01-01" && v <= "2999-12-31", { error: "Enter a date between 1900 and 2999." });

export const uuid = (label: string) => z.uuid({ error: `Choose ${label}.` });

export const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());

/** Comma-separated tags → trimmed, de-duplicated, lowercase list. */
export const tags = z
  .string()
  .optional()
  .transform((v) =>
    Array.from(
      new Set(
        (v ?? "")
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      ),
    ),
  )
  .refine((list) => list.length <= 20, { error: "Use at most 20 tags." })
  .refine((list) => list.every((t) => t.length <= 30), { error: "Each tag can have at most 30 characters." });

export const AMOUNT_ERRORS: Record<AmountParseError, string> = {
  empty: "Enter an amount.",
  invalid: "Enter a number, like 1250 or 1,250.50.",
  too_many_decimals: "That currency doesn't use that many decimal places.",
  too_large: "That amount is too large.",
};

export function formObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") out[key] = value;
  return out;
}
