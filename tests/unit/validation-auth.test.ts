import { describe, expect, it } from "vitest";
import { fieldErrors, newPasswordSchema, signInSchema, totpCodeSchema } from "@/lib/validation/auth";

describe("auth validation", () => {
  it("requires a valid email and a password", () => {
    const result = signInSchema.safeParse({ email: "nope", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        email: "Enter a valid email address.",
        password: "Enter your password.",
      });
    }
  });

  it("enforces password length and confirmation", () => {
    expect(newPasswordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
    const mismatch = newPasswordSchema.safeParse({ password: "a-long-passphrase", confirm: "different-phrase" });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(fieldErrors(mismatch.error).confirm).toBe("Passwords do not match.");
    expect(newPasswordSchema.safeParse({ password: "a-long-passphrase", confirm: "a-long-passphrase" }).success).toBe(
      true,
    );
  });

  it("accepts only 6-digit TOTP codes, trimming whitespace", () => {
    expect(totpCodeSchema.safeParse({ code: " 123456 " }).success).toBe(true);
    for (const code of ["12345", "1234567", "12a456", ""]) {
      expect(totpCodeSchema.safeParse({ code }).success).toBe(false);
    }
  });
});
