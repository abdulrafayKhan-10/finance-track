import { describe, expect, it } from "vitest";
import { asAdmin, asAnon } from "./support/db";

/** Meta-tests: fail when a new table is added without the standard protections. */
describe("schema security", () => {
  it("enables and forces RLS on every public table", async () => {
    const { rows } = await asAdmin((q) =>
      q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
           and not (c.relrowsecurity and c.relforcerowsecurity)`),
    );
    expect(rows).toEqual([]);
  });

  it("puts the MFA restrictive policy on every user-owned table", async () => {
    const { rows } = await asAdmin((q) =>
      q(`select t.table_name from information_schema.columns t
         where t.table_schema = 'public' and t.column_name = 'user_id'
           and not exists (
             select 1 from pg_policies p
             where p.schemaname = 'public' and p.tablename = t.table_name
               and p.permissive = 'RESTRICTIVE' and p.qual like '%aal_ok%')`),
    );
    expect(rows).toEqual([]);
  });

  it("scopes every permissive policy on user-owned tables to auth.uid()", async () => {
    const { rows } = await asAdmin((q) =>
      q(`select p.tablename, p.policyname from pg_policies p
         where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
           and p.tablename <> 'currencies'
           and coalesce(p.qual, '') || coalesce(p.with_check, '') not like '%auth.uid()%'`),
    );
    expect(rows).toEqual([]);
  });

  it("gives the anon role no privileges on public tables or functions", async () => {
    const { rows } = await asAdmin((q) =>
      q(`select table_name, privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and grantee = 'anon'
         union all
         select routine_name, privilege_type from information_schema.role_routine_grants
         where routine_schema = 'public' and grantee in ('anon', 'PUBLIC')`),
    );
    expect(rows).toEqual([]);
  });

  it("rejects anonymous reads", async () => {
    await expect(asAnon((q) => q("select * from public.accounts"))).rejects.toThrow(/permission denied/);
    await expect(asAnon((q) => q("select * from public.currencies"))).rejects.toThrow(/permission denied/);
  });
});
