/** Runs once when the server starts: refuse to boot with missing or unsafe configuration. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env/server");
    validateEnv();
  }
}
