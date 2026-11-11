/**
 * PostgREST caps every response at `max_rows` (1000 on Supabase by default)
 * and truncates silently. Anything that can grow with the user's history
 * (ledger lines, movements, valuations, exports) must be read page by page.
 *
 * `page(from, to)` must apply a deterministic order (ending in a unique key)
 * and `.range(from, to)`. Pages are requested until one comes back empty, so
 * a server limit lower than `size` still returns every row.
 */
export const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;

type PageResult<T> = { data: T[] | null; error: { code?: string; message?: string } | null };

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  size = PAGE_SIZE,
): Promise<{ data: T[]; error: PageResult<T>["error"] }> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(rows.length, rows.length + size - 1);
    if (error) return { data: rows, error };
    if (!data || data.length === 0) return { data: rows, error: null };
    rows.push(...data);
  }
  return { data: rows, error: { code: "too_many_rows" } };
}
