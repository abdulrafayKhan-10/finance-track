import { z } from "zod";
import { CURRENCY_CODES } from "@/domain/money";
import { formObject, optionalText } from "./form";
import { type FieldErrors, fieldErrors } from "./auth";

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const schema = z.object({
  display_name: optionalText(100),
  base_currency: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
  timezone: z.string().trim().min(1).max(64).refine(isTimeZone, { error: "Choose a valid timezone." }),
});

export function parseProfileForm(
  formData: FormData,
): { ok: true; values: z.infer<typeof schema> } | { ok: false; fieldErrors: FieldErrors } {
  const r = schema.safeParse(formObject(formData));
  return r.success ? { ok: true, values: r.data } : { ok: false, fieldErrors: fieldErrors(r.error) };
}
