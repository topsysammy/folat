-- Web app access. The admin signs in with Supabase Auth (email + password);
-- only the account whose email matches settings.admin_email can read or write.
-- Everyone else, signed in or not, still sees nothing (RLS stays on).

alter table settings add column admin_email text not null default '';
update settings set admin_email = 'folashasamuel150@gmail.com' where id = 1;

create or replace function is_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') <> ''
     and lower(auth.jwt() ->> 'email') = (select lower(admin_email) from settings where id = 1);
$$;

grant select on settings to authenticated;
grant select, insert, update on customers to authenticated;
grant select, insert on payments to authenticated;

create policy admin_select on settings  for select to authenticated using (is_admin());
create policy admin_select on customers for select to authenticated using (is_admin());
create policy admin_insert on customers for insert to authenticated with check (is_admin());
create policy admin_update on customers for update to authenticated using (is_admin()) with check (is_admin());
create policy admin_select on payments  for select to authenticated using (is_admin());
-- Payments are never edited or deleted; reversals go through undo_payment().
create policy admin_insert on payments  for insert to authenticated
  with check (is_admin() and source = 'admin');

-- ───────────────────────── undo_payment ─────────────────────────
-- Same rule as the bot: undo never deletes. It inserts a negative 'undo' row
-- pointing at the payment; the unique reverses_payment_id stops a double undo.
create or replace function undo_payment(p_payment_id bigint) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  p      payments;
  new_id bigint;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select * into p from payments where id = p_payment_id;
  if not found or p.source = 'undo' then raise exception 'payment % not found', p_payment_id; end if;
  insert into payments (customer_id, amount, source, reverses_payment_id, note)
  values (p.customer_id, -p.amount, 'undo', p.id, 'undone in web app')
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function is_admin() from public, anon;
revoke all on function undo_payment(bigint) from public, anon;
grant execute on function is_admin() to authenticated;
grant execute on function undo_payment(bigint) to authenticated;
