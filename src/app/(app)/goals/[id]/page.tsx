import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { Meter } from "@/components/figures/meter";
import { Stat } from "@/components/figures/stat";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { Amount } from "@/components/money/amount";
import { ActionForm } from "@/components/planning/action-form";
import { Button } from "@/components/ui/button";
import { loadFinanceContext } from "@/features/finance-context";
import { addAllocation, removeAllocation, removeGoal, setGoalStatus } from "@/features/goals/actions";
import { getGoals } from "@/features/goals/queries";
import { requireUser } from "@/lib/auth";
import { formatDate, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Goal" };

export default async function GoalPage({ params }: PageProps<"/goals/[id]">) {
  await requireUser();
  const { id } = await params;
  const [{ goals }, ctx] = await Promise.all([getGoals(), loadFinanceContext()]);
  const view = goals.find((g) => g.goal.id === id);
  if (!view) notFound();
  const { goal, progress, allocations } = view;
  const sources = ctx.accounts.filter(
    (a) => a.class === "asset" && a.currency === goal.target.currency && a.status !== "archived",
  );
  const accountName = new Map(ctx.accounts.map((a) => [a.id, a.name]));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={goal.name}
          description={[
            view.linkedAccountName ? `Follows ${view.linkedAccountName}` : "Funded by allocations",
            goal.targetDate ? `target date ${formatDate(goal.targetDate)}` : null,
            goal.status !== "active" ? goal.status : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Button asChild variant="outline">
          <Link href={`/goals/${goal.id}/edit`}>
            <Pencil aria-hidden /> Edit
          </Link>
        </Button>
      </div>
      {goal.description && <p className="mb-4 text-sm text-muted-foreground">{goal.description}</p>}

      {progress.status === "ok" ? (
        <div className="mb-8 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Progress">
              <Amount money={progress.progress} colored={false} />
            </Stat>
            <Stat label="Target">
              <Amount money={goal.target} colored={false} />
            </Stat>
            <Stat label="Still to go">
              <Amount money={progress.remaining} colored={false} />
            </Stat>
          </div>
          <Meter fraction={progress.fraction} label={`${formatPercent(progress.ratio)} of target`} />
          <p className="text-sm text-muted-foreground">
            {formatPercent(progress.ratio)} of target
            {progress.reached && goal.status === "active" && " · reached! Mark it completed when you're done."}
          </p>
        </div>
      ) : (
        <p className="mb-8 text-sm text-warning">
          {progress.reason === "missing_rate"
            ? "Progress needs an exchange rate between the account and goal currencies."
            : "The linked account is no longer available."}
        </p>
      )}

      {goal.fundingMode === "allocations" && (
        <section className="mb-8 grid gap-4" aria-labelledby="alloc-title">
          <h2 id="alloc-title" className="font-semibold">
            Allocations
          </h2>
          {goal.status === "active" && (
            <ActionForm
              action={addAllocation}
              fields={{ goal_id: goal.id }}
              submitLabel="Save"
              className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
            >
              <SelectField id="direction" label="Type" defaultValue="allocate">
                <option value="allocate">Allocate (earmark)</option>
                <option value="release">Release (un-earmark)</option>
              </SelectField>
              <FormField id="amount" label={`Amount (${goal.target.currency})`} inputMode="decimal" />
              <FormField id="allocated_on" label="Date" type="date" defaultValue={ctx.today} />
              <SelectField
                id="source_account_id"
                label="From account (optional)"
                defaultValue=""
                hint="Used to warn when earmarks exceed what the account holds."
              >
                <option value="">Not specified</option>
                {sources.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SelectField>
              <div className="sm:col-span-2">
                <FormField id="note" label="Note (optional)" maxLength={500} />
              </div>
            </ActionForm>
          )}
          {allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing allocated yet.</p>
          ) : (
            <ul className="grid divide-y rounded-xl border">
              {[...allocations].reverse().map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                  <span className="grid">
                    <span>
                      {formatDate(a.on)} · <Amount money={a.amount} sign="always" />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {a.sourceAccountId
                        ? `from ${accountName.get(a.sourceAccountId) ?? "an account"}`
                        : "no source account"}
                      {a.note && ` · ${a.note}`}
                    </span>
                  </span>
                  <ConfirmAction
                    action={removeAllocation}
                    fields={{ id: a.id, goal_id: goal.id }}
                    triggerLabel="Remove"
                    title="Remove this entry?"
                    description="It is only an earmark; no money moves."
                    confirmLabel="Remove"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-wrap gap-2 border-t pt-6">
        {goal.status === "active" ? (
          <>
            <ActionForm
              action={setGoalStatus}
              fields={{ id: goal.id, status: "completed" }}
              submitLabel="Mark completed"
              variant="secondary"
            />
            <ActionForm
              action={setGoalStatus}
              fields={{ id: goal.id, status: "archived" }}
              submitLabel="Archive"
              variant="outline"
            />
          </>
        ) : (
          <ActionForm
            action={setGoalStatus}
            fields={{ id: goal.id, status: "active" }}
            submitLabel="Reopen"
            variant="secondary"
          />
        )}
        <ConfirmAction
          action={removeGoal}
          fields={{ id: goal.id }}
          triggerLabel="Delete goal"
          title={`Delete “${goal.name}”?`}
          description="The goal and its allocation history are removed. No money or transactions are affected."
          confirmLabel="Delete goal"
        />
      </section>
    </>
  );
}
