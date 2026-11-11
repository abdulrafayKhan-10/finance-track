import { describe, expect, it } from "vitest";
import { fetchAll } from "@/data/supabase/paging";

/** A fake PostgREST that caps responses at `cap` rows, like Supabase's max_rows. */
function server(total: number, cap: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { page, calls };
}

describe("fetchAll", () => {
  it("reads past the 1000-row cap instead of truncating", async () => {
    const s = server(2500, 1000);
    const r = await fetchAll(s.page);
    expect(r.data).toHaveLength(2500);
    expect(r.data.at(-1)).toBe(2499);
  });

  it("still reads everything when the server cap is lower than the page size", async () => {
    const s = server(1200, 500);
    const r = await fetchAll(s.page);
    expect(r.data).toHaveLength(1200);
    expect(new Set(r.data).size).toBe(1200);
  });

  it("stops on an error and reports it", async () => {
    const r = await fetchAll(async () => ({ data: null, error: { code: "42501" } }));
    expect(r.error).toEqual({ code: "42501" });
  });
});
