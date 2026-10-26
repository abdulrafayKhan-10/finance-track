import { describe, expect, it } from "vitest";
import { convert, type ExchangeRate, findRate, sumConverted } from "@/domain/fx/fx";
import { Dec, Money } from "@/domain/money";

const rates: ExchangeRate[] = [
  { base: "USD", quote: "PKR", rate: new Dec("280"), effectiveOn: "2026-01-01" },
  { base: "USD", quote: "PKR", rate: new Dec("285"), effectiveOn: "2026-02-01" },
  { base: "PKR", quote: "AED", rate: new Dec("0.013"), effectiveOn: "2026-01-01" },
  { base: "USD", quote: "PKR", rate: new Dec("300"), effectiveOn: "2026-12-01" },
];

describe("exchange rates (§4.6)", () => {
  it("uses the latest rate on or before the date, never a future one (ACC-FX-1)", () => {
    expect(findRate(rates, "USD", "PKR", "2026-01-31")?.rate.toString()).toBe("280");
    expect(findRate(rates, "USD", "PKR", "2026-02-01")?.rate.toString()).toBe("285");
    expect(findRate(rates, "USD", "PKR", "2026-06-30")?.rate.toString()).toBe("285");
    expect(findRate(rates, "USD", "PKR", "2025-12-31")).toBeNull();
  });

  it("uses the inverse when only the opposite pair exists", () => {
    const r = findRate(rates, "PKR", "USD", "2026-01-15");
    expect(r?.inverted).toBe(true);
    expect(Money.of("28000", "PKR").times(r!.rate, "USD").toFixed()).toBe("100.00");
  });

  it("does not triangulate", () => {
    expect(findRate(rates, "USD", "AED", "2026-03-01")).toBeNull();
  });

  it("flags rates older than 31 days as stale", () => {
    expect(findRate(rates, "USD", "PKR", "2026-03-03")?.stale).toBe(false);
    expect(findRate(rates, "USD", "PKR", "2026-03-05")?.stale).toBe(true);
  });

  it("converts historical amounts at their own date's rate (ACC-FX-2)", () => {
    const total = sumConverted(
      [
        { money: Money.of("100", "USD"), on: "2026-01-20" },
        { money: Money.of("100", "USD"), on: "2026-02-20" },
        { money: Money.of("500", "PKR"), on: "2026-02-20" },
      ],
      "PKR",
      rates,
    );
    expect(total.total.toFixed()).toBe("57000.00");
    expect(total.excluded).toEqual([]);
  });

  it("marks amounts without a rate as unavailable and keeps them out of totals (ACC-FX-3)", () => {
    expect(convert(Money.of("10", "EUR"), "PKR", "2026-02-01", rates)).toMatchObject({ status: "unavailable" });
    const total = sumConverted(
      [
        { money: Money.of("10", "EUR"), on: "2026-02-01" },
        { money: Money.of("5", "PKR"), on: "2026-02-01" },
      ],
      "PKR",
      rates,
    );
    expect(total.total.toFixed()).toBe("5.00");
    expect(total.excluded.map(String)).toEqual(["10.00 EUR"]);
  });

  it("same-currency conversion needs no rate", () => {
    expect(convert(Money.of("1", "PKR"), "PKR", "1990-01-01", [])).toMatchObject({
      status: "converted",
      rateUsed: null,
    });
  });
});
