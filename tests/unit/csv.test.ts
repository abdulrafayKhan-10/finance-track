import { describe, expect, it } from "vitest";
import { neutralizeCell, parseCsv, toCsv } from "@/lib/csv/csv";
import {
  type CategoryRef,
  flagDuplicates,
  type ImportMapping,
  mapImportRows,
  parseImportAmount,
  parseImportDate,
} from "@/lib/csv/import";

describe("parseCsv", () => {
  it("handles quotes, embedded commas, quotes and line breaks, CRLF and a BOM", () => {
    const text =
      '﻿Date,Description,Amount\r\n2026-03-01,"Lunch, with ""team""",-1250.50\r\n2026-03-02,"Two\nlines",500\r\n\r\n';
    expect(parseCsv(text).rows).toEqual([
      ["Date", "Description", "Amount"],
      ["2026-03-01", 'Lunch, with "team"', "-1250.50"],
      ["2026-03-02", "Two\nlines", "500"],
    ]);
  });

  it("detects semicolon and tab separators", () => {
    expect(parseCsv("a;b;c\n1;2;3").rows[1]).toEqual(["1", "2", "3"]);
    expect(parseCsv("a\tb\n1\t2").delimiter).toBe("\t");
  });
});

describe("toCsv", () => {
  it("neutralizes formulas but keeps plain numbers numeric (formula injection)", () => {
    expect(neutralizeCell('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(neutralizeCell("+92 300")).toBe("'+92 300");
    expect(neutralizeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeCell("-1250.00")).toBe("-1250.00");
    expect(neutralizeCell("-cmd")).toBe("'-cmd");
  });

  it("quotes and round-trips through the parser", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        ["x, y", 'say "hi"'],
        [null, 3],
      ],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(parseCsv(csv).rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["", "3"],
    ]);
  });
});

describe("import parsing", () => {
  it("reads dates in the chosen order and named months", () => {
    expect(parseImportDate("2026-03-01", "ymd")).toBe("2026-03-01");
    expect(parseImportDate("01/03/2026", "dmy")).toBe("2026-03-01");
    expect(parseImportDate("03/01/2026", "mdy")).toBe("2026-03-01");
    expect(parseImportDate("1-Mar-2026", "dmy")).toBe("2026-03-01");
    expect(parseImportDate("01 March 2026", "ymd")).toBe("2026-03-01");
    expect(parseImportDate("31/02/2026", "dmy")).toBeNull();
    expect(parseImportDate("hello", "dmy")).toBeNull();
  });

  it("reads amounts with separators, brackets, DR/CR and currency prefixes, never rounding", () => {
    const v = (s: string) => {
      const r = parseImportAmount(s, "PKR");
      return r.ok ? (r.value?.toFixed(2) ?? null) : r.error;
    };
    expect(v("1,250.50")).toBe("1250.50");
    expect(v("-1,250.50")).toBe("-1250.50");
    expect(v("(1,250.50)")).toBe("-1250.50");
    expect(v("1,250.50 DR")).toBe("-1250.50");
    expect(v("1,250.50 CR")).toBe("1250.50");
    expect(v("Rs. 1,250")).toBe("1250.00");
    expect(v("-Rs 99")).toBe("-99.00");
    expect(v("")).toBeNull();
    expect(v("1.234")).toBe("too many decimal places");
    expect(v("abc")).toBe("not a number");
  });
});

describe("mapImportRows", () => {
  const categories: CategoryRef[] = [
    { id: "food", name: "Food & groceries", kind: "expense", archived: false },
    { id: "salary", name: "Salary", kind: "income", archived: false },
  ];
  const base: ImportMapping = {
    accountId: "bank",
    hasHeader: true,
    dateColumn: 0,
    dateFormat: "dmy",
    amountMode: "signed",
    amountColumn: 2,
    outColumn: null,
    inColumn: null,
    invert: false,
    descriptionColumn: 1,
    payeeColumn: null,
    categoryColumn: 3,
    notesColumn: null,
  };
  const fallback = { income: "unc-in", expense: "unc-out" };

  it("signs, classifies and matches categories by name and kind", () => {
    const rows = parseCsv(
      "Date,Desc,Amount,Cat\n01/03/2026,Groceries,-1500,food & GROCERIES\n05/03/2026,Pay,100000,Salary\n06/03/2026,Misc,-10,Unknown",
    ).rows;
    const out = mapImportRows(rows, base, "PKR", categories, fallback);
    expect(out.map((r) => [r.line, r.kind, r.amount, r.categoryId, r.categoryMatched])).toEqual([
      [2, "expense", "-1500.00", "food", true],
      [3, "income", "100000.00", "salary", true],
      [4, "expense", "-10.00", "unc-out", false],
    ]);
    expect(out.every((r) => r.errors.length === 0)).toBe(true);
  });

  it("supports money-out / money-in columns and inverted signs", () => {
    const rows = parseCsv("d,desc,out,in\n2026-03-01,a,500,\n2026-03-02,b,,700\n2026-03-03,c,1,2").rows;
    const out = mapImportRows(
      rows,
      {
        ...base,
        dateFormat: "ymd",
        amountMode: "split",
        amountColumn: null,
        outColumn: 2,
        inColumn: 3,
        categoryColumn: null,
      },
      "PKR",
      categories,
      fallback,
    );
    expect(out.map((r) => r.amount)).toEqual(["-500.00", "700.00", null]);
    expect(out[2]!.errors).toContain("Both money out and money in are filled");
    const inverted = mapImportRows(
      rows.slice(0, 2),
      { ...base, dateFormat: "ymd", invert: true, amountColumn: 2, categoryColumn: null },
      "PKR",
      categories,
      fallback,
    );
    // A bank that lists money out as positive "500": inverted, it becomes an expense.
    expect(inverted[0]!.amount).toBe("-500.00");
    expect(inverted[0]!.kind).toBe("expense");
  });

  it("reports every problem on a row instead of stopping at the first", () => {
    const out = mapImportRows(parseCsv("d,desc,a\nlater,x,1.234").rows, base, "PKR", categories, fallback);
    expect(out[0]!.errors).toHaveLength(2);
    expect(out[0]!.fingerprint).toBeNull();
  });

  it("flags rows imported before, same-day same-amount matches, and repeats in the file", () => {
    const rows = mapImportRows(
      parseCsv("d,desc,a\n01/03/2026,A,-10\n01/03/2026,A,-10\n02/03/2026,B,-20\n03/03/2026,C,-30").rows,
      { ...base, categoryColumn: null },
      "PKR",
      categories,
      fallback,
    );
    const flags = flagDuplicates(rows, new Set([rows[3]!.fingerprint!]), [{ date: "2026-03-02", amount: "-20.0000" }]);
    expect(flags).toEqual([null, "repeated_in_file", "same_day_amount", "already_imported"]);
  });
});
