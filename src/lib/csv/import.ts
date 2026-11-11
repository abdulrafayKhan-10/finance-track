import { isIsoDate } from "@/domain/dates";
import { type CurrencyCode, Dec, minorUnits } from "@/domain/money";

/**
 * Turning a bank statement CSV into income and expense rows (docs/01 §CSV
 * import). Pure: the server runs it for the preview and again, from the same
 * file and mapping, for the commit, so nothing the browser sends is trusted.
 */

export const MAX_IMPORT_BYTES = 900 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export const DATE_FORMATS = ["ymd", "dmy", "mdy"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export type ImportMapping = {
  accountId: string;
  hasHeader: boolean;
  dateColumn: number;
  dateFormat: DateFormat;
  /** "signed": one amount column (negative = money out). "split": separate money-out and money-in columns. */
  amountMode: "signed" | "split";
  amountColumn: number | null;
  outColumn: number | null;
  inColumn: number | null;
  /** Flip signs, for banks that export money out as positive numbers. */
  invert: boolean;
  descriptionColumn: number | null;
  payeeColumn: number | null;
  categoryColumn: number | null;
  notesColumn: number | null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "2026-03-01", "01/03/2026", "1-Mar-2026", "01 Mar 2026" → ISO date, or null. */
export function parseImportDate(input: string, format: DateFormat): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  const named = /^(\d{1,2})[\s\-/.]([A-Za-z]{3})[A-Za-z]*[\s\-/.,]+(\d{4})$/.exec(s);
  if (named) {
    const month = MONTHS.indexOf(named[2]!.toLowerCase());
    if (month < 0) return null;
    [d, m, y] = [Number(named[1]), month + 1, Number(named[3])];
  } else {
    const parts = /^(\d{1,4})[\-/.](\d{1,2})[\-/.](\d{1,4})/.exec(s);
    if (!parts) return null;
    const [a, b, c] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    if (format === "ymd") [y, m, d] = [a, b, c];
    else if (format === "dmy") [d, m, y] = [a, b, c];
    else [m, d, y] = [a, b, c];
  }
  if (y < 1900 || y > 2999) return null;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

/**
 * "1,250.50", "-1250", "(1,250.50)", "Rs 1,250", "1,250.50 DR" → exact decimal.
 * A dot is the decimal separator. Too many decimals for the currency is an error, never rounded.
 */
export function parseImportAmount(
  input: string,
  currency: CurrencyCode,
): { ok: true; value: Dec | null } | { ok: false; error: string } {
  let s = input.trim();
  if (s === "" || s === "-") return { ok: true, value: null };
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\b(dr|debit)\.?$/i.test(s)) negative = true;
  s = s.replace(/\b(dr|cr|debit|credit)\.?$/i, "").trim();
  // A currency prefix such as "Rs.", "PKR" or "$" (its dot is not a decimal point).
  s = s.replace(/^-?\s*(rs\.?|pkr|usd|[₨$€£¥])\s*/i, (m) => (m.trim().startsWith("-") ? "-" : ""));
  s = s.replace(/[^\d.\-]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: "not a number" };
  const decimals = s.split(".")[1]?.length ?? 0;
  if (decimals > minorUnits(currency)) return { ok: false, error: "too many decimal places" };
  const value = new Dec(s);
  if (value.greaterThanOrEqualTo("1e15")) return { ok: false, error: "too large" };
  return { ok: true, value: negative ? value.negated() : value };
}

export type CategoryRef = { id: string; name: string; kind: "income" | "expense"; archived: boolean };

export type ImportRow = {
  /** 1-based line number in the file, as the user sees it in a spreadsheet. */
  line: number;
  date: string | null;
  /** Signed: negative = money out (an expense). Decimal string. */
  amount: string | null;
  kind: "income" | "expense" | null;
  description: string;
  payee: string | null;
  notes: string | null;
  categoryId: string | null;
  /** The category text in the file, and whether it matched one of the user's categories. */
  categoryText: string | null;
  categoryMatched: boolean;
  errors: string[];
  fingerprint: string | null;
};

const cell = (row: string[], index: number | null) => (index === null || index < 0 ? "" : (row[index] ?? "").trim());

/** Stable 64-bit FNV-1a hash as hex: a duplicate key, not a security measure. */
export function fingerprint(parts: readonly string[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (const ch of parts.join("\u001f")) {
    const c = ch.codePointAt(0)!;
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Maps every data row; rows keep their errors so the preview can show them all at once. */
export function mapImportRows(
  rows: readonly string[][],
  mapping: ImportMapping,
  currency: CurrencyCode,
  categories: readonly CategoryRef[],
  fallback: { income: string; expense: string },
): ImportRow[] {
  const byName = new Map<string, CategoryRef>();
  for (const c of categories) if (!c.archived) byName.set(`${c.kind}:${normalize(c.name)}`, c);
  const data = mapping.hasHeader ? rows.slice(1) : rows;
  const offset = mapping.hasHeader ? 2 : 1;

  return data.map((row, i) => {
    const errors: string[] = [];
    const rawDate = cell(row, mapping.dateColumn);
    const date = parseImportDate(rawDate, mapping.dateFormat);
    if (!date) errors.push(rawDate ? `Date “${rawDate}” isn’t ${mapping.dateFormat.toUpperCase()}` : "No date");

    let amount: Dec | null = null;
    if (mapping.amountMode === "signed") {
      const a = parseImportAmount(cell(row, mapping.amountColumn), currency);
      if (!a.ok) errors.push(`Amount: ${a.error}`);
      else amount = a.value;
    } else {
      const out = parseImportAmount(cell(row, mapping.outColumn), currency);
      const inn = parseImportAmount(cell(row, mapping.inColumn), currency);
      if (!out.ok) errors.push(`Money out: ${out.error}`);
      if (!inn.ok) errors.push(`Money in: ${inn.error}`);
      if (out.ok && inn.ok) {
        const o = out.value?.abs() ?? null;
        const n = inn.value?.abs() ?? null;
        if (o && n && !o.isZero() && !n.isZero()) errors.push("Both money out and money in are filled");
        else amount = o && !o.isZero() ? o.negated() : n;
      }
    }
    if (amount && mapping.invert) amount = amount.negated();
    if (!errors.some((e) => e.startsWith("Amount") || e.startsWith("Money")) && (!amount || amount.isZero())) {
      errors.push("No amount");
      amount = null;
    }

    const kind = amount ? (amount.isNegative() ? "expense" : "income") : null;
    const categoryText = cell(row, mapping.categoryColumn) || null;
    const matched = kind && categoryText ? byName.get(`${kind}:${normalize(categoryText)}`) : undefined;
    const description = cell(row, mapping.descriptionColumn).slice(0, 200);
    const payee = cell(row, mapping.payeeColumn).slice(0, 100) || null;
    const amountText = amount ? amount.toFixed(minorUnits(currency)) : null;

    return {
      line: i + offset,
      date,
      amount: amountText,
      kind,
      description,
      payee,
      notes: cell(row, mapping.notesColumn).slice(0, 2000) || null,
      categoryId: kind ? (matched?.id ?? fallback[kind]) : null,
      categoryText,
      categoryMatched: Boolean(matched),
      errors,
      fingerprint:
        date && amountText ? fingerprint([mapping.accountId, date, amountText, normalize(description)]) : null,
    };
  });
}

export type DuplicateFlag = "already_imported" | "same_day_amount" | "repeated_in_file" | null;

/**
 * Flags likely duplicates: a row imported before (same fingerprint), an
 * existing transaction on the account with the same date and amount, or a
 * repeat of an earlier row in this file. Flagged rows start unticked.
 */
export function flagDuplicates(
  rows: readonly ImportRow[],
  existingFingerprints: ReadonlySet<string>,
  existingLines: readonly { date: string; amount: string }[],
): DuplicateFlag[] {
  const sameDayAmount = new Map<string, number>();
  for (const l of existingLines) {
    const k = `${l.date}|${new Dec(l.amount).toFixed(4)}`;
    sameDayAmount.set(k, (sameDayAmount.get(k) ?? 0) + 1);
  }
  const seen = new Set<string>();
  return rows.map((r) => {
    if (!r.fingerprint || !r.amount || !r.date) return null;
    if (existingFingerprints.has(r.fingerprint)) return "already_imported";
    if (seen.has(r.fingerprint)) return "repeated_in_file";
    seen.add(r.fingerprint);
    const k = `${r.date}|${new Dec(r.amount).toFixed(4)}`;
    const left = sameDayAmount.get(k) ?? 0;
    if (left > 0) {
      sameDayAmount.set(k, left - 1);
      return "same_day_amount";
    }
    return null;
  });
}
