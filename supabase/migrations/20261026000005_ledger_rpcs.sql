-- 0005: transactional write functions for the ledger, plus read helpers.
-- All are SECURITY INVOKER, so RLS still applies to every row they touch.
-- Error codes (mapped to safe messages in src/lib/errors.ts):
--   FT001 transaction_shape_invalid   FT004 account_archived
--   FT005 edit_conflict               FT006 reconciled_locked
--   FT007 invalid_payload             FT404 not_found

-- Lines payload: [{account_id, amount (decimal string), category_id?, memo?}, ...]
create function app_private.insert_lines(p_transaction_id uuid, p_lines jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  v_line jsonb;
  v_amount numeric;
  v_minor smallint;
begin
  perform app_private.assert_lines_payload(p_lines);
  for v_line in select value from jsonb_array_elements(p_lines) loop
    begin
      v_amount := (v_line ->> 'amount')::numeric;
    exception when others then
      raise exception 'invalid_payload: amount is not a number' using errcode = 'FT007';
    end;
    select c.minor_units into v_minor
      from public.accounts a join public.currencies c on c.code = a.currency
     where a.id = (v_line ->> 'account_id')::uuid;
    -- Never let numeric(20,4) silently round user input.
    if v_minor is not null and scale(trim_scale(v_amount)) > v_minor then
      raise exception 'transaction_shape_invalid: amount has more decimals than the currency allows'
        using errcode = 'FT001';
    end if;
    insert into public.transaction_lines (transaction_id, account_id, amount, category_id, memo)
    values (
      p_transaction_id,
      (v_line ->> 'account_id')::uuid,
      v_amount,
      nullif(v_line ->> 'category_id', '')::uuid,
      nullif(btrim(v_line ->> 'memo'), '')
    );
  end loop;
end;
$$;

create function app_private.assert_lines_payload(p_lines jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 50
     or exists (select 1 from jsonb_array_elements(p_lines) l where jsonb_typeof(l) <> 'object') then
    raise exception 'invalid_payload: lines must be an array of at most 50 objects' using errcode = 'FT007';
  end if;
end;
$$;

-- New postings may not go to archived accounts. `p_existing` lists accounts the
-- transaction already used, which stay allowed so old records remain editable.
create function app_private.assert_accounts_usable(p_lines jsonb, p_existing uuid[]) returns void
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1
      from jsonb_array_elements(p_lines) l
      join public.accounts a on a.id = (l ->> 'account_id')::uuid
     where a.status = 'archived'
       and not (a.id = any (coalesce(p_existing, '{}')))
  ) then
    raise exception 'account_archived: archived accounts cannot receive new transactions' using errcode = 'FT004';
  end if;
end;
$$;

create function app_private.tags_from(p jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(select distinct btrim(t) from jsonb_array_elements_text(p) t where btrim(t) <> '' order by 1), '{}')
$$;

create function public.create_transaction(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  perform app_private.assert_lines_payload(p -> 'lines');
  perform app_private.assert_accounts_usable(p -> 'lines', null);

  insert into public.transactions (kind, occurred_on, description, payee, notes, tags, status, refund_of_id)
  values (
    (p ->> 'kind')::public.transaction_kind,
    (p ->> 'occurred_on')::date,
    coalesce(btrim(p ->> 'description'), ''),
    nullif(btrim(p ->> 'payee'), ''),
    nullif(btrim(p ->> 'notes'), ''),
    app_private.tags_from(p -> 'tags'),
    coalesce((p ->> 'status')::public.transaction_status, 'cleared'),
    nullif(p ->> 'refund_of_id', '')::uuid
  )
  returning id into v_id;

  perform app_private.insert_lines(v_id, p -> 'lines');
  -- Run the deferred shape checks now so the caller gets the error from this call.
  set constraints public.transactions_shape, public.transaction_lines_shape immediate;
  return v_id;
end;
$$;

-- Replaces header and lines atomically. `p_expected_updated_at` guards against
-- overwriting a change made on another device in the meantime.
create function public.update_transaction(
  p_id uuid,
  p jsonb,
  p_expected_updated_at timestamptz,
  p_unlock boolean default false
) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  v_tx public.transactions;
  v_existing uuid[];
  v_updated_at timestamptz;
begin
  select * into v_tx from public.transactions where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FT404';
  end if;
  if v_tx.updated_at <> p_expected_updated_at then
    raise exception 'edit_conflict: the transaction changed since it was loaded' using errcode = 'FT005';
  end if;
  if v_tx.reconciliation_id is not null and not coalesce(p_unlock, false) then
    raise exception 'reconciled_locked: unlock the reconciled transaction to edit it' using errcode = 'FT006';
  end if;

  perform app_private.assert_lines_payload(p -> 'lines');
  select array_agg(account_id) into v_existing from public.transaction_lines where transaction_id = p_id;
  perform app_private.assert_accounts_usable(p -> 'lines', v_existing);

  update public.transactions set
    kind = (p ->> 'kind')::public.transaction_kind,
    occurred_on = (p ->> 'occurred_on')::date,
    description = coalesce(btrim(p ->> 'description'), ''),
    payee = nullif(btrim(p ->> 'payee'), ''),
    notes = nullif(btrim(p ->> 'notes'), ''),
    tags = app_private.tags_from(p -> 'tags'),
    status = coalesce((p ->> 'status')::public.transaction_status, 'cleared'),
    refund_of_id = nullif(p ->> 'refund_of_id', '')::uuid,
    reconciliation_id = null
  where id = p_id
  returning updated_at into v_updated_at;

  delete from public.transaction_lines where transaction_id = p_id;
  perform app_private.insert_lines(p_id, p -> 'lines');
  set constraints public.transactions_shape, public.transaction_lines_shape immediate;
  return v_updated_at;
end;
$$;

create function public.delete_transaction(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_unlock boolean default false
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_tx public.transactions;
begin
  select * into v_tx from public.transactions where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FT404';
  end if;
  if v_tx.updated_at <> p_expected_updated_at then
    raise exception 'edit_conflict: the transaction changed since it was loaded' using errcode = 'FT005';
  end if;
  if v_tx.reconciliation_id is not null and not coalesce(p_unlock, false) then
    raise exception 'reconciled_locked: unlock the reconciled transaction to delete it' using errcode = 'FT006';
  end if;
  delete from public.transactions where id = p_id;
end;
$$;

-- Read helpers -----------------------------------------------------------------

-- Plain sums of line amounts per account and status (no policy: the domain
-- adds opening balances and decides what the numbers mean).
create function public.account_line_totals(p_as_of date default null)
returns table (account_id uuid, status public.transaction_status, total text, line_count bigint, last_on date)
language sql stable security invoker set search_path = '' as $$
  select l.account_id, t.status, sum(l.amount)::text, count(*), max(t.occurred_on)
    from public.transaction_lines l
    join public.transactions t on t.id = l.transaction_id
   where p_as_of is null or t.occurred_on <= p_as_of
   group by l.account_id, t.status
$$;

-- Filtered, keyset-paginated transaction list with lines. Amounts and
-- timestamps are returned as text so no precision is lost in JSON.
-- Filter keys: id, account_id, category_id (includes subcategories), kinds[],
-- status, from, to, tag, q, order ('desc'|'asc'), cursor {occurred_on, created_at, id}.
create function public.list_transactions(p_filter jsonb default '{}', p_limit int default 50)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_f jsonb := coalesce(p_filter, '{}');
  v_asc boolean := coalesce(v_f ->> 'order', 'desc') = 'asc';
  v_q text := nullif(btrim(v_f ->> 'q'), '');
  v_pattern text;
  v_c_date date := (v_f -> 'cursor' ->> 'occurred_on')::date;
  v_c_created timestamptz := (v_f -> 'cursor' ->> 'created_at')::timestamptz;
  v_c_id uuid := (v_f -> 'cursor' ->> 'id')::uuid;
  v_rows jsonb;
  v_has_more boolean;
begin
  if v_q is not null then
    v_pattern := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with page as (
    select t.*
      from public.transactions t
     where (v_f ->> 'id' is null or t.id = (v_f ->> 'id')::uuid)
       and (v_f ->> 'account_id' is null or exists (
             select 1 from public.transaction_lines l
              where l.transaction_id = t.id and l.account_id = (v_f ->> 'account_id')::uuid))
       and (v_f ->> 'category_id' is null or exists (
             select 1 from public.transaction_lines l join public.categories c on c.id = l.category_id
              where l.transaction_id = t.id
                and (c.id = (v_f ->> 'category_id')::uuid or c.parent_id = (v_f ->> 'category_id')::uuid)))
       and (v_f -> 'kinds' is null or t.kind::text in (select jsonb_array_elements_text(v_f -> 'kinds')))
       and (v_f ->> 'status' is null or t.status::text = v_f ->> 'status')
       and (v_f ->> 'from' is null or t.occurred_on >= (v_f ->> 'from')::date)
       and (v_f ->> 'to' is null or t.occurred_on <= (v_f ->> 'to')::date)
       and (v_f ->> 'tag' is null or t.tags @> array[v_f ->> 'tag'])
       and (v_pattern is null or t.description ilike v_pattern or t.payee ilike v_pattern or t.notes ilike v_pattern)
       and (v_c_id is null
            or (v_asc and (t.occurred_on, t.created_at, t.id) > (v_c_date, v_c_created, v_c_id))
            or (not v_asc and (t.occurred_on, t.created_at, t.id) < (v_c_date, v_c_created, v_c_id)))
     order by
       case when v_asc then t.occurred_on end asc,
       case when v_asc then t.created_at end asc,
       case when v_asc then t.id end asc,
       t.occurred_on desc, t.created_at desc, t.id desc
     limit v_limit + 1
  ), numbered as (
    select p.*, row_number() over () as rn from page p
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'kind', n.kind,
      'occurred_on', n.occurred_on,
      'description', n.description,
      'payee', n.payee,
      'notes', n.notes,
      'tags', to_jsonb(n.tags),
      'status', n.status,
      'refund_of_id', n.refund_of_id,
      'reconciliation_id', n.reconciliation_id,
      'created_at', n.created_at::text,
      'updated_at', n.updated_at::text,
      'lines', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', l.id, 'account_id', l.account_id, 'amount', l.amount::text,
          'category_id', l.category_id, 'memo', l.memo) order by l.created_at, l.id), '[]'::jsonb)
          from public.transaction_lines l where l.transaction_id = n.id)
    ) order by n.rn) filter (where n.rn <= v_limit), '[]'::jsonb),
    count(*) > v_limit
    into v_rows, v_has_more
    from numbered n;

  return jsonb_build_object('items', v_rows, 'has_more', v_has_more);
end;
$$;

-- Lines per category, so the UI can tell which categories are safe to delete.
create function public.category_usage()
returns table (category_id uuid, line_count bigint)
language sql stable security invoker set search_path = '' as $$
  select l.category_id, count(*) from public.transaction_lines l
   where l.category_id is not null group by l.category_id
$$;

-- All postings for one account in ledger order, for running balances.
create function public.account_postings(p_account_id uuid)
returns table (transaction_id uuid, occurred_on date, created_at text, kind public.transaction_kind,
               status public.transaction_status, description text, payee text, amount text, category_id uuid,
               reconciliation_id uuid, other_account_id uuid)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.occurred_on, t.created_at::text, t.kind, t.status, t.description, t.payee,
         l.amount::text, l.category_id, t.reconciliation_id,
         (select o.account_id from public.transaction_lines o
           where o.transaction_id = t.id and o.account_id <> l.account_id limit 1)
    from public.transaction_lines l
    join public.transactions t on t.id = l.transaction_id
   where l.account_id = p_account_id
   order by t.occurred_on, t.created_at, t.id, l.id
$$;

-- History of one transaction: one row per database transaction (save) that
-- touched its header or lines. An amount-only edit changes lines, not the header.
create index audit_events_line_tx_idx on public.audit_events
  ((coalesce(after ->> 'transaction_id', before ->> 'transaction_id')))
  where table_name = 'transaction_lines';

create function public.transaction_history(p_id uuid)
returns table (txid bigint, occurred_at text, header_actions text[])
language sql stable security invoker set search_path = '' as $$
  select e.txid, min(e.occurred_at)::text,
         coalesce(array_agg(distinct e.action::text) filter (where e.table_name = 'transactions'), '{}')
    from public.audit_events e
   where (e.table_name = 'transactions' and e.record_id = p_id)
      or (e.table_name = 'transaction_lines'
          and coalesce(e.after ->> 'transaction_id', e.before ->> 'transaction_id') = p_id::text)
   group by e.txid
   order by min(e.id) desc
   limit 200
$$;

-- Categories ---------------------------------------------------------------

-- Moves every line from one category into another of the same kind and
-- deletes the source. Subcategories must be moved or merged first.
create function public.merge_category(p_from uuid, p_into uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_from public.categories;
  v_into public.categories;
begin
  select * into v_from from public.categories where id = p_from for update;
  select * into v_into from public.categories where id = p_into for update;
  if v_from.id is null or v_into.id is null then
    raise exception 'not_found' using errcode = 'FT404';
  end if;
  if v_from.id = v_into.id or v_from.kind <> v_into.kind then
    raise exception 'invalid_payload: merge into a different category of the same kind' using errcode = 'FT007';
  end if;
  if v_from.system_key is not null then
    raise exception 'invalid_payload: system categories cannot be merged away' using errcode = 'FT007';
  end if;
  if exists (select 1 from public.categories c where c.parent_id = v_from.id) then
    raise exception 'invalid_payload: move or merge its subcategories first' using errcode = 'FT007';
  end if;
  update public.transaction_lines set category_id = v_into.id where category_id = v_from.id;
  delete from public.categories where id = v_from.id;
end;
$$;

-- Grants ------------------------------------------------------------------------

revoke all on function public.create_transaction(jsonb) from public, anon;
revoke all on function public.update_transaction(uuid, jsonb, timestamptz, boolean) from public, anon;
revoke all on function public.delete_transaction(uuid, timestamptz, boolean) from public, anon;
revoke all on function public.account_line_totals(date) from public, anon;
revoke all on function public.list_transactions(jsonb, int) from public, anon;
revoke all on function public.account_postings(uuid) from public, anon;
revoke all on function public.merge_category(uuid, uuid) from public, anon;
revoke all on function public.category_usage() from public, anon;
revoke all on function public.transaction_history(uuid) from public, anon;
grant execute on function public.create_transaction(jsonb) to authenticated;
grant execute on function public.update_transaction(uuid, jsonb, timestamptz, boolean) to authenticated;
grant execute on function public.delete_transaction(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.account_line_totals(date) to authenticated;
grant execute on function public.list_transactions(jsonb, int) to authenticated;
grant execute on function public.account_postings(uuid) to authenticated;
grant execute on function public.merge_category(uuid, uuid) to authenticated;
grant execute on function public.category_usage() to authenticated;
grant execute on function public.transaction_history(uuid) to authenticated;
