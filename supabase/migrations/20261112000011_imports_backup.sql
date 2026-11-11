-- 0011: CSV import batches (all-or-nothing, undoable), full restore of a JSON
-- backup into an empty account, and deleting all of the user's data.
-- New error code: FT010 import_rejected (rows failed; nothing was saved).

create type public.import_kind as enum ('transactions_csv', 'backup_restore');

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.import_kind not null,
  file_name text check (char_length(file_name) <= 200),
  row_count integer not null check (row_count >= 0),
  -- Plain counts and the target account; never row contents.
  summary jsonb not null default '{}' check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) < 4096),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create index import_batches_user_idx on public.import_batches (user_id, created_at desc);

-- Undoing a batch removes its transactions (and their lines) with it.
alter table public.transactions
  add constraint transactions_import_batch_fk foreign key (import_batch_id, user_id)
  references public.import_batches (id, user_id) on delete cascade;
create index transactions_import_batch_idx on public.transactions (import_batch_id) where import_batch_id is not null;

create trigger import_batches_audit after insert or delete on public.import_batches
  for each row execute function app_private.audit_row();

alter table public.import_batches enable row level security;
alter table public.import_batches force row level security;
create policy import_batches_mfa on public.import_batches as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy import_batches_select on public.import_batches for select to authenticated
  using (user_id = (select auth.uid()));
create policy import_batches_insert on public.import_batches for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy import_batches_delete on public.import_batches for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.import_batches from authenticated;
grant select, insert, delete on public.import_batches to authenticated;

/*
 * p: {file_name, summary, rows: [transaction payload + import_fingerprint]}
 * Every row goes through create_transaction (same validation as the form).
 * Failures are collected per row; if any row fails, nothing is saved and the
 * call raises FT010 with DETAIL = [{row, code}] (row is 1-based in `rows`).
 */
create function public.import_transactions(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_rows jsonb := p -> 'rows';
  v_batch uuid;
  v_row jsonb;
  v_i int := 0;
  v_id uuid;
  v_errors jsonb := '[]'::jsonb;
begin
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' or jsonb_array_length(v_rows) = 0
     or jsonb_array_length(v_rows) > 5000 then
    raise exception 'invalid_payload: an import needs 1 to 5000 rows' using errcode = 'FT007';
  end if;

  insert into public.import_batches (kind, file_name, row_count, summary)
  values ('transactions_csv', left(nullif(btrim(p ->> 'file_name'), ''), 200), jsonb_array_length(v_rows),
          coalesce(p -> 'summary', '{}'::jsonb))
  returning id into v_batch;

  for v_row in select value from jsonb_array_elements(v_rows) loop
    v_i := v_i + 1;
    begin
      -- create_transaction leaves these checks immediate; a header written before its lines needs them deferred.
      set constraints public.transactions_shape, public.transaction_lines_shape, public.holding_movements_shape deferred;
      if v_row ->> 'kind' not in ('income', 'expense', 'refund', 'transfer', 'adjustment') then
        raise exception 'invalid_payload: imports create cash transactions only' using errcode = 'FT007';
      end if;
      v_id := public.create_transaction(v_row);
      update public.transactions
         set import_batch_id = v_batch,
             import_fingerprint = left(nullif(v_row ->> 'import_fingerprint', ''), 128)
       where id = v_id;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_i, 'code', sqlstate);
    end;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    raise exception 'import_rejected: % row(s) failed; nothing was saved', jsonb_array_length(v_errors)
      using errcode = 'FT010', detail = left(v_errors::text, 20000);
  end if;
  return v_batch;
end;
$$;

-- Removes a whole import. Reconciled transactions block it unless unlocked.
create function public.undo_import(p_batch_id uuid, p_unlock boolean default false) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_count int;
begin
  if not exists (select 1 from public.import_batches b where b.id = p_batch_id) then
    raise exception 'not_found' using errcode = 'FT404';
  end if;
  if not coalesce(p_unlock, false) and exists (
    select 1 from public.transactions t where t.import_batch_id = p_batch_id and t.reconciliation_id is not null
  ) then
    raise exception 'reconciled_locked: some imported transactions are reconciled' using errcode = 'FT006';
  end if;
  select count(*) into v_count from public.transactions t where t.import_batch_id = p_batch_id;
  delete from public.import_batches where id = p_batch_id;
  set constraints all immediate;
  return v_count;
end;
$$;

-- Restore -------------------------------------------------------------------------

-- True when the user has no financial records (categories that were never used don't count).
create function app_private.is_account_empty() returns boolean
language sql stable set search_path = '' as $$
  select not exists (select 1 from public.accounts)
     and not exists (select 1 from public.transactions)
     and not exists (select 1 from public.assets)
     and not exists (select 1 from public.budgets)
     and not exists (select 1 from public.savings_goals)
     and not exists (select 1 from public.exchange_rates)
     and not exists (select 1 from public.net_worth_snapshots)
     and not exists (select 1 from public.import_batches)
$$;

/*
 * p: the `data` object of a finance-track backup (format version 1): arrays of
 * rows keyed by table name, numbers as text. Restores into an EMPTY account in
 * one transaction, keeping every id so all links survive. user_id always comes
 * from the session, never from the file. System categories are matched by
 * their system_key and every reference to them is remapped.
 */
create function public.restore_backup(p jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_data jsonb := p;
  v_cat record;
  v_existing uuid;
  v_counts jsonb;
begin
  if jsonb_typeof(v_data) <> 'object' then
    raise exception 'invalid_payload: not a backup' using errcode = 'FT007';
  end if;
  if not app_private.is_account_empty() then
    raise exception 'invalid_payload: restore needs an empty account; delete your data first' using errcode = 'FT007';
  end if;

  -- Point references to system categories at this account's own ones (ids are UUIDs, so a text replace is exact).
  for v_cat in
    select c ->> 'id' as id, c ->> 'system_key' as system_key
      from jsonb_array_elements(coalesce(v_data -> 'categories', '[]')) c
     where c ->> 'system_key' is not null
  loop
    select id into v_existing from public.categories where system_key = v_cat.system_key;
    if v_existing is not null and v_existing::text <> v_cat.id then
      v_data := replace(v_data::text, v_cat.id, v_existing::text)::jsonb;
    end if;
  end loop;

  -- Unused categories of the empty account make way for the backup's.
  update public.categories set parent_id = null where system_key is not null and parent_id is not null;
  delete from public.categories where system_key is null and parent_id is not null;
  delete from public.categories where system_key is null;

  if v_data ? 'profile' and jsonb_typeof(v_data -> 'profile') = 'object' then
    update public.profiles set
      display_name = v_data -> 'profile' ->> 'display_name',
      base_currency = coalesce(v_data -> 'profile' ->> 'base_currency', base_currency),
      timezone = coalesce(v_data -> 'profile' ->> 'timezone', timezone),
      theme = coalesce((v_data -> 'profile' ->> 'theme')::public.theme_preference, theme)
    where user_id = auth.uid();
  end if;

  -- System categories keep their ids; take the backup's name and archive flag.
  update public.categories c set name = b.name, is_archived = b.is_archived, color = b.color, icon = b.icon
    from jsonb_populate_recordset(null::public.categories, coalesce(v_data -> 'categories', '[]')) b
   where b.system_key is not null and c.id = b.id;

  insert into public.categories (id, name, kind, parent_id, color, icon, is_archived, created_at, updated_at)
  select id, name, kind, parent_id, color, icon, coalesce(is_archived, false),
         coalesce(created_at, now()), coalesce(updated_at, now())
    from jsonb_populate_recordset(null::public.categories, coalesce(v_data -> 'categories', '[]'))
   where system_key is null
   order by parent_id nulls first, created_at;

  insert into public.accounts (id, name, type, currency, opening_balance, opening_date, institution, notes, status,
                               include_in_net_worth, is_liquid, created_at, updated_at)
  select id, name, type, currency, coalesce(opening_balance, 0), opening_date, institution, notes,
         coalesce(status, 'active'), coalesce(include_in_net_worth, true), is_liquid,
         coalesce(created_at, now()), coalesce(updated_at, now())
    from jsonb_populate_recordset(null::public.accounts, coalesce(v_data -> 'accounts', '[]'));

  insert into public.assets (id, name, symbol, category, currency, quantity_scale, unit_label, valuation_mode,
                             details, status, notes, created_at, updated_at)
  select id, name, symbol, category, currency, quantity_scale, unit_label, valuation_mode,
         coalesce(details, '{}'), status, notes, created_at, updated_at
    from jsonb_populate_recordset(null::public.assets, coalesce(v_data -> 'assets', '[]'));

  insert into public.exchange_rates (id, base, quote, rate, effective_on, source_note, created_at, updated_at)
  select id, base, quote, rate, effective_on, source_note, created_at, updated_at
    from jsonb_populate_recordset(null::public.exchange_rates, coalesce(v_data -> 'exchange_rates', '[]'));

  insert into public.import_batches (id, kind, file_name, row_count, summary, created_at)
  select id, kind, file_name, row_count, coalesce(summary, '{}'), created_at
    from jsonb_populate_recordset(null::public.import_batches, coalesce(v_data -> 'import_batches', '[]'));

  -- Links to other transactions and to reconciliations are set once those rows exist.
  insert into public.transactions (id, kind, occurred_on, description, payee, notes, tags, status, asset_id,
                                   import_batch_id, import_fingerprint, created_at, updated_at)
  select id, kind, occurred_on, coalesce(description, ''), payee, notes, coalesce(tags, '{}'),
         coalesce(status, 'cleared'), asset_id,
         import_batch_id, import_fingerprint, coalesce(created_at, now()), coalesce(updated_at, now())
    from jsonb_populate_recordset(null::public.transactions, coalesce(v_data -> 'transactions', '[]'));

  insert into public.transaction_lines (id, transaction_id, account_id, amount, category_id, memo, created_at)
  select id, transaction_id, account_id, amount, category_id, memo, coalesce(created_at, now())
    from jsonb_populate_recordset(null::public.transaction_lines, coalesce(v_data -> 'transaction_lines', '[]'));

  insert into public.holding_movements (id, transaction_id, account_id, asset_id, quantity, unit_price, fee,
                                        cost_amount, created_at)
  select id, transaction_id, account_id, asset_id, quantity, unit_price, fee, cost_amount, created_at
    from jsonb_populate_recordset(null::public.holding_movements, coalesce(v_data -> 'holding_movements', '[]'));

  insert into public.reconciliations (id, account_id, statement_date, statement_balance, computed_cleared_balance,
                                      difference, adjustment_transaction_id, note, created_at)
  select id, account_id, statement_date, statement_balance, computed_cleared_balance,
         difference, adjustment_transaction_id, note, created_at
    from jsonb_populate_recordset(null::public.reconciliations, coalesce(v_data -> 'reconciliations', '[]'));

  update public.transactions t set refund_of_id = b.refund_of_id, reconciliation_id = b.reconciliation_id
    from jsonb_populate_recordset(null::public.transactions, coalesce(v_data -> 'transactions', '[]')) b
   where t.id = b.id and (b.refund_of_id is not null or b.reconciliation_id is not null);

  insert into public.asset_valuations (id, asset_id, valued_on, unit_price, entered_as, entered_total,
                                       quantity_at_entry, source, source_note, created_at, updated_at)
  select id, asset_id, valued_on, unit_price, entered_as, entered_total,
         quantity_at_entry, source, source_note, created_at, updated_at
    from jsonb_populate_recordset(null::public.asset_valuations, coalesce(v_data -> 'asset_valuations', '[]'));

  insert into public.budgets (id, month, category_id, amount, currency, created_at, updated_at)
  select id, month, category_id, amount, currency, created_at, updated_at
    from jsonb_populate_recordset(null::public.budgets, coalesce(v_data -> 'budgets', '[]'));

  insert into public.savings_goals (id, name, description, target_amount, currency, target_date, funding_mode,
                                    linked_account_id, status, completed_on, created_at, updated_at)
  select id, name, description, target_amount, currency, target_date, funding_mode,
         linked_account_id, status, completed_on, created_at, updated_at
    from jsonb_populate_recordset(null::public.savings_goals, coalesce(v_data -> 'savings_goals', '[]'));

  insert into public.goal_allocations (id, goal_id, allocated_on, amount, source_account_id, note, created_at)
  select id, goal_id, allocated_on, amount, source_account_id, note, created_at
    from jsonb_populate_recordset(null::public.goal_allocations, coalesce(v_data -> 'goal_allocations', '[]'));

  insert into public.net_worth_snapshots (id, as_of, base_currency, total_assets, total_liabilities, net_worth,
                                          method_version, details, created_at)
  select id, as_of, base_currency, total_assets, total_liabilities, net_worth, method_version, details, created_at
    from jsonb_populate_recordset(null::public.net_worth_snapshots, coalesce(v_data -> 'net_worth_snapshots', '[]'));

  -- Every deferred invariant (shapes, positions, allocation totals) is checked here, so a bad file fails this call.
  set constraints all immediate;

  select jsonb_build_object(
    'accounts', (select count(*) from public.accounts),
    'transactions', (select count(*) from public.transactions),
    'assets', (select count(*) from public.assets),
    'valuations', (select count(*) from public.asset_valuations)
  ) into v_counts;
  return v_counts;
end;
$$;

-- Deletes every financial record of the caller, keeping the login, the profile
-- and the system categories. The audit history remains (it is append-only).
create function public.delete_my_data() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.goal_allocations;
  delete from public.savings_goals;
  delete from public.budgets;
  delete from public.net_worth_snapshots;
  delete from public.asset_valuations;
  update public.transactions set refund_of_id = null, reconciliation_id = null
   where refund_of_id is not null or reconciliation_id is not null;
  delete from public.reconciliations;
  delete from public.transactions;
  delete from public.import_batches;
  delete from public.assets;
  delete from public.accounts;
  delete from public.exchange_rates;
  -- A system category moved under a user category must come back to the top level first.
  update public.categories set parent_id = null where system_key is not null and parent_id is not null;
  delete from public.categories where system_key is null and parent_id is not null;
  delete from public.categories where system_key is null;
  set constraints all immediate;
end;
$$;

revoke all on function public.import_transactions(jsonb) from public, anon;
revoke all on function public.undo_import(uuid, boolean) from public, anon;
revoke all on function public.restore_backup(jsonb) from public, anon;
revoke all on function public.delete_my_data() from public, anon;
revoke all on function app_private.is_account_empty() from public;
grant execute on function app_private.is_account_empty() to authenticated;
grant execute on function public.import_transactions(jsonb) to authenticated;
grant execute on function public.undo_import(uuid, boolean) to authenticated;
grant execute on function public.restore_backup(jsonb) to authenticated;
grant execute on function public.delete_my_data() to authenticated;
