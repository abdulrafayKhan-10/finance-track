-- 0012: account deletion works when Supabase Auth deletes the user.
--
-- Supabase deletes a user as its own `supabase_auth_admin` role, which has no
-- rights on this app's schemas. The cascade from auth.users fires the integrity
-- triggers below, and as SECURITY INVOKER they failed with "permission denied
-- for schema app_private", so the whole deletion was refused. They now run as
-- their owner (like audit_row already does). They only read the rows of the
-- transaction, position or goal that fired them, and only ever raise an error
-- or do nothing, so no data is exposed. Bodies are unchanged from 0003/0010/0007.

create or replace function app_private.check_transaction_shape() returns trigger
language plpgsql security definer set search_path = '' as $$
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

create or replace function app_private.check_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
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

create or replace function app_private.goal_allocations_total() returns trigger
language plpgsql security definer set search_path = '' as $$
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

revoke all on function app_private.check_transaction_shape() from public;
revoke all on function app_private.check_movement() from public;
revoke all on function app_private.goal_allocations_total() from public;
