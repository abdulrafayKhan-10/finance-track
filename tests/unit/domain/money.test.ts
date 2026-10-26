import { describe, expect, it } from "vitest";
import { CurrencyMismatchError, Dec, dec, Money, parseAmount } from "@/domain/money";

describe("Money", () => {
  it("is exact where floats are not (0.1 + 0.2)", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(Money.of("0.1", "PKR").plus(Money.of("0.2", "PKR")).equals(Money.of("0.3", "PKR"))).toBe(true);
  });

  it("sums many small amounts without drift", () => {
    const items = Array.from({ length: 10_000 }, () => Money.of("0.01", "USD"));
    expect(Money.sum(items, "USD").toFixed()).toBe("100.00");
  });

  it("refuses to add different currencies (INV-6)", () => {
    expect(() => Money.of("1", "PKR").plus(Money.of("1", "USD"))).toThrow(CurrencyMismatchError);
    expect(() => Money.sum([Money.of("1", "USD")], "PKR")).toThrow(CurrencyMismatchError);
  });

  it("never accepts JavaScript numbers", () => {
    expect(() => dec(0.1 as unknown as string)).toThrow(TypeError);
    expect(() => Money.of("1e3", "PKR")).toThrow(TypeError);
  });

  describe("rounding is half-even, once, to minor units (ACC-RND)", () => {
    it.each([
      ["2.345", "PKR", "2.34"],
      ["2.355", "PKR", "2.36"],
      ["-2.345", "PKR", "-2.34"],
      ["2.5", "JPY", "2"],
      ["3.5", "JPY", "4"],
      ["1.2345", "KWD", "1.234"],
    ] as const)("%s %s → %s", (input, currency, expected) => {
      expect(Money.of(input, currency).toFixed()).toBe(expected);
      expect(Money.of(input, currency).rounded().amount.toString()).toBe(new Dec(expected).toString());
    });

    it("keeps full precision until the end", () => {
      const third = Money.of("100", "PKR").times(new Dec(1).dividedBy(3));
      expect(third.plus(third).plus(third).toFixed()).toBe("100.00");
      expect(third.rounded().plus(third.rounded()).plus(third.rounded()).toFixed()).toBe("99.99");
    });

    it("stores 4 decimal places", () => {
      expect(Money.of("12.5", "PKR").toStorage()).toBe("12.5000");
    });
  });
});

describe("parseAmount", () => {
  it.each([
    ["1,250.50", "PKR", "1250.5"],
    [" 1 250 ", "PKR", "1250"],
    ["0.005", "KWD", "0.005"],
    ["1000", "JPY", "1000"],
  ] as const)("parses %j", (input, currency, expected) => {
    const r = parseAmount(input, currency);
    expect(r.ok && r.money.amount.toString()).toBe(expected);
  });

  it.each([
    ["", "PKR", "empty"],
    ["abc", "PKR", "invalid"],
    ["1.5.0", "PKR", "invalid"],
    ["1e5", "PKR", "invalid"],
    ["12.345", "PKR", "too_many_decimals"],
    ["1.5", "JPY", "too_many_decimals"],
    ["1000000000000000", "PKR", "too_large"],
  ] as const)("rejects %j as %s", (input, currency, error) => {
    expect(parseAmount(input, currency)).toEqual({ ok: false, error });
  });
});
