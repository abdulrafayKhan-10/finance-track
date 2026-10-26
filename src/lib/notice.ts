/**
 * One-shot confirmation banners after a redirect (`?notice=key`). Only these
 * fixed messages can be shown, so the URL can't inject text into the page.
 */
export const NOTICES = {
  saved: "Transaction saved.",
  deleted: "Transaction deleted.",
  account_deleted: "Account deleted.",
  reconciled: "Reconciliation saved.",
  reconciliation_undone: "Reconciliation removed. Its transactions are unlocked.",
} as const;

export type NoticeKey = keyof typeof NOTICES;

export function noticeText(value: unknown): string | undefined {
  return typeof value === "string" && Object.hasOwn(NOTICES, value) ? NOTICES[value as NoticeKey] : undefined;
}

/** Adds `notice=key` to a same-origin path, keeping any existing query. */
export function withNotice(path: string, key: NoticeKey): string {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("notice", key);
  return url.pathname + url.search + url.hash;
}
