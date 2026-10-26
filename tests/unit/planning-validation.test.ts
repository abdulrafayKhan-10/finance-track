import { describe, expect, it } from "vitest";
import { parseAllocationForm, parseGoalForm, parseRateForm } from "@/lib/validation/planning";

const fd = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, x] of Object.entries(v)) f.set(k, x);
  return f;
};
const UUID = "00000000-0000-4000-8000-000000000001";

describe("exchange rate form", () => {
  it("accepts a rate with up to 12 decimals", () => {
    const r = parseRateForm(fd({ base: "USD", quote: "PKR", rate: "280.123456789012", effective_on: "2026-03-01" }));
    expect(r.ok && r.values.rate).toBe("280.123456789012");
  });
  it.each([
    [{ rate: "0" }, "rate"],
    [{ rate: "-1" }, "rate"],
    [{ rate: "1e3" }, "rate"],
    [{ quote: "USD" }, "quote"],
    [{ effective_on: "2026-02-30" }, "effective_on"],
  ])("rejects %j", (override, field) => {
    const r = parseRateForm(fd({ base: "USD", quote: "PKR", rate: "280", effective_on: "2026-03-01", ...override }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors[field]).toBeDefined();
  });
});

describe("goal form", () => {
  const base = { name: "Trip", target_amount: "150,000", currency: "PKR", funding_mode: "allocations" };
  it("normalises the target and drops a linked account for allocation goals", () => {
    const r = parseGoalForm(fd({ ...base, linked_account_id: UUID }));
    expect(r.ok && [r.values.target_amount, r.values.linked_account_id, r.values.target_date]).toEqual([
      "150000.00",
      null,
      null,
    ]);
  });
  it("requires an account for linked goals and a positive target", () => {
    const linked = parseGoalForm(fd({ ...base, funding_mode: "linked_account" }));
    expect(!linked.ok && linked.fieldErrors.linked_account_id).toBeTruthy();
    const zero = parseGoalForm(fd({ ...base, target_amount: "0" }));
    expect(!zero.ok && zero.fieldErrors.target_amount).toBeTruthy();
    const jpy = parseGoalForm(fd({ ...base, currency: "JPY", target_amount: "10.5" }));
    expect(!jpy.ok && jpy.fieldErrors.target_amount).toContain("decimal");
  });
});

describe("allocation form", () => {
  it("signs releases negative", () => {
    const r = parseAllocationForm(fd({ direction: "release", amount: "500", allocated_on: "2026-03-01" }), "PKR");
    expect(r.ok && r.values.amount).toBe("-500.00");
  });
  it("rejects zero and bad source ids", () => {
    expect(parseAllocationForm(fd({ amount: "0", allocated_on: "2026-03-01" }), "PKR").ok).toBe(false);
    expect(parseAllocationForm(fd({ amount: "1", allocated_on: "2026-03-01", source_account_id: "x" }), "PKR").ok).toBe(
      false,
    );
  });
});
