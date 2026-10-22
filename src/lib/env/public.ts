import { formatEnvError, publicEnvSchema, type PublicEnv } from "./schema";

let cached: PublicEnv | undefined;

/** Browser-safe settings. Each variable is referenced by name so Next.js can inline it. */
export function getPublicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) throw new Error(formatEnvError(parsed.error));
  cached = parsed.data;
  return cached;
}
