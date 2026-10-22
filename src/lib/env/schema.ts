import { z } from "zod";
import { decodeJwtPayload } from "@/lib/jwt";

/* Pure validation logic, shared by the public and server env modules and unit tests. */

/** True for any Supabase key that bypasses RLS (new `sb_secret_` keys or legacy service_role JWTs). */
export function isPrivilegedKey(key: string): boolean {
  return key.startsWith("sb_secret_") || decodeJwtPayload(key)?.role === "service_role";
}

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20)
    .refine((key) => !isPrivilegedKey(key), {
      message: "must be the publishable (anon) key, never the secret / service-role key",
    }),
  NEXT_PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }),
});

export const serverEnvSchema = z.object({
  // Optional until account deletion ships; must be a privileged key when present.
  SUPABASE_SECRET_KEY: z
    .string()
    .refine(isPrivilegedKey, { message: "must be a Supabase secret / service-role key" })
    .optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Rejects any NEXT_PUBLIC_* variable carrying a privileged key: those are inlined into browser bundles. */
export function assertNoPublicSecrets(env: Record<string, string | undefined>): void {
  const leaked = Object.entries(env)
    .filter(([name, value]) => name.startsWith("NEXT_PUBLIC_") && value && isPrivilegedKey(value))
    .map(([name]) => name);
  if (leaked.length > 0) {
    throw new Error(`Privileged Supabase key exposed to the browser via: ${leaked.join(", ")}`);
  }
}

export function formatEnvError(error: z.ZodError): string {
  const issues = error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  return `Invalid environment variables:\n${issues}\nSee .env.example and docs/local-development.md.`;
}
