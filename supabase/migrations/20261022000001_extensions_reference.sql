-- 0001: extensions, enums, reference data and shared helpers.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- Internal helpers live outside the API-exposed `public` schema.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

-- Supabase grants new objects in `public` to anon/authenticated by default.
-- This app grants explicitly per table instead; anon gets nothing.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon, public;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;

create type public.theme_preference as enum ('system', 'light', 'dark');
create type public.account_type as enum (
  'cash', 'bank', 'digital_wallet', 'savings', 'investment',
  'credit_card', 'loan', 'other_asset', 'other_liability'
);
create type public.account_class as enum ('asset', 'liability');
create type public.account_status as enum ('active', 'closed', 'archived');
create type public.category_kind as enum ('income', 'expense');
create type public.transaction_kind as enum (
  'income', 'expense', 'refund', 'transfer', 'adjustment',
  'opening_holding', 'buy', 'sell', 'dividend', 'interest', 'investment_fee', 'split'
);
create type public.transaction_status as enum ('cleared', 'pending');
create type public.audit_action as enum ('insert', 'update', 'delete');

-- ISO 4217 currencies (global reference data, read-only to signed-in users).
create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  minor_units smallint not null check (minor_units between 0 and 4)
);

alter table public.currencies enable row level security;
alter table public.currencies force row level security;
-- Reference data shared by all users: the only `using (true)` policy in the schema.
create policy currencies_select on public.currencies for select to authenticated using (true);
revoke all on public.currencies from authenticated, service_role;
grant select on public.currencies to authenticated;

insert into public.currencies (code, name, minor_units) values
  ('PKR', 'Pakistani Rupee', 2),
  ('USD', 'US Dollar', 2),
  ('EUR', 'Euro', 2),
  ('GBP', 'Pound Sterling', 2),
  ('AED', 'UAE Dirham', 2),
  ('SAR', 'Saudi Riyal', 2),
  ('QAR', 'Qatari Riyal', 2),
  ('KWD', 'Kuwaiti Dinar', 3),
  ('BHD', 'Bahraini Dinar', 3),
  ('OMR', 'Omani Rial', 3),
  ('INR', 'Indian Rupee', 2),
  ('BDT', 'Bangladeshi Taka', 2),
  ('LKR', 'Sri Lankan Rupee', 2),
  ('CNY', 'Chinese Yuan', 2),
  ('JPY', 'Japanese Yen', 0),
  ('MYR', 'Malaysian Ringgit', 2),
  ('SGD', 'Singapore Dollar', 2),
  ('TRY', 'Turkish Lira', 2),
  ('CAD', 'Canadian Dollar', 2),
  ('AUD', 'Australian Dollar', 2),
  ('NZD', 'New Zealand Dollar', 2),
  ('CHF', 'Swiss Franc', 2),
  ('SEK', 'Swedish Krona', 2),
  ('NOK', 'Norwegian Krone', 2),
  ('DKK', 'Danish Krone', 2),
  ('HKD', 'Hong Kong Dollar', 2),
  ('ZAR', 'South African Rand', 2),
  ('KRW', 'South Korean Won', 0),
  ('THB', 'Thai Baht', 2),
  ('IDR', 'Indonesian Rupiah', 2);

create function app_private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- MFA gate: once the user has a verified factor, their session must be aal2.
-- Used as a RESTRICTIVE policy on every user-owned table.
create function app_private.aal_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;
revoke all on function app_private.aal_ok() from public;
grant execute on function app_private.aal_ok() to authenticated;
