-- 0004: append-only audit history for financial tables.

create table public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action public.audit_action not null,
  before jsonb,
  after jsonb,
  actor uuid default auth.uid(),
  occurred_at timestamptz not null default now(),
  -- Groups the rows written by one database transaction (e.g. one RPC call).
  txid bigint not null default txid_current()
);

create index audit_events_user_time_idx on public.audit_events (user_id, occurred_at desc);
create index audit_events_record_idx on public.audit_events (user_id, table_name, record_id);

create function app_private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_user_id uuid := (v_row ->> 'user_id')::uuid;
begin
  if tg_op = 'UPDATE' and to_jsonb(new) - 'updated_at' = to_jsonb(old) - 'updated_at' then
    return null;
  end if;
  -- Rows removed because the user themself is being deleted are not audited.
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = v_user_id) then
    return null;
  end if;

  insert into public.audit_events (user_id, table_name, record_id, action, before, after)
  values (
    v_user_id,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id')::uuid,
    lower(tg_op)::public.audit_action,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;
revoke all on function app_private.audit_row() from public;

create trigger profiles_audit after update on public.profiles
  for each row execute function app_private.audit_row();
create trigger accounts_audit after insert or update or delete on public.accounts
  for each row execute function app_private.audit_row();
create trigger categories_audit after update or delete on public.categories
  for each row execute function app_private.audit_row();
create trigger transactions_audit after insert or update or delete on public.transactions
  for each row execute function app_private.audit_row();
create trigger transaction_lines_audit after insert or update or delete on public.transaction_lines
  for each row execute function app_private.audit_row();

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
create policy audit_events_mfa on public.audit_events as restrictive for all to authenticated
  using ((select app_private.aal_ok()));
create policy audit_events_select on public.audit_events for select to authenticated
  using (user_id = (select auth.uid()));
-- Read-only to users: no insert, update or delete grants or policies.
revoke all on public.audit_events from authenticated;
grant select on public.audit_events to authenticated;
