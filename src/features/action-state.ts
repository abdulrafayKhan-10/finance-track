import { DataError, GENERIC_ERROR, userMessage } from "@/lib/errors";
import type { FieldErrors } from "@/lib/validation/auth";

/** Result of a form server action, rendered by the form. */
export type ActionState = {
  error?: string;
  fieldErrors?: FieldErrors;
  success?: string;
  /** Set when the save was refused because the record is reconciled (FT006). */
  needsUnlock?: boolean;
};

/**
 * Turns a thrown data error into a safe message. Anything else is logged
 * without details and reported generically.
 */
export function failure(error: unknown, overrides: Partial<Record<string, string>> = {}): ActionState {
  if (error instanceof DataError) {
    const message = userMessage({ code: error.code }, overrides);
    // An error code the app doesn't recognise is a bug worth seeing in the server log (codes carry no user data).
    if (message === GENERIC_ERROR) console.error("Unrecognised data error code:", error.code);
    return { error: message, needsUnlock: error.code === "FT006" || undefined };
  }
  console.error("Unexpected action error:", error instanceof Error ? error.name : typeof error);
  return { error: GENERIC_ERROR };
}
