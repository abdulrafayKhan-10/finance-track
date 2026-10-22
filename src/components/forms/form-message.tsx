import { CircleAlert, CircleCheck } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";

/** Form-level outcome, announced to screen readers. */
export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertTitle>{error}</AlertTitle>
      </Alert>
    );
  }
  if (success) {
    return (
      <Alert variant="success" role="status">
        <CircleCheck aria-hidden />
        <AlertTitle>{success}</AlertTitle>
      </Alert>
    );
  }
  return null;
}
