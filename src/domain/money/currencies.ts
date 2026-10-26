/**
 * ISO 4217 currencies supported by the app, with minor units. Must match the
 * `public.currencies` seed (verified by tests/db/reference-data.test.ts).
 */
export const CURRENCIES = {
  PKR: { name: "Pakistani Rupee", minorUnits: 2 },
  USD: { name: "US Dollar", minorUnits: 2 },
  EUR: { name: "Euro", minorUnits: 2 },
  GBP: { name: "Pound Sterling", minorUnits: 2 },
  AED: { name: "UAE Dirham", minorUnits: 2 },
  SAR: { name: "Saudi Riyal", minorUnits: 2 },
  QAR: { name: "Qatari Riyal", minorUnits: 2 },
  KWD: { name: "Kuwaiti Dinar", minorUnits: 3 },
  BHD: { name: "Bahraini Dinar", minorUnits: 3 },
  OMR: { name: "Omani Rial", minorUnits: 3 },
  INR: { name: "Indian Rupee", minorUnits: 2 },
  BDT: { name: "Bangladeshi Taka", minorUnits: 2 },
  LKR: { name: "Sri Lankan Rupee", minorUnits: 2 },
  CNY: { name: "Chinese Yuan", minorUnits: 2 },
  JPY: { name: "Japanese Yen", minorUnits: 0 },
  MYR: { name: "Malaysian Ringgit", minorUnits: 2 },
  SGD: { name: "Singapore Dollar", minorUnits: 2 },
  TRY: { name: "Turkish Lira", minorUnits: 2 },
  CAD: { name: "Canadian Dollar", minorUnits: 2 },
  AUD: { name: "Australian Dollar", minorUnits: 2 },
  NZD: { name: "New Zealand Dollar", minorUnits: 2 },
  CHF: { name: "Swiss Franc", minorUnits: 2 },
  SEK: { name: "Swedish Krona", minorUnits: 2 },
  NOK: { name: "Norwegian Krone", minorUnits: 2 },
  DKK: { name: "Danish Krone", minorUnits: 2 },
  HKD: { name: "Hong Kong Dollar", minorUnits: 2 },
  ZAR: { name: "South African Rand", minorUnits: 2 },
  KRW: { name: "South Korean Won", minorUnits: 0 },
  THB: { name: "Thai Baht", minorUnits: 2 },
  IDR: { name: "Indonesian Rupiah", minorUnits: 2 },
} as const satisfies Record<string, { name: string; minorUnits: number }>;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(code: string): code is CurrencyCode {
  return Object.hasOwn(CURRENCIES, code);
}

export function minorUnits(code: CurrencyCode): number {
  return CURRENCIES[code].minorUnits;
}
