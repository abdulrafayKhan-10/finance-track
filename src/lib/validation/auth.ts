import { z } from "zod";

export const emailSchema = z.email({ error: "Enter a valid email address." }).max(254);

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Enter your password." }).max(256),
});

/** Supabase enforces its own policy too; this mirrors the minimum recommended in docs/local-development.md. */
export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, { error: "Use at least 12 characters." })
      .max(128, { error: "Use at most 128 characters." }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { error: "Passwords do not match.", path: ["confirm"] });

export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { error: "Enter the 6-digit code from your authenticator app." }),
});

export const factorIdSchema = z.uuid();

export type FieldErrors = Partial<Record<string, string>>;

/** First message per field, for rendering next to inputs. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
