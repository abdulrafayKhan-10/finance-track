/**
 * Maps database and Supabase errors to messages that are safe to show. Never
 * echoes the raw error, which could include record contents.
 */
type DbError = { code?: string; message?: string } | null | undefined;

const MESSAGES: Record<string, string> = {
  FT001: "That transaction doesn't add up. Check the amounts, accounts and category.",
  FT002:
    "This account already has transactions, so its currency, asset/liability type and opening date can't move past them.",
  FT003: "That category change isn't allowed.",
  FT004: "Archived accounts can't receive new transactions. Restore the account first.",
  FT005: "This record changed on another device or tab. Reload it and try again.",
  FT006: "This transaction is part of a reconciliation. Confirm the unlock to change it.",
  FT007: "Some of the submitted information is invalid.",
  FT404: "That record no longer exists.",
  "23505": "That name is already in use.",
  "23503": "This record is still used elsewhere, or refers to something that doesn't exist.",
  "23514": "Some of the submitted values are out of range.",
  "42501": "You don't have access to that record.",
  PGRST116: "That record no longer exists.",
};

export const GENERIC_ERROR = "Something went wrong. Nothing was changed. Please try again.";

export function userMessage(error: DbError, overrides: Partial<Record<string, string>> = {}): string {
  const code = error?.code ?? "";
  return overrides[code] ?? MESSAGES[code] ?? GENERIC_ERROR;
}

export class DataError extends Error {
  constructor(
    readonly code: string,
    message = "Database request failed",
  ) {
    super(message);
    this.name = "DataError";
  }
}

/** Throws a DataError carrying only the code, so nothing sensitive is attached. */
export function throwIfError(error: DbError): void {
  if (error) throw new DataError(error.code ?? "unknown");
}
