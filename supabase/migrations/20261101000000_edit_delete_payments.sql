-- Edit and delete payments from the web app. Both go through functions (no
-- direct update/delete grants) so an undone payment and its minus entry
-- always stay in step. Only the current season can be changed.

-- ───────────────────────── edit_payment ─────────────────────────
create or replace function edit_payment(
  p_payment_id  bigint,
  p_customer_id bigint,
  p_amount      integer,
  p_paid_at     timestamptz,
  p_method      text,
  p_note        text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p payments;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select * into p from payments where id = p_payment_id;
  if not found then raise exception 'payment % not found', p_payment_id; end if;
  if p.source <> 'admin' then raise exception 'only payments can be edited, not undo entries'; end if;
  if p.season_id <> current_season() then raise exception 'payments from a past season can''t be changed'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'the amount must be more than 0'; end if;
  if p_paid_at > now() + interval '1 hour' then raise exception 'the date can''t be in the future'; end if;
  if not exists (select 1 from customers where id = p_customer_id) then raise exception 'customer % not found', p_customer_id; end if;

  update payments
     set customer_id = p_customer_id, amount = p_amount, paid_at = p_paid_at,
         method = p_method, note = nullif(trim(p_note), '')
   where id = p_payment_id;
  -- If it was undone, its minus entry follows the change.
  update payments set customer_id = p_customer_id, amount = -p_amount
   where reverses_payment_id = p_payment_id;
end;
$$;

-- ───────────────────────── delete_payment ─────────────────────────
-- Erases for good. Deleting a payment also deletes its minus entry (if it was
-- undone); deleting a minus entry on its own brings the payment back.
create or replace function delete_payment(p_payment_id bigint) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p payments;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select * into p from payments where id = p_payment_id;
  if not found then raise exception 'payment % not found', p_payment_id; end if;
  if p.season_id <> current_season() then raise exception 'payments from a past season can''t be changed'; end if;
  delete from payments where reverses_payment_id = p_payment_id;
  delete from payments where id = p_payment_id;
end;
$$;

revoke all on function edit_payment(bigint, bigint, integer, timestamptz, text, text) from public, anon;
revoke all on function delete_payment(bigint) from public, anon;
grant execute on function edit_payment(bigint, bigint, integer, timestamptz, text, text) to authenticated;
grant execute on function delete_payment(bigint) to authenticated;
