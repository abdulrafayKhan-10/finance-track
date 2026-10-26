/**
 * Chart data crossing to the client: plotting uses `value` (a float is fine
 * for geometry); every number a person reads comes from `display`, which the
 * server formatted from exact decimals.
 */
export type ChartPoint = { label: string; value: number; display: string };
export type TwoSeriesPoint = { label: string; a: number; aDisplay: string; b: number; bDisplay: string };
