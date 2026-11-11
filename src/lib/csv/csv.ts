/**
 * Minimal RFC 4180 CSV reading and writing, shared by the browser (import
 * preview) and the server (validation, exports). Handles quoted fields with
 * commas, quotes and line breaks, CRLF/LF, a UTF-8 BOM (Excel), and `,` `;`
 * or tab separators. Values are only ever treated as text, never evaluated.
 */

export type CsvTable = { rows: string[][]; delimiter: string };

const DELIMITERS = [",", ";", "\t"] as const;

/** Picks the separator that splits the first line into the most columns (outside quotes). */
function detectDelimiter(text: string): string {
  const firstLine: string[] = [];
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    firstLine.push(ch);
  }
  let best: string = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = firstLine.filter((c) => c === d).length;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string, delimiter?: string): CsvTable {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += ch;
      }
      i += 1;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
    } else {
      field += ch;
    }
    i += 1;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines (a trailing newline, or empty rows in the middle).
  return { rows: rows.filter((r) => r.some((c) => c.trim() !== "")), delimiter: d };
}

/**
 * Cells that a spreadsheet would run as a formula are prefixed with `'`
 * (docs/05-security.md: formula injection). Numbers we write ourselves, such
 * as "-1250.00", are left alone so they stay numeric.
 */
export function neutralizeCell(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export type CsvCell = string | number | boolean | null | undefined;

/** A CSV document (CRLF line ends, UTF-8 BOM so Excel reads non-ASCII text correctly). */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const line = (cells: readonly CsvCell[]) =>
    cells.map((c) => quote(neutralizeCell(c === null || c === undefined ? "" : String(c)))).join(",");
  return `﻿${[line(header), ...rows.map(line)].join("\r\n")}\r\n`;
}
