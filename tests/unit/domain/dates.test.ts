import { describe, expect, it } from "vitest";
import { daysBetween, isIsoDate, todayIn } from "@/domain/dates";

describe("dates (§4.10)", () => {
  it("validates real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-01-01")).toBe(false);
  });

  it("counts days", () => {
    expect(daysBetween("2026-01-31", "2026-03-03")).toBe(31);
  });

  it("uses Asia/Karachi for 'today', not UTC (ACC-DATE-1)", () => {
    // 21:30 UTC on 31 Jan is 02:30 on 1 Feb in Karachi (UTC+5).
    const instant = new Date("2026-01-31T21:30:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-01-31");
    expect(todayIn("Asia/Karachi", instant)).toBe("2026-02-01");
  });
});
