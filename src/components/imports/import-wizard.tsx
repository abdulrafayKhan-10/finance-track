"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AccountOption } from "@/features/accounts/queries";
import { commitImport, type ImportInput, type PreviewResult, previewImport } from "@/features/imports/actions";
import { parseCsv } from "@/lib/csv/csv";
import { type DateFormat, type ImportMapping, MAX_IMPORT_BYTES } from "@/lib/csv/import";
import { cn } from "@/lib/utils";

type Field =
  | "dateColumn"
  | "amountColumn"
  | "outColumn"
  | "inColumn"
  | "descriptionColumn"
  | "payeeColumn"
  | "categoryColumn"
  | "notesColumn";

/** Header words that usually mean each field, for a first guess the user can change. */
const GUESSES: Record<Field, RegExp> = {
  dateColumn: /date|posted|value dt|txn dt/i,
  amountColumn: /^amount$|amount \(|^amt|net amount/i,
  outColumn: /debit|withdraw|money out|paid out|dr\b/i,
  inColumn: /credit|deposit|money in|paid in|cr\b/i,
  descriptionColumn: /desc|narration|details|particular|memo|transaction$/i,
  payeeColumn: /payee|merchant|beneficiary|counterparty/i,
  categoryColumn: /categor/i,
  notesColumn: /note|remark|reference|ref\b/i,
};

const LABELS: Record<Field, string> = {
  dateColumn: "Date",
  amountColumn: "Amount (− for money out)",
  outColumn: "Money out (debit)",
  inColumn: "Money in (credit)",
  descriptionColumn: "Description",
  payeeColumn: "Payee (optional)",
  categoryColumn: "Category (optional)",
  notesColumn: "Notes (optional)",
};

const DUPLICATE_LABELS = {
  already_imported: "imported before",
  same_day_amount: "same date and amount exists",
  repeated_in_file: "repeated in this file",
} as const;

function guess(headers: string[], field: Field, taken: Set<number>): number | null {
  const i = headers.findIndex((h, idx) => !taken.has(idx) && GUESSES[field].test(h.trim()));
  return i >= 0 ? i : null;
}

export function ImportWizard({ accounts }: { accounts: AccountOption[] }) {
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string>();
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();

  const table = useMemo(() => (text ? parseCsv(text) : null), [text]);
  const headers = table?.rows[0] ?? [];
  const columnCount = Math.max(0, ...(table?.rows.slice(0, 20).map((r) => r.length) ?? [0]));

  async function chooseFile(file: File | undefined) {
    setPreview(null);
    setResult({});
    setFileError(undefined);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setFileError("The file is too large (max 900 KB). Split it into smaller files.");
      return;
    }
    const content = await file.text();
    const parsed = parseCsv(content);
    if (parsed.rows.length < 2) {
      setFileError("The file has no rows to import.");
      return;
    }
    setFileName(file.name);
    setText(content);
    const h = parsed.rows[0]!;
    const taken = new Set<number>();
    const pick = (f: Field) => {
      const i = guess(h, f, taken);
      if (i !== null) taken.add(i);
      return i;
    };
    const dateColumn = pick("dateColumn") ?? 0;
    const amountColumn = pick("amountColumn");
    const outColumn = amountColumn === null ? pick("outColumn") : null;
    const inColumn = amountColumn === null ? pick("inColumn") : null;
    const sampleDate = parsed.rows[1]?.[dateColumn] ?? "";
    setMapping({
      accountId: accounts.length === 1 ? accounts[0]!.id : "",
      hasHeader: true,
      dateColumn,
      dateFormat: /^\d{4}/.test(sampleDate.trim()) ? "ymd" : "dmy",
      amountMode: amountColumn === null && (outColumn !== null || inColumn !== null) ? "split" : "signed",
      amountColumn,
      outColumn,
      inColumn,
      invert: false,
      descriptionColumn: pick("descriptionColumn"),
      payeeColumn: pick("payeeColumn"),
      categoryColumn: pick("categoryColumn"),
      notesColumn: pick("notesColumn"),
    });
  }

  const update = (patch: Partial<ImportMapping>) => {
    setMapping((m) => (m ? { ...m, ...patch } : m));
    setPreview(null);
    setResult({});
  };

  const input = (): ImportInput | null => (mapping ? { text, fileName, mapping } : null);

  function runPreview() {
    const i = input();
    if (!i) return;
    setResult({});
    startTransition(async () => {
      const r = await previewImport(i);
      setPreview(r);
      if (r.ok)
        setIncluded(new Set(r.rows.filter((row) => row.errors.length === 0 && !row.duplicate).map((row) => row.line)));
    });
  }

  function runCommit() {
    const i = input();
    if (!i) return;
    startTransition(async () => {
      const r = await commitImport({ ...i, include: [...included] });
      if (r.ok) {
        setResult({
          success: `Imported ${r.created} transaction${r.created === 1 ? "" : "s"}. You can undo the whole import below.`,
        });
        setPreview(null);
        setText("");
        setMapping(null);
        setFileName("");
      } else {
        setResult({ error: r.error });
      }
    });
  }

  const columnSelect = (field: Field) => (
    <div className="grid gap-2" key={field}>
      <Label htmlFor={field}>{LABELS[field]}</Label>
      <Select
        id={field}
        value={mapping?.[field] === null || mapping?.[field] === undefined ? "" : String(mapping[field])}
        onChange={(e) => update({ [field]: e.target.value === "" ? null : Number(e.target.value) })}
      >
        {field !== "dateColumn" && <option value="">Not in the file</option>}
        {Array.from({ length: columnCount }, (_, i) => (
          <option key={i} value={i}>
            {mapping?.hasHeader && headers[i] ? headers[i] : `Column ${i + 1}`}
            {table?.rows[1]?.[i] ? ` (e.g. ${table.rows[1][i]!.slice(0, 24)})` : ""}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <div className="grid gap-6">
      <FormMessage error={result.error} success={result.success} />

      <section className="grid max-w-xl gap-2" aria-labelledby="step-file">
        <h2 id="step-file" className="font-semibold">
          1. Choose a CSV file
        </h2>
        <p className="text-sm text-muted-foreground">
          A statement exported from your bank or wallet as CSV (Excel: “Save as → CSV UTF-8”). Up to 900 KB and 5,000
          rows. Nothing is saved until you confirm.
        </p>
        <Input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={(e) => void chooseFile(e.target.files?.[0])}
        />
        {fileError && <p className="text-sm text-destructive">{fileError}</p>}
      </section>

      {mapping && table && (
        <section className="grid gap-4" aria-labelledby="step-map">
          <h2 id="step-map" className="font-semibold">
            2. Match the columns
          </h2>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="accountId">Account</Label>
              <Select id="accountId" value={mapping.accountId} onChange={(e) => update({ accountId: e.target.value })}>
                <option value="">Choose an account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dateFormat">Date order</Label>
              <Select
                id="dateFormat"
                value={mapping.dateFormat}
                onChange={(e) => update({ dateFormat: e.target.value as DateFormat })}
              >
                <option value="dmy">Day / month / year (31/03/2026)</option>
                <option value="ymd">Year-month-day (2026-03-31)</option>
                <option value="mdy">Month / day / year (03/31/2026)</option>
              </Select>
            </div>
            {columnSelect("dateColumn")}
            {columnSelect("descriptionColumn")}
            <fieldset className="grid gap-2 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Amounts</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="amountMode"
                    checked={mapping.amountMode === "signed"}
                    onChange={() => update({ amountMode: "signed" })}
                    className="size-4 accent-[var(--primary)]"
                  />
                  One amount column
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="amountMode"
                    checked={mapping.amountMode === "split"}
                    onChange={() => update({ amountMode: "split" })}
                    className="size-4 accent-[var(--primary)]"
                  />
                  Separate money-out and money-in columns
                </label>
              </div>
            </fieldset>
            {mapping.amountMode === "signed"
              ? columnSelect("amountColumn")
              : [columnSelect("outColumn"), columnSelect("inColumn")]}
            <label className="flex items-start gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={mapping.invert}
                onChange={(e) => update({ invert: e.target.checked })}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>
                Flip signs
                <span className="block text-xs text-muted-foreground">
                  If spending shows as positive numbers (common on card statements).
                </span>
              </span>
            </label>
            {columnSelect("categoryColumn")}
            {columnSelect("payeeColumn")}
            {columnSelect("notesColumn")}
            <label className="flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={mapping.hasHeader}
                onChange={(e) => update({ hasHeader: e.target.checked })}
                className="size-4 accent-[var(--primary)]"
              />
              The first row holds column names
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Negative amounts become expenses and positive ones income. Categories are matched by name; anything else
            goes to “Uncategorized”, which you can change later. Transfers between your own accounts are best entered by
            hand.
          </p>
          <Button
            type="button"
            onClick={runPreview}
            disabled={pending || !mapping.accountId}
            className="justify-self-start"
          >
            {pending && !preview ? "Checking…" : "Check rows"}
          </Button>
        </section>
      )}

      {preview && !preview.ok && <FormMessage error={preview.error} />}

      {preview?.ok && (
        <section className="grid gap-3" aria-labelledby="step-preview">
          <h2 id="step-preview" className="font-semibold">
            3. Review and import
          </h2>
          <p className="text-sm text-muted-foreground">
            {preview.counts.total} rows · {preview.counts.valid} ready · {preview.counts.invalid} with problems ·{" "}
            {preview.counts.duplicates} possible duplicates (unticked). Into <strong>{preview.accountName}</strong> (
            {preview.currency}).
          </p>
          <div className="max-h-[32rem] overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="p-2">
                    <span className="sr-only">Import</span>
                  </th>
                  <th scope="col" className="p-2">
                    Line
                  </th>
                  <th scope="col" className="p-2">
                    Date
                  </th>
                  <th scope="col" className="p-2">
                    Description
                  </th>
                  <th scope="col" className="p-2">
                    Category
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.rows.map((r) => {
                  const bad = r.errors.length > 0;
                  return (
                    <tr key={r.line} className={cn(bad && "bg-destructive/5")}>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          aria-label={`Import line ${r.line}`}
                          disabled={bad}
                          checked={included.has(r.line)}
                          onChange={(e) =>
                            setIncluded((s) => {
                              const next = new Set(s);
                              if (e.target.checked) next.add(r.line);
                              else next.delete(r.line);
                              return next;
                            })
                          }
                          className="size-4 accent-[var(--primary)]"
                        />
                      </td>
                      <td className="tabular p-2 text-muted-foreground">{r.line}</td>
                      <td className="p-2 whitespace-nowrap">{r.date ?? "—"}</td>
                      <td className="p-2">
                        {r.description || r.payee || "—"}
                        {bad && <span className="block text-xs text-destructive">{r.errors.join(" · ")}</span>}
                        {r.duplicate && (
                          <Badge variant="warning" className="ml-1">
                            {DUPLICATE_LABELS[r.duplicate]}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {r.categoryName ?? "—"}
                        {r.categoryText && !r.categoryMatched && (
                          <span className="block text-xs">“{r.categoryText}” not found</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "tabular p-2 text-right whitespace-nowrap",
                          r.kind === "expense" && "text-negative",
                        )}
                      >
                        {r.amount ? r.amount.replace("-", "−") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={runCommit} disabled={pending || included.size === 0}>
              {pending ? "Importing…" : `Import ${included.size} transaction${included.size === 1 ? "" : "s"}`}
            </Button>
            <span className="text-xs text-muted-foreground">All or nothing: if any row fails, nothing is saved.</span>
          </div>
        </section>
      )}

      {result.success && (
        <p className="text-sm">
          <Link href="/transactions?tag=imported" className="text-primary underline">
            See imported transactions
          </Link>
        </p>
      )}
    </div>
  );
}
