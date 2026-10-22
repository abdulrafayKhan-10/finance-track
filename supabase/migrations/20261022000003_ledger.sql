-- 0003: journal headers, signed ledger lines and the shape invariant.
-- Multi-row writes go through RPCs (Phase 3); the deferred constraint trigger
-- below rejects any committed transaction whose lines break the rules in
-- docs/04-accounting-rules.md, whichever path wrote them.

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.transaction_kind not null,
  occurred_on date not null check (occurred_on between '1900-01-01' and '2999-12-31'),
  description text not null default '' check (char_length(description) <= 200),
  payee text check (char_length(payee) <= 100),
  notes text check (char_length(notes) <= 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  status public.transaction_status not null default 'cleared',
  refund_of_id uuid,
  asset_id uuid,          -- FK added with investments (0009)
  import_batch_id uuid,   -- FK added with imports (0010)
  import_fingerprint text check (char_length(import_fingerprint) <= 128),
  reconciliation_id uuid, -- FK added with reconciliation (0006)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (refund_of_id, user_id) references public.transactions (id, user_id)
    on delete set null (refund_of_id),
  check (refund_of_id is null or kind = 'refund'),
  check (kind <> 'adjustment' or char_length(btrim(coalesce(notes, ''))) > 0)
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc, id desc);
create index transactions_fingerprint_idx on public.transactions (user_id, import_fingerprint)
  where import_fingerprint is not null;
create index transactions_description_trgm_idx on public.transactions
  using gin (description extensions.gin_trgm_ops);
create index transactions_tags_idx on public.transactions using gin (tags);
create index transactions_refund_of_idx on public.transactions (refund_of_id) where refund_of_id is not null;

create trigger transactions_updated_at before update on public.transactions
  for each row execute function app_private.set_updated_at();

create table public.transaction_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  account_id uuid not null,
  -- In the account's currency, signed by net-worth effect.
  amount numeric(20, 4) not null check (amount <> 0 and abs(amount) < 1e15),
  category_id uuid,
  memo text check (char_length(memo) <= 200),
  created_at timestamptz not null default now(),
  -- Composite keys make a cross-user reference impossible even without RLS.
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

create index transaction_lines_transaction_idx on public.transaction_lines (transaction_id);
create index transaction_lines_account_idx on public.transaction_lines (user_id, account_id);
create index transaction_lines_category_idx on public.transaction_lines (user_id, category_id)
  where category_id is not null;

-- Shape invariant -------------------------------------------------------------

create function app_private.assert_transaction_shape(p_transaction_id uuid) returns void
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
         count(*) filter (where v_tx.occurred_on < a.opening_date)
    into v_lines, v_accounts, v_pos, v_neg, v_with_category,
         v_income_categories, v_expense_categories, v_currencies, v_sum, v_before_opening
    from public.transaction_lines l
    join public.accounts a on a.id = l.account_id
    left join public.categories c on c.id = l.category_id
   where l.transaction_id = p_transaction_id;

  if v_before_opening > 0 then
    raise exception 'transaction_shape_invalid: dated before the account opening date'
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
    else
      raise exception 'transaction_shape_invalid: % transactions are not supported yet', v_tx.kind
        using errcode = 'FT001';
  end case;
end;
$$;

create function app_private.check_transaction_shape() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'transactions' then
    perform app_private.assert_transaction_shape(coalesce(new.id, old.id));
  else
    if tg_op <> 'INSERT' then
      perform app_private.assert_transaction_shape(old.transaction_id);
    end if;
    if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.transaction_id <> old.transaction_id) then
      perform app_private.assert_transaction_shape(new.transaction_id);
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger transactions_shape
  after insert or update on public.transactions
  deferrable initially deferred
  for each row execute function app_private.check_transaction_shape();

create constraint trigger transaction_lines_shape
  after insert or update or delete on public.transaction_lines
  deferrable initially deferred
  for each row execute function app_private.check_transaction_shape();

-- Account fields that ledger lines depend on cannot change once lines exist.
create function app_private.accounts_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_class_changed boolean;
begin
  -- `class` is a generated column and not yet computed in a BEFORE trigger.
  v_class_changed := (new.type in ('credit_card', 'loan', 'other_liability'))
                  <> (old.type in ('credit_card', 'loan', 'other_liability'));
  if (new.currency <> old.currency or v_class_changed or new.opening_date > old.opening_date)
     and exists (
       select 1 from public.transaction_lines l
         join public.transactions t on t.id = l.transaction_id
        where l.account_id = new.id
          and (new.currency <> old.currency or v_class_changed or t.occurred_on < new.opening_date)
     ) then
    raise exception 'account_locked_field: currency, asset/liability type and opening date are fixed by existing transactions'
      using errcode = 'FT002';
  end if;
  return new;
end;
$$;

create trigger accounts_guard before update on public.accounts
  for each row execute function app_private.accounts_guard();

-- RLS -------------------------------------------------------------------------

alter table public.transactions enable row level security;
alter table public.transactions force row level security;
create policy transactions_mfa on public.transactions as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy transactions_select on public.transactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy transactions_update on public.transactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy transactions_delete on public.transactions for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.transactions from authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

alter table public.transaction_lines enable row level security;
alter table public.transaction_lines force row level security;
create policy transaction_lines_mfa on public.transaction_lines as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy transaction_lines_select on public.transaction_lines for select to authenticated
  using (user_id = (select auth.uid()));
create policy transaction_lines_insert on public.transaction_lines for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy transaction_lines_update on public.transaction_lines for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy transaction_lines_delete on public.transaction_lines for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.transaction_lines from authenticated;
grant select, insert, update, delete on public.transaction_lines to authenticated;
