import { describe, expect, it } from "vitest";
import { parsePeriod } from "@/features/periods";

describe("parsePeriod", () => {
  const today = "2026-03-15";
  it.each([
    [{}, ["this-month", "2026-03-01", "2026-03-31"]],
    [{ period: "last-month" }, ["last-month", "2026-02-01", "2026-02-28"]],
    [{ period: "this-year" }, ["this-year", "2026-01-01", "2026-03-15"]],
    [{ period: "last-12-months" }, ["last-12-months", "2025-04-01", "2026-03-15"]],
    [{ period: "custom", from: "2025-01-01", to: "2025-06-30" }, ["custom", "2025-01-01", "2025-06-30"]],
    [{ period: "custom", from: "2025-06-30", to: "2025-01-01" }, ["this-month", "2026-03-01", "2026-03-31"]],
    [{ period: "custom", from: "nope", to: "2025-01-01" }, ["this-month", "2026-03-01", "2026-03-31"]],
    [{ period: "bogus" }, ["this-month", "2026-03-01", "2026-03-31"]],
  ] as const)("%j", (params, [key, from, to]) => {
    expect(parsePeriod(params, today)).toEqual({ key, from, to });
  });

  it("handles January for 'last month'", () => {
    expect(parsePeriod({ period: "last-month" }, "2026-01-10")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  });
});
