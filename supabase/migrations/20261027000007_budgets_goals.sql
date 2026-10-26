-- 0007: monthly budgets, savings goals and goal allocations.

-- Budgets ---------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  -- null = the overall monthly spending limit.
  category_id uuid,
  amount numeric(20, 4) not null check (amount > 0 and amount < 1e15),
  currency char(3) not null references public.currencies (code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique nulls not distinct (user_id, month, category_id),
  -- Deleting an (unused) category removes its budgets with it.
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

create index budgets_user_month_idx on public.budgets (user_id, month);

-- Budgets are set on top-level expense categories; a category's actual
-- spending includes its subcategories (docs/04-accounting-rules.md §4.4).
create function app_private.budgets_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_minor smallint;
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.kind = 'expense' and c.parent_id is null
  ) then
    raise exception 'invalid_payload: budgets are set on top-level expense categories' using errcode = 'FT007';
  end if;
  select minor_units into v_minor from public.currencies where code = new.currency;
  if scale(trim_scale(new.amount)) > v_minor then
    raise exception 'invalid_payload: amount has more decimals than the currency allows' using errcode = 'FT007';
  end if;
  return new;
end;
$$;

create trigger budgets_check before insert or update on public.budgets
  for each row execute function app_private.budgets_check();
create trigger budgets_updated_at before update on public.budgets
  for each row execute function app_private.set_updated_at();
create trigger budgets_audit after insert or update or delete on public.budgets
  for each row execute function app_private.audit_row();

alter table public.budgets enable row level security;
alter table public.budgets force row level security;
create policy budgets_mfa on public.budgets as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy budgets_select on public.budgets for select to authenticated using (user_id = (select auth.uid()));
create policy budgets_insert on public.budgets for insert to authenticated with check (user_id = (select auth.uid()));
create policy budgets_update on public.budgets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy budgets_delete on public.budgets for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.budgets from authenticated;
grant select, insert, update, delete on public.budgets to authenticated;

-- Copies one month's budgets into another month that has none of its own
-- for those categories. Returns the number of budgets created.
create function public.copy_budgets(p_from date, p_to date) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer;
begin
  if extract(day from p_from) <> 1 or extract(day from p_to) <> 1 or p_from = p_to then
    raise exception 'invalid_payload: months must be different first-of-month dates' using errcode = 'FT007';
  end if;
  insert into public.budgets (month, category_id, amount, currency)
  select p_to, b.category_id, b.amount, b.currency
    from public.budgets b
   where b.month = p_from
     and not exists (select 1 from public.budgets x where x.month = p_to and x.category_id is not distinct from b.category_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.copy_budgets(date, date) from public, anon;
grant execute on function public.copy_budgets(date, date) to authenticated;

-- Merging categories now also merges their budgets: amounts in the same
-- month and currency are added; otherwise the source budget moves over.
create or replace function public.merge_category(p_from uuid, p_into uuid) returns void
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

  if v_into.parent_id is null then
    update public.budgets t set amount = t.amount + s.amount
      from public.budgets s
     where s.category_id = v_from.id and t.category_id = v_into.id and t.month = s.month and t.currency = s.currency;
    delete from public.budgets s
     where s.category_id = v_from.id
       and exists (select 1 from public.budgets t where t.category_id = v_into.id and t.month = s.month);
    update public.budgets set category_id = v_into.id where category_id = v_from.id;
  end if;
  -- Merging into a subcategory: its parent's budget already covers it.
  delete from public.categories where id = v_from.id;
end;
$$;

-- Savings goals -----------------------------------------------------------------

create type public.goal_funding_mode as enum ('linked_account', 'allocations');
create type public.goal_status as enum ('active', 'completed', 'archived');

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text check (char_length(description) <= 1000),
  target_amount numeric(20, 4) not null check (target_amount > 0 and target_amount < 1e15),
  currency char(3) not null references public.currencies (code),
  target_date date check (target_date between '1900-01-01' and '2999-12-31'),
  funding_mode public.goal_funding_mode not null,
  linked_account_id uuid,
  status public.goal_status not null default 'active',
  completed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name),
  check ((funding_mode = 'linked_account') = (linked_account_id is not null)),
  check ((status = 'completed') = (completed_on is not null)),
  foreign key (linked_account_id, user_id) references public.accounts (id, user_id)
);

create trigger savings_goals_updated_at before update on public.savings_goals
  for each row execute function app_private.set_updated_at();
create trigger savings_goals_audit after insert or update or delete on public.savings_goals
  for each row execute function app_private.audit_row();

-- Earmarks only: allocations never move money or change balances (ACC-GOAL-1).
create table public.goal_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  allocated_on date not null check (allocated_on between '1900-01-01' and '2999-12-31'),
  -- In the goal's currency: positive allocates, negative releases.
  amount numeric(20, 4) not null check (amount <> 0 and abs(amount) < 1e15),
  source_account_id uuid,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.savings_goals (id, user_id) on delete cascade,
  foreign key (source_account_id, user_id) references public.accounts (id, user_id)
);

create index goal_allocations_goal_idx on public.goal_allocations (goal_id, allocated_on);
create index goal_allocations_source_idx on public.goal_allocations (source_account_id) where source_account_id is not null;

create function app_private.goal_allocations_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_goal public.savings_goals;
  v_minor smallint;
begin
  select * into v_goal from public.savings_goals where id = new.goal_id;
  if v_goal.funding_mode <> 'allocations' then
    raise exception 'invalid_payload: this goal follows a linked account; it takes no allocations' using errcode = 'FT007';
  end if;
  select minor_units into v_minor from public.currencies where code = v_goal.currency;
  if scale(trim_scale(new.amount)) > v_minor then
    raise exception 'invalid_payload: amount has more decimals than the currency allows' using errcode = 'FT007';
  end if;
  -- Over-allocation is compared with the source account's balance, so both must share a currency.
  if new.source_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.source_account_id and a.currency = v_goal.currency
  ) then
    raise exception 'invalid_payload: the source account must use the goal currency' using errcode = 'FT007';
  end if;
  return new;
end;
$$;

create trigger goal_allocations_check before insert or update on public.goal_allocations
  for each row execute function app_private.goal_allocations_check();

-- A goal's allocated total can never go below zero.
create function app_private.goal_allocations_total() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_goal uuid := coalesce(new.goal_id, old.goal_id);
begin
  if exists (select 1 from public.savings_goals g where g.id = v_goal)
     and (select coalesce(sum(amount), 0) from public.goal_allocations where goal_id = v_goal) < 0 then
    raise exception 'invalid_payload: you cannot release more than is allocated' using errcode = 'FT007';
  end if;
  return null;
end;
$$;

create constraint trigger goal_allocations_total after insert or update or delete on public.goal_allocations
  deferrable initially deferred
  for each row execute function app_private.goal_allocations_total();
create trigger goal_allocations_audit after insert or update or delete on public.goal_allocations
  for each row execute function app_private.audit_row();

-- Switching a goal's funding mode would orphan or contradict its allocations.
create function app_private.savings_goals_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.funding_mode <> old.funding_mode and exists (select 1 from public.goal_allocations where goal_id = new.id) then
    raise exception 'invalid_payload: remove the allocations before switching to a linked account' using errcode = 'FT007';
  end if;
  if new.currency <> old.currency and exists (select 1 from public.goal_allocations where goal_id = new.id) then
    raise exception 'invalid_payload: the currency is fixed once allocations exist' using errcode = 'FT007';
  end if;
  return new;
end;
$$;

create trigger savings_goals_guard before update on public.savings_goals
  for each row execute function app_private.savings_goals_guard();

-- A goal can only follow an asset account (money held, not money owed).
create function app_private.savings_goals_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.linked_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.linked_account_id and a.class = 'asset'
  ) then
    raise exception 'invalid_payload: a goal can only follow an asset account' using errcode = 'FT007';
  end if;
  return new;
end;
$$;

create trigger savings_goals_check before insert or update on public.savings_goals
  for each row execute function app_private.savings_goals_check();

alter table public.savings_goals enable row level security;
alter table public.savings_goals force row level security;
create policy savings_goals_mfa on public.savings_goals as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy savings_goals_select on public.savings_goals for select to authenticated using (user_id = (select auth.uid()));
create policy savings_goals_insert on public.savings_goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy savings_goals_update on public.savings_goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy savings_goals_delete on public.savings_goals for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.savings_goals from authenticated;
grant select, insert, update, delete on public.savings_goals to authenticated;

alter table public.goal_allocations enable row level security;
alter table public.goal_allocations force row level security;
create policy goal_allocations_mfa on public.goal_allocations as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy goal_allocations_select on public.goal_allocations for select to authenticated using (user_id = (select auth.uid()));
create policy goal_allocations_insert on public.goal_allocations for insert to authenticated with check (user_id = (select auth.uid()));
create policy goal_allocations_delete on public.goal_allocations for delete to authenticated using (user_id = (select auth.uid()));
-- History is corrected by deleting and re-adding, never edited in place.
revoke all on public.goal_allocations from authenticated;
grant select, insert, delete on public.goal_allocations to authenticated;
