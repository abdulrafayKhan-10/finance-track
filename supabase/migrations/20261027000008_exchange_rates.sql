-- 0008: user-maintained, dated exchange rates. 1 `base` = `rate` × `quote`.

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  base char(3) not null references public.currencies (code),
  quote char(3) not null references public.currencies (code),
  rate numeric(24, 12) not null check (rate > 0 and rate < 1e12),
  effective_on date not null check (effective_on between '1900-01-01' and '2999-12-31'),
  source_note text check (char_length(source_note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (base <> quote),
  unique (user_id, base, quote, effective_on)
);

create index exchange_rates_lookup_idx on public.exchange_rates (user_id, base, quote, effective_on desc);

create trigger exchange_rates_updated_at before update on public.exchange_rates
  for each row execute function app_private.set_updated_at();
create trigger exchange_rates_audit after insert or update or delete on public.exchange_rates
  for each row execute function app_private.audit_row();

alter table public.exchange_rates enable row level security;
alter table public.exchange_rates force row level security;
create policy exchange_rates_mfa on public.exchange_rates as restrictive for all to authenticated
  using ((select app_private.aal_ok())) with check ((select app_private.aal_ok()));
create policy exchange_rates_select on public.exchange_rates for select to authenticated using (user_id = (select auth.uid()));
create policy exchange_rates_insert on public.exchange_rates for insert to authenticated with check (user_id = (select auth.uid()));
create policy exchange_rates_update on public.exchange_rates for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy exchange_rates_delete on public.exchange_rates for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.exchange_rates from authenticated;
grant select, insert, update, delete on public.exchange_rates to authenticated;
