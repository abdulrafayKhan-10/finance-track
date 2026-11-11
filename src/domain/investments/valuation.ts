import type { IsoDate } from "../dates";
import { Dec, Money } from "../money";
import type { Asset, Valuation } from "./types";
import type { Position } from "./wac";

/** The valuation in force on `asOf`: the latest with valued_on ≤ asOf (§4.8). Later ones are never used (INV-9). */
export function latestValuation(valuations: readonly Valuation[], assetId: string, asOf: IsoDate): Valuation | null {
  let best: Valuation | null = null;
  for (const v of valuations) {
    if (v.assetId !== assetId || v.valuedOn > asOf) continue;
    if (!best || v.valuedOn > best.valuedOn) best = v;
  }
  return best;
}

export type PositionValue =
  | {
      status: "valued";
      /** Estimated value in the asset currency: quantity × unit price. Never called a price or "live". */
      value: Money;
      unitPrice: Dec;
      /** The valuation date it rests on (today for par). */
      valuedOn: IsoDate;
      basis: "manual" | "par";
      /** Unrealized gain = value − cost basis (ACC-VAL-2). */
      unrealized: Money;
    }
  | { status: "unvalued" };

/**
 * Values a position as of a date. Manual assets with no valuation on or before
 * the date are *unvalued*: they are excluded from totals and their cost is
 * never shown as if it were value (ACC-VAL-1). Par assets are worth 1 per unit.
 */
export function valuePosition(
  position: Position,
  asset: Asset,
  valuations: readonly Valuation[],
  asOf: IsoDate,
): PositionValue {
  if (asset.valuationMode === "par") {
    const value = Money.of(position.quantity, asset.currency);
    return {
      status: "valued",
      value,
      unitPrice: new Dec(1),
      valuedOn: asOf,
      basis: "par",
      unrealized: value.minus(position.costBasis),
    };
  }
  const v = latestValuation(valuations, asset.id, asOf);
  if (!v) return { status: "unvalued" };
  const value = Money.of(position.quantity.times(v.unitPrice), asset.currency);
  return {
    status: "valued",
    value,
    unitPrice: v.unitPrice,
    valuedOn: v.valuedOn,
    basis: "manual",
    unrealized: value.minus(position.costBasis),
  };
}

export const UNIT_PRICE_DECIMALS = 10;

/** Unit price from a total value typed by the user, using the quantity held on the valuation date. */
export function unitPriceFromTotal(total: Money, quantity: Dec): Dec | null {
  if (!quantity.greaterThan(0)) return null;
  return total.amount.dividedBy(quantity).toDecimalPlaces(UNIT_PRICE_DECIMALS, Dec.ROUND_HALF_EVEN);
}
