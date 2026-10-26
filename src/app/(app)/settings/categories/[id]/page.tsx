import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { CategoryEditForm } from "@/components/categories/category-edit-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { SelectField } from "@/components/forms/select-field";
import { deleteCategory, mergeCategory, updateCategory } from "@/features/categories/actions";
import { getCategoryTree } from "@/features/categories/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit category" };

export default async function CategoryPage({ params }: PageProps<"/settings/categories/[id]">) {
  await requireUser();
  const { id } = await params;
  const tree = await getCategoryTree();
  const all = [...tree.expense, ...tree.income].flatMap((c) => [
    { ...c },
    ...c.children.map((ch) => ({ ...ch, children: [] })),
  ]);
  const category = all.find((c) => c.id === id);
  if (!category) notFound();
  const hasChildren = category.children.length > 0;
  const sameKind = all.filter((c) => c.kind === category.kind && c.id !== category.id);
  const parents = tree[category.kind].filter((c) => c.id !== category.id).map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader
        title={category.name}
        description={`${category.kind === "expense" ? "Expense" : "Income"} category · used by ${category.lineCount} transaction lines`}
      />
      <CategoryEditForm action={updateCategory} category={category} parents={parents} hasChildren={hasChildren} />

      {!category.systemKey && (
        <section className="mt-10 grid max-w-xl justify-items-start gap-3 border-t pt-6">
          <h2 className="font-medium">Merge into another category</h2>
          <p className="text-sm text-muted-foreground">
            Moves all its transactions to the chosen category, then removes this one.
            {hasChildren && " Move or merge its subcategories first."}
          </p>
          {!hasChildren && sameKind.length > 0 && (
            <ConfirmAction
              action={mergeCategory}
              fields={{ id: category.id }}
              triggerLabel="Merge…"
              title={`Merge “${category.name}”`}
              description="Its transactions will use the category you choose. This can't be undone automatically."
              confirmLabel="Merge"
            >
              <SelectField id="into" label="Merge into" defaultValue="">
                <option value="">Choose a category</option>
                {sameKind.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            </ConfirmAction>
          )}
        </section>
      )}

      <section className="mt-10 grid max-w-xl justify-items-start gap-3 border-t pt-6">
        <h2 className="font-medium">Delete</h2>
        {category.systemKey ? (
          <p className="text-sm text-muted-foreground">
            Built-in categories are used by imports and can&rsquo;t be deleted. You can rename them.
          </p>
        ) : category.lineCount > 0 || hasChildren ? (
          <p className="text-sm text-muted-foreground">
            It is in use. Merge it into another category, or archive it, instead.
          </p>
        ) : (
          <ConfirmAction
            action={deleteCategory}
            fields={{ id: category.id }}
            triggerLabel="Delete category"
            title={`Delete “${category.name}”?`}
            description="No transactions use it. This can't be undone."
            confirmLabel="Delete"
          />
        )}
      </section>
    </>
  );
}
