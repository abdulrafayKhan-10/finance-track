import type { Money } from "@/domain/money";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A formatted amount: tabular figures; negatives carry a "−" sign and the
 * negative colour, so colour never carries meaning alone.
 */
export function Amount({
  money,
  sign = "auto",
  colored = true,
  className,
}: {
  money: Money;
  sign?: "auto" | "always" | "never";
  colored?: boolean;
  className?: string;
}) {
  const negative = money.rounded().isNegative() && sign !== "never";
  return (
    <span className={cn("tabular whitespace-nowrap", colored && negative && "text-negative", className)}>
      {formatMoney(money, { sign })}
    </span>
  );
}
