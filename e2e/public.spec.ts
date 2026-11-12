import { expect, test } from "@playwright/test";

/** Security checklist (docs/05 §5.3): headers on the production build, and nothing private without a session. */
test.describe("without a session", () => {
  test("pages carry the security headers and are never cached", async ({ request }) => {
    const res = await request.get("/login");
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["content-security-policy"]).not.toContain("unsafe-eval");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("same-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["cache-control"]).toContain("no-store");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("private pages and exports redirect to sign-in", async ({ request }) => {
    for (const path of [
      "/",
      "/transactions",
      "/investments",
      "/settings/data",
      "/export/backup",
      "/export/transactions",
    ]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers()["location"], path).toContain("/login");
    }
  });

  test("the PWA files are public and contain nothing private", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).display).toBe("standalone");
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    const code = await sw.text();
    // The worker only caches static files and the offline page; navigations are network-only.
    expect(code).toContain('request.mode === "navigate"');
    expect(code).not.toMatch(/cache\.put\(\s*request[^)]*\)[^;]*navigate/);
    expect((await request.get("/offline")).ok()).toBe(true);
    expect((await request.get("/icons/icon-512.png")).headers()["content-type"]).toBe("image/png");
  });

  test("the sign-in page renders without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
