import { describe, expect, it } from "vitest";
import { assertNoPublicSecrets, isPrivilegedKey, publicEnvSchema, serverEnvSchema } from "@/lib/env/schema";

function fakeJwt(payload: object) {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.signature`;
}

const anonJwt = fakeJwt({ iss: "supabase", role: "anon" });
const serviceJwt = fakeJwt({ iss: "supabase", role: "service_role" });

const validPublic = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

describe("isPrivilegedKey", () => {
  it.each([
    ["new secret key", "sb_secret_abcdefghijklmnop", true],
    ["legacy service_role JWT", serviceJwt, true],
    ["new publishable key", "sb_publishable_abcdefghijklmnop", false],
    ["legacy anon JWT", anonJwt, false],
    ["garbage", "not-a-key", false],
  ])("%s", (_name, key, expected) => {
    expect(isPrivilegedKey(key)).toBe(expected);
  });
});

describe("publicEnvSchema", () => {
  it("accepts a valid configuration", () => {
    expect(publicEnvSchema.safeParse(validPublic).success).toBe(true);
    expect(publicEnvSchema.safeParse({ ...validPublic, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonJwt }).success).toBe(
      true,
    );
  });

  it("rejects missing or malformed values", () => {
    expect(publicEnvSchema.safeParse({}).success).toBe(false);
    expect(publicEnvSchema.safeParse({ ...validPublic, NEXT_PUBLIC_SUPABASE_URL: "abc.supabase.co" }).success).toBe(
      false,
    );
    expect(publicEnvSchema.safeParse({ ...validPublic, NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" }).success).toBe(
      false,
    );
  });

  it("refuses a secret key in the browser-visible slot", () => {
    for (const key of ["sb_secret_abcdefghijklmnop", serviceJwt]) {
      const result = publicEnvSchema.safeParse({ ...validPublic, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key });
      expect(result.success).toBe(false);
    }
  });
});

describe("serverEnvSchema", () => {
  it("allows the secret key to be absent", () => {
    expect(serverEnvSchema.safeParse({}).success).toBe(true);
  });
  it("rejects a non-privileged key as the secret key", () => {
    expect(serverEnvSchema.safeParse({ SUPABASE_SECRET_KEY: anonJwt }).success).toBe(false);
  });
});

describe("assertNoPublicSecrets", () => {
  it("throws when any NEXT_PUBLIC_ variable holds a privileged key", () => {
    expect(() => assertNoPublicSecrets({ NEXT_PUBLIC_OOPS: "sb_secret_abcdefghijklmnop" })).toThrow(/NEXT_PUBLIC_OOPS/);
  });
  it("ignores server-only variables", () => {
    expect(() => assertNoPublicSecrets({ SUPABASE_SECRET_KEY: "sb_secret_abcdefghijklmnop" })).not.toThrow();
  });
});
