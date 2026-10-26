import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { NewCategoryForm } from "@/components/categories/new-category-form";
import { Badge } from "@/components/ui/badge";
import { createCategory } from "@/features/categories/actions";
import { type CategoryNode, getCategoryTree } from "@/features/categories/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Categories" };

function Row({
  c,
  child = false,
}: {
  c: CategoryNode | (CategoryNode["children"][number] & { children?: never });
  child?: boolean;
}) {
  return (
    <Link
      href={`/settings/categories/${c.id}`}
      className={`flex items-center gap-3 p-3 hover:bg-accent ${child ? "pl-8" : ""}`}
    >
      <span className="flex flex-1 flex-wrap items-center gap-2">
        <span className={child ? "" : "font-medium"}>{c.name}</span>
        {c.systemKey && <Badge variant="outline">built-in</Badge>}
        {c.isArchived && <Badge variant="outline">archived</Badge>}
      </span>
      <span className="text-xs text-muted-foreground">
        {c.lineCount} {c.lineCount === 1 ? "use" : "uses"}
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export default async function CategoriesPage() {
  await requireUser();
  const tree = await getCategoryTree();
  const parents = [...tree.expense, ...tree.income].map((c) => ({ id: c.id, name: c.name, kind: c.kind }));

  return (
    <>
      <PageHeader
        title="Categories"
        description="Used for income and spending reports and budgets. Transfers and adjustments have no category."
      />
      <div className="grid gap-8">
        <NewCategoryForm action={createCategory} parents={parents} />
        {(["expense", "income"] as const).map((kind) => (
          <section key={kind} aria-labelledby={`cat-${kind}`} className="grid gap-3">
            <h2 id={`cat-${kind}`} className="font-semibold">
              {kind === "expense" ? "Expense categories" : "Income categories"}
            </h2>
            <ul className="grid divide-y overflow-hidden rounded-xl border">
              {tree[kind].map((c) => (
                <li key={c.id}>
                  <Row c={c} />
                  {c.children.length > 0 && (
                    <ul className="divide-y border-t">
                      {c.children.map((child) => (
                        <li key={child.id}>
                          <Row c={child} child />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
