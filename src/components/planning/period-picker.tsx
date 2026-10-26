import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PERIOD_KEYS, PERIOD_LABELS, type SelectedPeriod } from "@/features/periods";

/** GET form: the period lives in the URL so it survives reloads and can be bookmarked. */
export function PeriodPicker({ period }: { period: SelectedPeriod }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Reporting period">
      <div className="grid gap-1">
        <Label htmlFor="period">Period</Label>
        <Select id="period" name="period" defaultValue={period.key} className="w-auto">
          {PERIOD_KEYS.map((k) => (
            <option key={k} value={k}>
              {PERIOD_LABELS[k]}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="from">From</Label>
        <Input id="from" name="from" type="date" defaultValue={period.from} className="w-auto" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="to">To</Label>
        <Input id="to" name="to" type="date" defaultValue={period.to} className="w-auto" />
      </div>
      <Button type="submit" variant="secondary">
        Show
      </Button>
      <p className="w-full text-xs text-muted-foreground">Dates apply when the period is “Custom”.</p>
    </form>
  );
}
