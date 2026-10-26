import { describe, expect, it } from "vitest";
import { Money } from "@/domain/money";
import { formatDate, formatMoney, formatTimestamp } from "@/lib/format";

describe("formatMoney", () => {
  it.each([
    ["1250000", "PKR", "Rs 1,250,000.00"],
    ["-50", "PKR", "−Rs 50.00"],
    ["0.005", "USD", "$ 0.00"],
    ["0.015", "USD", "$ 0.02"],
    ["1234.5678", "KWD", "KWD 1,234.568"],
    ["1500", "JPY", "¥ 1,500"],
    ["123456789012.34", "PKR", "Rs 123,456,789,012.34"],
  ] as const)("%s %s → %s", (amount, currency, expected) => {
    expect(formatMoney(Money.of(amount, currency))).toBe(expected);
  });

  it("does not show a minus for amounts that round to zero", () => {
    expect(formatMoney(Money.of("-0.001", "PKR"))).toBe("Rs 0.00");
  });

  it("can force or hide the sign", () => {
    expect(formatMoney(Money.of("5", "PKR"), { sign: "always" })).toBe("+Rs 5.00");
    expect(formatMoney(Money.of("-5", "PKR"), { sign: "never" })).toBe("Rs 5.00");
  });

  it("keeps precision beyond float range", () => {
    expect(formatMoney(Money.of("9007199254740993.01", "PKR").minus(Money.of("9007199254740000", "PKR")))).toBe(
      "Rs 993.01",
    );
  });
});

describe("dates", () => {
  it("formats calendar dates without timezone drift", () => {
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
  });
  it("formats timestamps in the user's timezone", () => {
    expect(formatTimestamp("2026-01-31T21:30:00Z", "Asia/Karachi")).toContain("1 Feb 2026");
  });
});
