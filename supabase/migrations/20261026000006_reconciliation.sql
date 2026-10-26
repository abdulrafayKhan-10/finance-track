-- 0006: account reconciliation against a statement, with auditable history.

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  statement_date date not null,
  -- Stored sign convention (a card statement owing 5,000 is -5000).
  statement_balance numeric(20, 4) not null,
  -- Cleared balance on the statement date before any adjustment was added.
  computed_cleared_balance numeric(20, 4) not null,
  difference numeric(20, 4) not null,
  adjustment_transaction_id uuid,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (adjustment_transaction_id, user_id) references public.transactions (id, user_id)
    on delete set null (adjustment_transaction_id)
);

create index reconciliations_account_idx on public.reconciliations (user_id, account_id, statement_date desc);

alter table public.transactions
  add constraint transactions_reconciliation_fk foreign key (reconciliation_id, user_id)
  references public.reconciliations (id, user_id) on delete set null (reconciliation_id);
create index transactions_reconciliation_idx on public.transactions (reconciliation_id)
  where reconciliation_id is not null;

alter table public.reconciliations enable row level security;
alter table public.reconciliations force row level security;
create policy reconciliations_mfa on public.reconciliations as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy reconciliations_select on public.reconciliations for select to authenticated
  using (user_id = (select auth.uid()));
-- Created only through reconcile_account; deleting one unlocks its transactions.
create policy reconciliations_delete on public.reconciliations for delete to authenticated
  using (user_id = (select auth.uid()));
create policy reconciliations_insert on public.reconciliations for insert to authenticated
  with check (user_id = (select auth.uid()));
revoke all on public.reconciliations from authenticated;
-- insert is needed by reconcile_account, which runs as the caller.
grant select, insert, delete on public.reconciliations to authenticated;

create trigger reconciliations_audit after insert or delete on public.reconciliations
  for each row execute function app_private.audit_row();

/*
 * p: {account_id, statement_date, statement_balance (stored sign, decimal string),
 *     clear_transaction_ids: uuid[], create_adjustment: bool, note?}
 * 1. Marks the listed transactions (on this account, dated ≤ statement date) cleared.
 * 2. Computes the cleared balance = opening + Σ cleared lines ≤ statement date
 *    (the same formula as domain accountBalance; a test checks they agree).
 * 3. If asked and the difference ≠ 0, posts a cleared adjustment for it.
 * 4. Records the reconciliation and locks the cleared transactions it covers.
 */
create function public.reconcile_account(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_account public.accounts;
  v_date date := (p ->> 'statement_date')::date;
  v_statement numeric := (p ->> 'statement_balance')::numeric;
  v_cleared numeric;
  v_difference numeric;
  v_adjustment uuid;
  v_id uuid;
  v_minor smallint;
begin
  select * into v_account from public.accounts where id = (p ->> 'account_id')::uuid for update;
  if not found then
    raise exception 'not_found' using errcode = 'FT404';
  end if;
  if v_date is null or v_date < v_account.opening_date then
    raise exception 'invalid_payload: statement date must be on or after the account opening date' using errcode = 'FT007';
  end if;
  select minor_units into v_minor from public.currencies where code = v_account.currency;
  if v_statement is null or scale(trim_scale(v_statement)) > v_minor then
    raise exception 'invalid_payload: statement balance is not a valid amount' using errcode = 'FT007';
  end if;

  update public.transactions t set status = 'cleared'
   where t.id in (select (jsonb_array_elements_text(coalesce(p -> 'clear_transaction_ids', '[]'::jsonb)))::uuid)
     and t.occurred_on <= v_date
     and t.status <> 'cleared'
     and exists (select 1 from public.transaction_lines l where l.transaction_id = t.id and l.account_id = v_account.id);

  select v_account.opening_balance + coalesce(sum(l.amount), 0) into v_cleared
    from public.transaction_lines l
    join public.transactions t on t.id = l.transaction_id
   where l.account_id = v_account.id and t.status = 'cleared' and t.occurred_on <= v_date;

  v_difference := v_statement - v_cleared;

  if v_difference <> 0 and coalesce((p ->> 'create_adjustment')::boolean, false) then
    v_adjustment := public.create_transaction(jsonb_build_object(
      'kind', 'adjustment',
      'occurred_on', v_date,
      'description', 'Reconciliation adjustment',
      'notes', coalesce(nullif(btrim(p ->> 'note'), ''), 'Difference between statement and cleared balance'),
      'status', 'cleared',
      'lines', jsonb_build_array(jsonb_build_object('account_id', v_account.id, 'amount', v_difference::text))
    ));
  end if;

  insert into public.reconciliations (account_id, statement_date, statement_balance, computed_cleared_balance,
                                      difference, adjustment_transaction_id, note)
  values (v_account.id, v_date, v_statement, v_cleared, v_difference, v_adjustment, nullif(btrim(p ->> 'note'), ''))
  returning id into v_id;

  update public.transactions t set reconciliation_id = v_id
   where t.reconciliation_id is null
     and t.status = 'cleared'
     and t.occurred_on <= v_date
     and exists (select 1 from public.transaction_lines l where l.transaction_id = t.id and l.account_id = v_account.id);

  return v_id;
end;
$$;

revoke all on function public.reconcile_account(jsonb) from public, anon;
grant execute on function public.reconcile_account(jsonb) to authenticated;
