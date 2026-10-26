import { Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CASH_KINDS } from "@/domain/ledger/types";
import type { AccountOption } from "@/features/accounts/queries";
import type { CategoryOption } from "@/features/categories/queries";
import type { TransactionSearch } from "@/features/transactions/queries";
import { KIND_LABELS } from "@/lib/labels";

/** A plain GET form: filters live in the URL, so they survive reloads and can be bookmarked. */
export function TransactionFilters({
  search,
  accounts,
  categories,
}: {
  search: TransactionSearch;
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const active = Object.entries(search).some(([k, v]) => k !== "cursor" && k !== "order" && v);
  return (
    <form method="get" role="search" className="mb-6 grid gap-3 rounded-xl border p-4">
      <div className="flex gap-2">
        <Label htmlFor="q" className="sr-only">
          Search
        </Label>
        <Input id="q" name="q" type="search" placeholder="Search description, payee or notes" defaultValue={search.q} />
        <Button type="submit">
          <Search aria-hidden /> Search
        </Button>
      </div>
      <details open={active} className="group">
        <summary className="cursor-pointer text-sm text-muted-foreground">Filters</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1">
            <Label htmlFor="f-account">Account</Label>
            <Select id="f-account" name="account" defaultValue={search.account ?? ""}>
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-category">Category</Label>
            <Select id="f-category" name="category" defaultValue={search.category ?? ""}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-kind">Type</Label>
            <Select id="f-kind" name="kind" defaultValue={search.kind ?? ""}>
              <option value="">All types</option>
              {CASH_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-status">Status</Label>
            <Select id="f-status" name="status" defaultValue={search.status ?? ""}>
              <option value="">Any status</option>
              <option value="cleared">Cleared</option>
              <option value="pending">Pending</option>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-from">From</Label>
            <Input id="f-from" name="from" type="date" defaultValue={search.from} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-to">To</Label>
            <Input id="f-to" name="to" type="date" defaultValue={search.to} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-tag">Tag</Label>
            <Input id="f-tag" name="tag" defaultValue={search.tag} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-order">Sort</Label>
            <Select id="f-order" name="order" defaultValue={search.order ?? "desc"}>
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
          {active && (
            <Button asChild variant="ghost">
              <Link href="/transactions">Clear</Link>
            </Button>
          )}
        </div>
      </details>
    </form>
  );
}
