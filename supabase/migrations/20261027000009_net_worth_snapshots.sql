-- 0009: frozen net-worth snapshots and a plain read of ledger lines.

create table public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  as_of date not null check (as_of between '1900-01-01' and '2999-12-31'),
  base_currency char(3) not null references public.currencies (code),
  total_assets numeric(20, 4) not null,
  total_liabilities numeric(20, 4) not null,
  net_worth numeric(20, 4) not null,
  -- Version of the calculation (src/domain/networth) that produced it.
  method_version integer not null check (method_version > 0),
  -- Every input used: balances, rates and their dates, unconvertible items.
  details jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, as_of),
  check (net_worth = total_assets - total_liabilities)
);

create trigger net_worth_snapshots_audit after insert or delete on public.net_worth_snapshots
  for each row execute function app_private.audit_row();

alter table public.net_worth_snapshots enable row level security;
alter table public.net_worth_snapshots force row level security;
create policy net_worth_snapshots_mfa on public.net_worth_snapshots as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy net_worth_snapshots_select on public.net_worth_snapshots for select to authenticated using (user_id = (select auth.uid()));
create policy net_worth_snapshots_insert on public.net_worth_snapshots for insert to authenticated with check (user_id = (select auth.uid()));
create policy net_worth_snapshots_delete on public.net_worth_snapshots for delete to authenticated using (user_id = (select auth.uid()));
-- Snapshots are immutable: no update grant or policy.
revoke all on public.net_worth_snapshots from authenticated;
grant select, insert, delete on public.net_worth_snapshots to authenticated;

-- Every ledger line dated on or before p_to (and on or after p_from when
-- given), with its transaction's kind, date and status. Plain data for the
-- domain's reports; amounts as text.
create function public.ledger_lines(p_from date default null, p_to date default null)
returns table (transaction_id uuid, account_id uuid, amount text, category_id uuid,
               occurred_on date, status public.transaction_status, kind public.transaction_kind)
language sql stable security invoker set search_path = '' as $$
  select l.transaction_id, l.account_id, l.amount::text, l.category_id, t.occurred_on, t.status, t.kind
    from public.transaction_lines l
    join public.transactions t on t.id = l.transaction_id
   where (p_from is null or t.occurred_on >= p_from)
     and (p_to is null or t.occurred_on <= p_to)
   order by t.occurred_on, t.created_at, l.id
$$;
revoke all on function public.ledger_lines(date, date) from public, anon;
grant execute on function public.ledger_lines(date, date) to authenticated;
