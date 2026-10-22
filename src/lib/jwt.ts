/**
 * Decodes a JWT payload WITHOUT verifying it. Only use on tokens that were
 * verified elsewhere, or to classify a key's type.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
