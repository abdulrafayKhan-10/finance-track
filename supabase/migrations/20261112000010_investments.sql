-- 0010: investments. Assets, dated manual valuations, holding movements, the
-- position invariant, and the investment branches of the ledger RPCs.
-- Rules: docs/04-accounting-rules.md §4.7 (weighted-average cost) and §4.8.
-- New error codes: FT008 position_negative (sells more than is held),
--                  FT009 asset_archived (new activity on an archived asset).

create type public.asset_category as enum (
  'stock_etf', 'fund', 'gold', 'crypto', 'fixed_income', 'cash_like', 'custom'
);
create type public.valuation_mode as enum ('manual', 'par');
create type public.asset_status as enum ('active', 'archived');
create type public.valuation_entry as enum ('unit_price', 'total_value');
create type public.valuation_source as enum ('manual', 'import', 'provider');

-- Assets ------------------------------------------------------------------------

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  symbol text check (char_length(symbol) <= 30),
  category public.asset_category not null,
  -- Pricing currency: cost basis, valuations and gains are in this currency.
  currency char(3) not null references public.currencies (code),
  -- Decimal places a quantity may have (shares 0, gold 4, crypto 8...).
  quantity_scale smallint not null default 4 check (quantity_scale between 0 and 10),
  unit_label text not null default 'units' check (char_length(btrim(unit_label)) between 1 and 20),
  valuation_mode public.valuation_mode not null default 'manual',
  -- Category-specific fields (karat, maturity date, coupon, ISIN...), validated by the app.
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 4096),
  -- Hook for a future price provider; only manual valuations exist in v1.
  price_source text not null default 'manual' check (price_source = 'manual'),
  status public.asset_status not null default 'active',
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id),
  -- Par value (1 per unit) only makes sense for deposits, bonds and cash-like holdings.
  check (valuation_mode = 'manual' or category in ('fixed_income', 'cash_like'))
);

create trigger assets_updated_at before update on public.assets
  for each row execute function app_private.set_updated_at();

-- Valuations ----------------------------------------------------------------------

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id uuid not null,
  valued_on date not null check (valued_on between '1900-01-01' and '2999-12-31'),
  -- In the asset's currency. A total value entered by the user is divided by the
  -- quantity held on valued_on; the original input is kept below.
  unit_price numeric(28, 10) not null check (unit_price >= 0),
  entered_as public.valuation_entry not null default 'unit_price',
  entered_total numeric(20, 4) check (entered_total >= 0 and entered_total < 1e15),
  quantity_at_entry numeric(28, 10) check (quantity_at_entry > 0),
  source public.valuation_source not null default 'manual',
  source_note text check (char_length(source_note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (asset_id, user_id) references public.assets (id, user_id) on delete cascade,
  unique (asset_id, valued_on, source),
  check ((entered_as = 'unit_price') = (entered_total is null and quantity_at_entry is null))
);

create index asset_valuations_lookup_idx on public.asset_valuations (user_id, asset_id, valued_on desc);

create trigger asset_valuations_updated_at before update on public.asset_valuations
  for each row execute function app_private.set_updated_at();

-- Holding movements -----------------------------------------------------------------

create table public.holding_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  -- Must be an investment-type account (checked by the shape trigger).
  account_id uuid not null,
  asset_id uuid not null,
  -- Signed: + into the position, − out of it. In the asset's units.
  quantity numeric(28, 10) not null check (quantity <> 0),
  -- Asset currency; required for buy and sell.
  unit_price numeric(28, 10) check (unit_price >= 0),
  fee numeric(20, 4) not null default 0 check (fee >= 0 and fee < 1e15),
  -- Only for opening_holding: the cost basis brought in.
  cost_amount numeric(20, 4) check (cost_amount >= 0 and cost_amount < 1e15),
  created_at timestamptz not null default now(),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (asset_id, user_id) references public.assets (id, user_id)
);

create index holding_movements_position_idx on public.holding_movements (user_id, account_id, asset_id);
create index holding_movements_transaction_idx on public.holding_movements (transaction_id);
create index holding_movements_asset_idx on public.holding_movements (asset_id);

-- transactions.asset_id: the asset an investment transaction is about.
alter table public.transactions
  add constraint transactions_asset_fk foreign key (asset_id, user_id)
  references public.assets (id, user_id);
alter table public.transactions
  add constraint transactions_asset_kind_check
  check (asset_id is null or kind in ('opening_holding', 'buy', 'sell', 'dividend', 'interest', 'investment_fee', 'split'));
create index transactions_asset_idx on public.transactions (asset_id) where asset_id is not null;

-- Guards -----------------------------------------------------------------------------

-- Currency and precision are fixed once an asset has history.
create function app_private.assets_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.currency <> old.currency and (
       exists (select 1 from public.holding_movements m where m.asset_id = new.id)
       or exists (select 1 from public.asset_valuations v where v.asset_id = new.id)
       or exists (select 1 from public.transactions t where t.asset_id = new.id)) then
    raise exception 'account_locked_field: an asset''s currency is fixed once it has transactions or valuations'
      using errcode = 'FT002';
  end if;
  if new.quantity_scale < old.quantity_scale and exists (
       select 1 from public.holding_movements m
        where m.asset_id = new.id and scale(trim_scale(m.quantity)) > new.quantity_scale) then
    raise exception 'account_locked_field: existing quantities use more decimal places'
      using errcode = 'FT002';
  end if;
  return new;
end;
$$;

create trigger assets_guard before update on public.assets
  for each row execute function app_private.assets_guard();

-- An investment account that holds positions can't become another type.
create function app_private.accounts_investment_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.type = 'investment' and new.type <> 'investment'
     and exists (select 1 from public.holding_movements m where m.account_id = new.id) then
    raise exception 'account_locked_field: this account holds investments, so it must stay an investment account'
      using errcode = 'FT002';
  end if;
  return new;
end;
$$;

create trigger accounts_investment_guard before update on public.accounts
  for each row execute function app_private.accounts_investment_guard();

-- Position invariant: the running quantity of (account, asset), in ledger order
-- (occurred_on, created_at, id), never goes below zero (ACC-WAC-4). Checks the
-- whole history, so an edit to an early buy that breaks a later sell is caught.
create function app_private.assert_position(p_account_id uuid, p_asset_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from (
      select sum(m.quantity) over (order by t.occurred_on, t.created_at, t.id, m.id rows unbounded preceding) as running
        from public.holding_movements m
        join public.transactions t on t.id = m.transaction_id
       where m.account_id = p_account_id and m.asset_id = p_asset_id
    ) s where s.running < 0
  ) then
    raise exception 'position_negative: this would sell or remove more than the account holds at that date'
      using errcode = 'FT008';
  end if;
end;
$$;

-- Shape invariant (replaces 0003) --------------------------------------------------

create or replace function app_private.assert_transaction_shape(p_transaction_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_tx public.transactions;
  v_lines int;
  v_accounts int;
  v_pos int;
  v_neg int;
  v_with_category int;
  v_income_categories int;
  v_expense_categories int;
  v_currencies int;
  v_sum numeric;
  v_before_opening int;
  v_liability_lines int;
  v_moves int;
  v_move_in int;
  v_move_out int;
  v_move_accounts int;
  v_move_priced int;
  v_move_costed int;
  v_move_fee int;
  v_move_other_asset int;
  v_move_non_investment int;
  v_move_before_opening int;
  v_position record;
begin
  select * into v_tx from public.transactions where id = p_transaction_id;
  if not found then
    return; -- deleted in this database transaction
  end if;

  select count(*),
         count(distinct l.account_id),
         count(*) filter (where l.amount > 0),
         count(*) filter (where l.amount < 0),
         count(l.category_id),
         count(*) filter (where c.kind = 'income'),
         count(*) filter (where c.kind = 'expense'),
         count(distinct a.currency),
         coalesce(sum(l.amount), 0),
         count(*) filter (where v_tx.occurred_on < a.opening_date),
         count(*) filter (where a.class = 'liability')
    into v_lines, v_accounts, v_pos, v_neg, v_with_category,
         v_income_categories, v_expense_categories, v_currencies, v_sum, v_before_opening, v_liability_lines
    from public.transaction_lines l
    join public.accounts a on a.id = l.account_id
    left join public.categories c on c.id = l.category_id
   where l.transaction_id = p_transaction_id;

  select count(*),
         count(*) filter (where m.quantity > 0),
         count(*) filter (where m.quantity < 0),
         count(distinct m.account_id),
         count(m.unit_price),
         count(m.cost_amount),
         count(*) filter (where m.fee > 0),
         count(*) filter (where m.asset_id is distinct from v_tx.asset_id),
         count(*) filter (where a.type <> 'investment'),
         count(*) filter (where v_tx.occurred_on < a.opening_date)
    into v_moves, v_move_in, v_move_out, v_move_accounts, v_move_priced, v_move_costed, v_move_fee,
         v_move_other_asset, v_move_non_investment, v_move_before_opening
    from public.holding_movements m
    join public.accounts a on a.id = m.account_id
   where m.transaction_id = p_transaction_id;

  if v_before_opening > 0 or v_move_before_opening > 0 then
    raise exception 'transaction_shape_invalid: dated before the account opening date'
      using errcode = 'FT001';
  end if;
  if v_moves > 0 and (v_move_non_investment > 0 or v_move_other_asset > 0) then
    raise exception 'transaction_shape_invalid: holdings live in investment accounts and match the transaction''s asset'
      using errcode = 'FT001';
  end if;
  if v_tx.kind in ('income', 'expense', 'refund', 'transfer', 'adjustment') and v_moves > 0 then
    raise exception 'transaction_shape_invalid: % transactions have no holding movements', v_tx.kind
      using errcode = 'FT001';
  end if;
  if v_tx.kind in ('opening_holding', 'buy', 'sell', 'dividend', 'interest', 'split') and v_tx.asset_id is null then
    raise exception 'transaction_shape_invalid: % transactions need an asset', v_tx.kind
      using errcode = 'FT001';
  end if;

  case v_tx.kind
    when 'income' then
      if v_lines < 1 or v_accounts <> 1 or v_pos <> v_lines or v_income_categories <> v_lines then
        raise exception 'transaction_shape_invalid: income needs positive lines on one account, each with an income category'
          using errcode = 'FT001';
      end if;
    when 'expense' then
      if v_lines < 1 or v_accounts <> 1 or v_neg <> v_lines or v_expense_categories <> v_lines then
        raise exception 'transaction_shape_invalid: expense needs negative lines on one account, each with an expense category'
          using errcode = 'FT001';
      end if;
    when 'refund' then
      if v_lines < 1 or v_accounts <> 1 or v_pos <> v_lines or v_expense_categories <> v_lines then
        raise exception 'transaction_shape_invalid: refund needs positive lines on one account, each with an expense category'
          using errcode = 'FT001';
      end if;
      if v_tx.refund_of_id is not null and not exists (
        select 1 from public.transactions o where o.id = v_tx.refund_of_id and o.kind = 'expense'
      ) then
        raise exception 'transaction_shape_invalid: a refund can only reference an expense'
          using errcode = 'FT001';
      end if;
    when 'transfer' then
      if v_lines <> 2 or v_accounts <> 2 or v_pos <> 1 or v_neg <> 1 or v_with_category <> 0 then
        raise exception 'transaction_shape_invalid: transfer needs one outgoing and one incoming line on two accounts, without categories'
          using errcode = 'FT001';
      end if;
      if v_currencies = 1 and v_sum <> 0 then
        raise exception 'transaction_shape_invalid: same-currency transfer must balance'
          using errcode = 'FT001';
      end if;
    when 'adjustment' then
      if v_lines <> 1 or v_with_category <> 0 then
        raise exception 'transaction_shape_invalid: adjustment needs exactly one line without a category'
          using errcode = 'FT001';
      end if;
    when 'opening_holding' then
      if v_lines <> 0 or v_moves <> 1 or v_move_in <> 1 or v_move_costed <> 1 or v_move_fee <> 0 then
        raise exception 'transaction_shape_invalid: an opening holding needs one incoming quantity with its cost and no cash line'
          using errcode = 'FT001';
      end if;
    when 'buy' then
      if v_lines <> 1 or v_neg <> 1 or v_with_category <> 0 or v_liability_lines <> 0
         or v_moves <> 1 or v_move_in <> 1 or v_move_priced <> 1 or v_move_costed <> 0 then
        raise exception 'transaction_shape_invalid: a buy needs one payment from an asset account and one priced incoming quantity'
          using errcode = 'FT001';
      end if;
    when 'sell' then
      if v_lines <> 1 or v_pos <> 1 or v_with_category <> 0 or v_liability_lines <> 0
         or v_moves <> 1 or v_move_out <> 1 or v_move_priced <> 1 or v_move_costed <> 0 then
        raise exception 'transaction_shape_invalid: a sell needs one priced outgoing quantity and one receipt into an asset account'
          using errcode = 'FT001';
      end if;
    when 'dividend', 'interest' then
      if v_lines <> 1 or v_pos <> 1 or v_with_category <> 0 or v_moves <> 0 then
        raise exception 'transaction_shape_invalid: % needs one positive line without a category', v_tx.kind
          using errcode = 'FT001';
      end if;
    when 'investment_fee' then
      if v_lines <> 1 or v_neg <> 1 or v_with_category <> 0 or v_moves <> 0 then
        raise exception 'transaction_shape_invalid: an investment fee needs one negative line without a category'
          using errcode = 'FT001';
      end if;
    when 'split' then
      if v_lines <> 0 or v_moves < 1 or v_move_accounts <> v_moves
         or v_move_priced <> 0 or v_move_costed <> 0 or v_move_fee <> 0 then
        raise exception 'transaction_shape_invalid: a split changes quantities only, once per account, with no cash or price'
          using errcode = 'FT001';
      end if;
  end case;

  -- A date change can reorder movements, so re-check every position this transaction touches.
  for v_position in
    select distinct m.account_id, m.asset_id from public.holding_movements m where m.transaction_id = p_transaction_id
  loop
    perform app_private.assert_position(v_position.account_id, v_position.asset_id);
  end loop;
end;
$$;

create function app_private.check_movement() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    perform app_private.assert_transaction_shape(old.transaction_id);
    perform app_private.assert_position(old.account_id, old.asset_id);
  end if;
  if tg_op <> 'DELETE' then
    perform app_private.assert_transaction_shape(new.transaction_id);
    perform app_private.assert_position(new.account_id, new.asset_id);
  end if;
  return null;
end;
$$;

create constraint trigger holding_movements_shape
  after insert or update or delete on public.holding_movements
  deferrable initially deferred
  for each row execute function app_private.check_movement();

-- RPC helpers ----------------------------------------------------------------------

-- Movements payload: [{account_id, quantity, unit_price?, fee?, cost_amount?}, ...],
-- all for the transaction's asset. Decimal strings; never rounded.
create function app_private.insert_movements(p_transaction_id uuid, p_asset_id uuid, p_movements jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  v_move jsonb;
  v_qty numeric;
  v_price numeric;
  v_fee numeric;
  v_cost numeric;
  v_scale smallint;
  v_minor smallint;
begin
  if p_movements is null or jsonb_typeof(p_movements) = 'null' then
    return;
  end if;
  if jsonb_typeof(p_movements) <> 'array' or jsonb_array_length(p_movements) > 50
     or exists (select 1 from jsonb_array_elements(p_movements) m where jsonb_typeof(m) <> 'object') then
    raise exception 'invalid_payload: movements must be an array of at most 50 objects' using errcode = 'FT007';
  end if;
  if jsonb_array_length(p_movements) = 0 then
    return;
  end if;

  select a.quantity_scale, c.minor_units into v_scale, v_minor
    from public.assets a join public.currencies c on c.code = a.currency
   where a.id = p_asset_id;
  if not found then
    raise exception 'invalid_payload: unknown asset' using errcode = 'FT007';
  end if;

  for v_move in select value from jsonb_array_elements(p_movements) loop
    begin
      v_qty := (v_move ->> 'quantity')::numeric;
      v_price := nullif(v_move ->> 'unit_price', '')::numeric;
      v_fee := coalesce(nullif(v_move ->> 'fee', '')::numeric, 0);
      v_cost := nullif(v_move ->> 'cost_amount', '')::numeric;
    exception when others then
      raise exception 'invalid_payload: a quantity, price, fee or cost is not a number' using errcode = 'FT007';
    end;
    if v_qty is null or scale(trim_scale(v_qty)) > v_scale
       or (v_price is not null and scale(trim_scale(v_price)) > 10)
       or scale(trim_scale(v_fee)) > v_minor
       or (v_cost is not null and scale(trim_scale(v_cost)) > v_minor) then
      raise exception 'transaction_shape_invalid: a quantity or amount has more decimals than allowed'
        using errcode = 'FT001';
    end if;
    insert into public.holding_movements (transaction_id, account_id, asset_id, quantity, unit_price, fee, cost_amount)
    values (p_transaction_id, (v_move ->> 'account_id')::uuid, p_asset_id, v_qty, v_price, v_fee, v_cost);
  end loop;
end;
$$;

-- New activity may not use an archived asset or post to an archived investment account.
-- Values the transaction already had stay allowed, so old records remain editable.
create function app_private.assert_investment_usable(
  p_asset_id uuid, p_movements jsonb, p_existing_asset uuid, p_existing_accounts uuid[]
) returns void
language plpgsql set search_path = '' as $$
begin
  if p_asset_id is not null and p_asset_id is distinct from p_existing_asset and exists (
    select 1 from public.assets a where a.id = p_asset_id and a.status = 'archived'
  ) then
    raise exception 'asset_archived: archived assets can''t receive new transactions' using errcode = 'FT009';
  end if;
  if p_movements is not null and jsonb_typeof(p_movements) = 'array' then
    perform app_private.assert_accounts_usable(p_movements, p_existing_accounts);
  end if;
end;
$$;

-- RPCs (replace 0005) --------------------------------------------------------------

create or replace function public.create_transaction(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_asset uuid := nullif(p ->> 'asset_id', '')::uuid;
begin
  perform app_private.assert_lines_payload(coalesce(p -> 'lines', '[]'::jsonb));
  perform app_private.assert_accounts_usable(coalesce(p -> 'lines', '[]'::jsonb), null);
  perform app_private.assert_investment_usable(v_asset, p -> 'movements', null, null);

  insert into public.transactions (kind, occurred_on, description, payee, notes, tags, status, refund_of_id, asset_id)
  values (
    (p ->> 'kind')::public.transaction_kind,
    (p ->> 'occurred_on')::date,
    coalesce(btrim(p ->> 'description'), ''),
    nullif(btrim(p ->> 'payee'), ''),
    nullif(btrim(p ->> 'notes'), ''),
    app_private.tags_from(p -> 'tags'),
    coalesce((p ->> 'status')::public.transaction_status, 'cleared'),
    nullif(p ->> 'refund_of_id', '')::uuid,
    v_asset
  )
  returning id into v_id;

  perform app_private.insert_lines(v_id, coalesce(p -> 'lines', '[]'::jsonb));
  perform app_private.insert_movements(v_id, v_asset, p -> 'movements');
  -- Run the deferred checks now so the caller gets the error from this call.
  set constraints public.transactions_shape, public.transaction_lines_shape, public.holding_movements_shape immediate;
  return v_id;
end;
$$;

create or replace function public.update_transaction(
  p_id uuid,
  p jsonb,
  p_expected_updated_at timestamptz,
  p_unlock boolean default false
) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  v_tx public.transactions;
  v_existing uuid[];
  v_existing_moves uuid[];
  v_asset uuid := nullif(p ->> 'asset_id', '')::uuid;
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

  perform app_private.assert_lines_payload(coalesce(p -> 'lines', '[]'::jsonb));
  select array_agg(account_id) into v_existing from public.transaction_lines where transaction_id = p_id;
  select array_agg(account_id) into v_existing_moves from public.holding_movements where transaction_id = p_id;
  perform app_private.assert_accounts_usable(coalesce(p -> 'lines', '[]'::jsonb), v_existing);
  perform app_private.assert_investment_usable(v_asset, p -> 'movements', v_tx.asset_id, v_existing_moves);

  update public.transactions set
    kind = (p ->> 'kind')::public.transaction_kind,
    occurred_on = (p ->> 'occurred_on')::date,
    description = coalesce(btrim(p ->> 'description'), ''),
    payee = nullif(btrim(p ->> 'payee'), ''),
    notes = nullif(btrim(p ->> 'notes'), ''),
    tags = app_private.tags_from(p -> 'tags'),
    status = coalesce((p ->> 'status')::public.transaction_status, 'cleared'),
    refund_of_id = nullif(p ->> 'refund_of_id', '')::uuid,
    asset_id = v_asset,
    reconciliation_id = null
  where id = p_id
  returning updated_at into v_updated_at;

  delete from public.transaction_lines where transaction_id = p_id;
  delete from public.holding_movements where transaction_id = p_id;
  perform app_private.insert_lines(p_id, coalesce(p -> 'lines', '[]'::jsonb));
  perform app_private.insert_movements(p_id, v_asset, p -> 'movements');
  set constraints public.transactions_shape, public.transaction_lines_shape, public.holding_movements_shape immediate;
  return v_updated_at;
end;
$$;

create or replace function public.delete_transaction(
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
  -- Deleting a buy can leave a later sell without holdings: report it from this call.
  set constraints public.holding_movements_shape immediate;
end;
$$;

-- list_transactions (replaces 0005): adds asset_id and movements, and the
-- account filter also matches holdings. New filter key: asset_id.
create or replace function public.list_transactions(p_filter jsonb default '{}', p_limit int default 50)
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
       and (v_f ->> 'account_id' is null
            or exists (select 1 from public.transaction_lines l
                        where l.transaction_id = t.id and l.account_id = (v_f ->> 'account_id')::uuid)
            or exists (select 1 from public.holding_movements m
                        where m.transaction_id = t.id and m.account_id = (v_f ->> 'account_id')::uuid))
       and (v_f ->> 'asset_id' is null or t.asset_id = (v_f ->> 'asset_id')::uuid)
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
      'asset_id', n.asset_id,
      'created_at', n.created_at::text,
      'updated_at', n.updated_at::text,
      'lines', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', l.id, 'account_id', l.account_id, 'amount', l.amount::text,
          'category_id', l.category_id, 'memo', l.memo) order by l.created_at, l.id), '[]'::jsonb)
          from public.transaction_lines l where l.transaction_id = n.id),
      'movements', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'account_id', m.account_id, 'asset_id', m.asset_id, 'quantity', m.quantity::text,
          'unit_price', m.unit_price::text, 'fee', m.fee::text, 'cost_amount', m.cost_amount::text)
          order by m.created_at, m.id), '[]'::jsonb)
          from public.holding_movements m where m.transaction_id = n.id)
    ) order by n.rn) filter (where n.rn <= v_limit), '[]'::jsonb),
    count(*) > v_limit
    into v_rows, v_has_more
    from numbered n;

  return jsonb_build_object('items', v_rows, 'has_more', v_has_more);
end;
$$;

-- Read helpers for the domain ------------------------------------------------------

-- Every holding movement dated on or before p_to, in ledger order, with its
-- transaction's kind and date. Numbers as text.
create function public.holding_movements_list(p_to date default null)
returns table (id uuid, transaction_id uuid, account_id uuid, asset_id uuid, kind public.transaction_kind,
               occurred_on date, created_at text, quantity text, unit_price text, fee text, cost_amount text)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.transaction_id, m.account_id, m.asset_id, t.kind, t.occurred_on, t.created_at::text,
         m.quantity::text, m.unit_price::text, m.fee::text, m.cost_amount::text
    from public.holding_movements m
    join public.transactions t on t.id = m.transaction_id
   where p_to is null or t.occurred_on <= p_to
   order by t.occurred_on, t.created_at, t.id, m.id
$$;

-- Cash lines of transactions about an asset (dividends, interest, fees and the
-- cash legs of buys and sells), dated on or before p_to.
create function public.asset_cash_lines(p_to date default null)
returns table (transaction_id uuid, asset_id uuid, kind public.transaction_kind, occurred_on date,
               account_id uuid, amount text)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.asset_id, t.kind, t.occurred_on, l.account_id, l.amount::text
    from public.transactions t
    join public.transaction_lines l on l.transaction_id = t.id
   where t.asset_id is not null and (p_to is null or t.occurred_on <= p_to)
   order by t.occurred_on, t.created_at, t.id, l.id
$$;

-- Audit --------------------------------------------------------------------------

create trigger assets_audit after insert or update or delete on public.assets
  for each row execute function app_private.audit_row();
create trigger asset_valuations_audit after insert or update or delete on public.asset_valuations
  for each row execute function app_private.audit_row();
create trigger holding_movements_audit after insert or update or delete on public.holding_movements
  for each row execute function app_private.audit_row();

-- transaction_history also covers movement-only edits (e.g. a changed quantity).
create index audit_events_movement_tx_idx on public.audit_events
  ((coalesce(after ->> 'transaction_id', before ->> 'transaction_id')))
  where table_name = 'holding_movements';

create or replace function public.transaction_history(p_id uuid)
returns table (txid bigint, occurred_at text, header_actions text[])
language sql stable security invoker set search_path = '' as $$
  select e.txid, min(e.occurred_at)::text,
         coalesce(array_agg(distinct e.action::text) filter (where e.table_name = 'transactions'), '{}')
    from public.audit_events e
   where (e.table_name = 'transactions' and e.record_id = p_id)
      or (e.table_name in ('transaction_lines', 'holding_movements')
          and coalesce(e.after ->> 'transaction_id', e.before ->> 'transaction_id') = p_id::text)
   group by e.txid
   order by min(e.id) desc
   limit 200
$$;

-- RLS ------------------------------------------------------------------------------

alter table public.assets enable row level security;
alter table public.assets force row level security;
create policy assets_mfa on public.assets as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy assets_select on public.assets for select to authenticated using (user_id = (select auth.uid()));
create policy assets_insert on public.assets for insert to authenticated with check (user_id = (select auth.uid()));
create policy assets_update on public.assets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy assets_delete on public.assets for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.assets from authenticated;
grant select, insert, update, delete on public.assets to authenticated;

alter table public.asset_valuations enable row level security;
alter table public.asset_valuations force row level security;
create policy asset_valuations_mfa on public.asset_valuations as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy asset_valuations_select on public.asset_valuations for select to authenticated
  using (user_id = (select auth.uid()));
create policy asset_valuations_insert on public.asset_valuations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy asset_valuations_update on public.asset_valuations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy asset_valuations_delete on public.asset_valuations for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.asset_valuations from authenticated;
grant select, insert, update, delete on public.asset_valuations to authenticated;

alter table public.holding_movements enable row level security;
alter table public.holding_movements force row level security;
create policy holding_movements_mfa on public.holding_movements as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy holding_movements_select on public.holding_movements for select to authenticated
  using (user_id = (select auth.uid()));
create policy holding_movements_insert on public.holding_movements for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy holding_movements_update on public.holding_movements for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy holding_movements_delete on public.holding_movements for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.holding_movements from authenticated;
grant select, insert, update, delete on public.holding_movements to authenticated;

-- Grants -----------------------------------------------------------------------------

revoke all on function public.holding_movements_list(date) from public, anon;
revoke all on function public.asset_cash_lines(date) from public, anon;
grant execute on function public.holding_movements_list(date) to authenticated;
grant execute on function public.asset_cash_lines(date) to authenticated;
