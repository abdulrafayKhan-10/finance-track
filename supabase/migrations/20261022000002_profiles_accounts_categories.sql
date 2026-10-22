-- 0002: profiles, accounts, categories, ownership policies, new-user bootstrap.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  base_currency char(3) not null default 'PKR' references public.currencies (code),
  timezone text not null default 'Asia/Karachi' check (char_length(timezone) between 1 and 64),
  theme public.theme_preference not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app_private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy profiles_mfa on public.profiles as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Profiles are created by the auth trigger and removed by cascade only.
revoke all on public.profiles from authenticated;
grant select, update (display_name, base_currency, timezone, theme) on public.profiles to authenticated;

-- Accounts --------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  type public.account_type not null,
  class public.account_class generated always as (
    case when type in ('credit_card', 'loan', 'other_liability')
      then 'liability'::public.account_class
      else 'asset'::public.account_class
    end
  ) stored,
  currency char(3) not null references public.currencies (code),
  -- Signed by net-worth effect: an amount owed on a liability is negative.
  opening_balance numeric(20, 4) not null default 0 check (abs(opening_balance) < 1e15),
  opening_date date not null check (opening_date between '1900-01-01' and '2999-12-31'),
  institution text check (char_length(institution) <= 100),
  notes text check (char_length(notes) <= 2000),
  status public.account_status not null default 'active',
  include_in_net_worth boolean not null default true,
  is_liquid boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create function app_private.accounts_defaults() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.is_liquid is null then
    new.is_liquid := new.type in ('cash', 'bank', 'digital_wallet', 'savings');
  end if;
  return new;
end;
$$;

create trigger accounts_defaults before insert on public.accounts
  for each row execute function app_private.accounts_defaults();
create trigger accounts_updated_at before update on public.accounts
  for each row execute function app_private.set_updated_at();

alter table public.accounts enable row level security;
alter table public.accounts force row level security;
create policy accounts_mfa on public.accounts as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy accounts_select on public.accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy accounts_insert on public.accounts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy accounts_update on public.accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy accounts_delete on public.accounts for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.accounts from authenticated;
grant select, insert, update, delete on public.accounts to authenticated;

-- Categories ------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind public.category_kind not null,
  parent_id uuid,
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text check (char_length(icon) <= 40),
  is_archived boolean not null default false,
  system_key text check (system_key ~ '^[a-z_]{1,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique nulls not distinct (user_id, parent_id, name),
  unique (user_id, system_key),
  check (parent_id is null or parent_id <> id),
  foreign key (parent_id, user_id) references public.categories (id, user_id)
);

create index categories_parent_idx on public.categories (parent_id) where parent_id is not null;

-- At most two levels; a subcategory has its parent's kind.
create function app_private.categories_hierarchy() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_parent public.categories;
begin
  if new.parent_id is not null then
    select * into v_parent from public.categories where id = new.parent_id;
    if v_parent.parent_id is not null then
      raise exception 'category_hierarchy_invalid: subcategories cannot be nested'
        using errcode = 'FT003';
    end if;
    if v_parent.kind <> new.kind then
      raise exception 'category_hierarchy_invalid: subcategory kind must match parent'
        using errcode = 'FT003';
    end if;
    if exists (select 1 from public.categories c where c.parent_id = new.id) then
      raise exception 'category_hierarchy_invalid: a category with subcategories cannot become a subcategory'
        using errcode = 'FT003';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.kind <> old.kind
     and exists (select 1 from public.categories c where c.parent_id = new.id) then
    raise exception 'category_hierarchy_invalid: change subcategories first'
      using errcode = 'FT003';
  end if;
  if tg_op = 'UPDATE' and old.system_key is distinct from new.system_key then
    raise exception 'category_hierarchy_invalid: system categories are fixed'
      using errcode = 'FT003';
  end if;
  return new;
end;
$$;

create trigger categories_hierarchy before insert or update on public.categories
  for each row execute function app_private.categories_hierarchy();
create trigger categories_updated_at before update on public.categories
  for each row execute function app_private.set_updated_at();

alter table public.categories enable row level security;
alter table public.categories force row level security;
create policy categories_mfa on public.categories as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy categories_select on public.categories for select to authenticated
  using (user_id = (select auth.uid()));
create policy categories_insert on public.categories for insert to authenticated
  with check (user_id = (select auth.uid()) and system_key is null);
create policy categories_update on public.categories for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- System categories (used by imports and loan interest) cannot be deleted.
create policy categories_delete on public.categories for delete to authenticated
  using (user_id = (select auth.uid()) and system_key is null);
revoke all on public.categories from authenticated;
grant select, insert, update, delete on public.categories to authenticated;

-- New-user bootstrap -----------------------------------------------------------

create function app_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id);

  insert into public.categories (user_id, name, kind, system_key) values
    (new.id, 'Salary', 'income', null),
    (new.id, 'Business income', 'income', null),
    (new.id, 'Other income', 'income', null),
    (new.id, 'Uncategorized income', 'income', 'uncategorized_income'),
    (new.id, 'Food & groceries', 'expense', null),
    (new.id, 'Housing & rent', 'expense', null),
    (new.id, 'Utilities', 'expense', null),
    (new.id, 'Transport', 'expense', null),
    (new.id, 'Health', 'expense', null),
    (new.id, 'Education', 'expense', null),
    (new.id, 'Shopping', 'expense', null),
    (new.id, 'Entertainment', 'expense', null),
    (new.id, 'Gifts & donations', 'expense', null),
    (new.id, 'Bank charges', 'expense', null),
    (new.id, 'Loan interest', 'expense', 'loan_interest'),
    (new.id, 'Uncategorized expense', 'expense', 'uncategorized_expense');

  return new;
end;
$$;
revoke all on function app_private.handle_new_user() from public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.handle_new_user();
