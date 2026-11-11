import type { IsoDate } from "../dates";
import { Dec, Money, ZERO } from "../money";
import type { Asset, HoldingMovement } from "./types";

export type RealizedEvent = { transactionId: string; occurredOn: IsoDate; amount: Money };

/** A position (investment account, asset) under weighted-average cost (§4.7). All money in the asset currency. */
export type Position = {
  accountId: string;
  assetId: string;
  quantity: Dec;
  costBasis: Money;
  /** Σ realized gain or loss from sells. */
  realized: Money;
  realizedEvents: RealizedEvent[];
  /** Fees paid on buys and sells (already inside cost basis or realized gain). */
  tradingFees: Money;
  firstOn: IsoDate;
};

export class PositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PositionError";
  }
}

export const positionKey = (accountId: string, assetId: string) => `${accountId}|${assetId}`;

/** Ledger order: (occurred_on, created_at, transaction id, movement id), as in the database. */
export function byLedgerOrder(a: HoldingMovement, b: HoldingMovement): number {
  return (
    a.occurredOn.localeCompare(b.occurredOn) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.transactionId.localeCompare(b.transactionId) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Replays movements dated on or before `asOf` (all when omitted) into positions:
 *
 *   opening_holding  qty += q; cost += cost_amount
 *   buy              qty += q; cost += q×p + fee
 *   sell             removed = cost ÷ qty × q; realized += (q×p − fee) − removed;
 *                    qty −= q; cost −= removed; a full exit leaves cost 0 (ACC-WAC-3)
 *   split            qty += Δ; cost unchanged
 *
 * Selling more than is held is refused by the database (ACC-WAC-4); if such
 * data still arrives, this throws instead of inventing a cost.
 */
export function computePositions(
  assets: ReadonlyMap<string, Asset>,
  movements: readonly HoldingMovement[],
  asOf?: IsoDate,
): Map<string, Position> {
  const positions = new Map<string, Position>();
  const sorted = movements.filter((m) => asOf === undefined || m.occurredOn <= asOf).sort(byLedgerOrder);

  for (const m of sorted) {
    const asset = assets.get(m.assetId);
    if (!asset) throw new PositionError(`Unknown asset ${m.assetId}`);
    const c = asset.currency;
    const key = positionKey(m.accountId, m.assetId);
    let p = positions.get(key);
    if (!p) {
      p = {
        accountId: m.accountId,
        assetId: m.assetId,
        quantity: ZERO,
        costBasis: Money.zero(c),
        realized: Money.zero(c),
        realizedEvents: [],
        tradingFees: Money.zero(c),
        firstOn: m.occurredOn,
      };
      positions.set(key, p);
    }
    const fee = Money.of(m.fee, c);

    switch (m.kind) {
      case "opening_holding":
        p.quantity = p.quantity.plus(m.quantity);
        p.costBasis = p.costBasis.plus(Money.of(m.costAmount ?? ZERO, c));
        break;
      case "buy":
        p.quantity = p.quantity.plus(m.quantity);
        p.costBasis = p.costBasis.plus(Money.of(m.quantity.times(m.unitPrice ?? ZERO), c)).plus(fee);
        p.tradingFees = p.tradingFees.plus(fee);
        break;
      case "sell": {
        const q = m.quantity.abs();
        if (p.quantity.lessThan(q)) throw new PositionError("Sell exceeds the quantity held");
        const removed = p.costBasis.times(q.dividedBy(p.quantity));
        const proceeds = Money.of(q.times(m.unitPrice ?? ZERO), c).minus(fee);
        const gain = proceeds.minus(removed);
        p.realized = p.realized.plus(gain);
        p.realizedEvents.push({ transactionId: m.transactionId, occurredOn: m.occurredOn, amount: gain });
        p.tradingFees = p.tradingFees.plus(fee);
        p.quantity = p.quantity.minus(q);
        p.costBasis = p.quantity.isZero() ? Money.zero(c) : p.costBasis.minus(removed);
        break;
      }
      case "split":
        p.quantity = p.quantity.plus(m.quantity);
        if (p.quantity.isNegative()) throw new PositionError("Split leaves a negative quantity");
        if (p.quantity.isZero()) p.costBasis = Money.zero(c);
        break;
      default:
        throw new PositionError(`${m.kind} transactions have no holding movements`);
    }
  }
  return positions;
}

/** Average cost per unit, or null when nothing is held. */
export function averageCost(p: Position): Money | null {
  return p.quantity.isZero() ? null : p.costBasis.times(new Dec(1).dividedBy(p.quantity));
}

/** Quantity of one position on a date (for converting a total-value entry into a unit price). */
export function quantityOn(
  movements: readonly HoldingMovement[],
  accountId: string | null,
  assetId: string,
  on: IsoDate,
): Dec {
  return movements
    .filter((m) => m.assetId === assetId && (accountId === null || m.accountId === accountId) && m.occurredOn <= on)
    .reduce((sum, m) => sum.plus(m.quantity), ZERO);
}
