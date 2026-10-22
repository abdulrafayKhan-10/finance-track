import { describe, expect, it } from "vitest";
import { isActive, MOBILE_ITEMS, NAV_ITEMS } from "@/components/app-shell/nav-items";

describe("navigation", () => {
  it("lists every module once", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain("/settings");
  });

  it("fits the mobile bar (at most 5 items, including More)", () => {
    expect(MOBILE_ITEMS.length).toBeLessThanOrEqual(5);
    expect(MOBILE_ITEMS.at(-1)?.href).toBe("/more");
  });

  it("matches sections, not prefixes of other words", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/accounts")).toBe(false);
    expect(isActive("/accounts", "/accounts/abc")).toBe(true);
    expect(isActive("/goals", "/goalsx")).toBe(false);
  });
});
