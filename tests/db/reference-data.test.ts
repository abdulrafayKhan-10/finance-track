import { describe, expect, it } from "vitest";
import { CURRENCIES } from "@/domain/money";
import { asAdmin } from "./support/db";

describe("reference data", () => {
  it("the currencies table matches the domain list exactly", async () => {
    const { rows } = await asAdmin((q) => q("select code, name, minor_units from public.currencies order by code"));
    const domain = Object.entries(CURRENCIES)
      .map(([code, c]) => ({ code, name: c.name, minor_units: c.minorUnits }))
      .sort((x, y) => x.code.localeCompare(y.code));
    expect(rows).toEqual(domain);
  });
});
