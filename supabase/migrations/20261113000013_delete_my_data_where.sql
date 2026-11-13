-- 0013: delete_my_data works on Supabase.
--
-- Supabase guards API connections with pg_safeupdate, which refuses any DELETE
-- or UPDATE without a WHERE clause ("DELETE requires a WHERE clause", 21000).
-- The 0011 version deleted with bare `delete from <table>;` and so always
-- failed there (local test databases don't load the extension). Every
-- statement now names the caller's rows explicitly; RLS still applies too.

create or replace function public.delete_my_data() returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_found' using errcode = 'FT404';
  end if;
  delete from public.goal_allocations where user_id = v_user;
  delete from public.savings_goals where user_id = v_user;
  delete from public.budgets where user_id = v_user;
  delete from public.net_worth_snapshots where user_id = v_user;
  delete from public.asset_valuations where user_id = v_user;
  update public.transactions set refund_of_id = null, reconciliation_id = null
   where user_id = v_user and (refund_of_id is not null or reconciliation_id is not null);
  delete from public.reconciliations where user_id = v_user;
  delete from public.transactions where user_id = v_user;
  delete from public.import_batches where user_id = v_user;
  delete from public.assets where user_id = v_user;
  delete from public.accounts where user_id = v_user;
  delete from public.exchange_rates where user_id = v_user;
  -- A system category moved under a user category must come back to the top level first.
  update public.categories set parent_id = null
   where user_id = v_user and system_key is not null and parent_id is not null;
  delete from public.categories where user_id = v_user and system_key is null and parent_id is not null;
  delete from public.categories where user_id = v_user and system_key is null;
  set constraints all immediate;
end;
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
