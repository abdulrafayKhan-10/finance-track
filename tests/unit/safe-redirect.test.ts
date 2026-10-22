import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/transactions", "/transactions"],
    ["/accounts/123?tab=ledger#top", "/accounts/123?tab=ledger#top"],
    ["/a/../b", "/b"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    ["protocol-relative", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["absolute URL", "https://evil.example/"],
    ["javascript URL", "javascript:alert(1)"],
    ["relative path", "transactions"],
    ["control characters", "/a\nb"],
    ["empty", ""],
    ["not a string", 42],
    ["too long", `/${"a".repeat(600)}`],
  ])("falls back for %s", (_name, input) => {
    expect(safeNextPath(input)).toBe("/");
    expect(safeNextPath(input, "/settings")).toBe("/settings");
  });
});
