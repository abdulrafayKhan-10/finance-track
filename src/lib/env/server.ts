import "server-only";
import { assertNoPublicSecrets, formatEnvError, serverEnvSchema, type ServerEnv } from "./schema";
import { getPublicEnv } from "./public";

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  assertNoPublicSecrets(process.env);
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
  });
  if (!parsed.success) throw new Error(formatEnvError(parsed.error));
  cached = parsed.data;
  return cached;
}

/** Validates every variable; called once at server start from instrumentation.ts. */
export function validateEnv(): void {
  getPublicEnv();
  getServerEnv();
}
