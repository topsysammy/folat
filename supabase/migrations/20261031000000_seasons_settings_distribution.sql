-- Web app round 2: payment method + note, editable settings, seasons
-- (archive a year and start fresh), and December distribution check-off.

-- ───────────────────────── seasons ─────────────────────────
-- One row per savings year. Payments and distributions belong to a season;
-- customers carry over. Only the current season (settings.current_season_id)
-- can be written to; closed seasons stay readable as an archive.
create table seasons (
  id                bigint generated always as identity primary key,
  name              text not null check (length(trim(name)) > 0),
  started_on        date not null,
  distribution_date date not null,
  closed_at         timestamptz,
  created_at        timestamptz not null default now()
);
insert into seasons (name, started_on, distribution_date)
select extract(year from s.distribution_date)::text,
       coalesce((select min(start_date) from customers), current_date),
       s.distribution_date
from settings s where s.id = 1;

alter table settings add column current_season_id bigint references seasons (id);
update settings set current_season_id = (select min(id) from seasons) where id = 1;

create or replace function current_season() returns bigint
language sql stable security definer set search_path = public as $$
  select current_season_id from settings where id = 1;
$$;

-- ───────────────────────── payments: season, method ─────────────────────────
alter table payments add column season_id bigint references seasons (id);
update payments set season_id = current_season();
alter table payments alter column season_id set not null;
alter table payments add column method text check (method in ('cash', 'transfer', 'pos', 'other'));
create index payments_season_idx on payments (season_id, id);

-- New rows land in the current season unless told otherwise (the WhatsApp
-- bot never sets season_id).
create or replace function payments_default_season() returns trigger
language plpgsql set search_path = public as $$
begin
  new.season_id := coalesce(new.season_id, current_season());
  return new;
end;
$$;
create trigger payments_default_season before insert on payments
  for each row execute function payments_default_season();

drop policy admin_insert on payments;
create policy admin_insert on payments for insert to authenticated
  with check (is_admin() and source = 'admin' and season_id = current_season());

-- Undo now copies the season and refuses payments from a closed season.
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
  if p.season_id <> current_season() then raise exception 'payments from a past season can''t be undone'; end if;
  insert into payments (customer_id, amount, source, reverses_payment_id, note, season_id)
  values (p.customer_id, -p.amount, 'undo', p.id, 'undone in web app', p.season_id)
  returning id into new_id;
  return new_id;
end;
$$;

-- ───────────────────────── settings: editable from the app ─────────────────────────
-- Column-level grant: the app can change the savings rules, never admin_email.
grant update (target, distribution_date, daily_amount, weekly_amount, monthly_amount) on settings to authenticated;
create policy admin_update on settings for update to authenticated using (is_admin()) with check (is_admin());

-- Keep the current season's distribution date in step with settings.
create or replace function settings_sync_season() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update seasons set distribution_date = new.distribution_date where id = new.current_season_id;
  return new;
end;
$$;
create trigger settings_sync_season after update of distribution_date on settings
  for each row execute function settings_sync_season();

alter table seasons enable row level security;
grant select on seasons to authenticated;
create policy admin_select on seasons for select to authenticated using (is_admin());

-- ───────────────────────── distributions ─────────────────────────
-- One row per customer per season: they collected their food. Deleting the
-- row un-ticks them (a mis-tap), so delete is allowed here.
create table distributions (
  id           bigint generated always as identity primary key,
  season_id    bigint not null references seasons (id),
  customer_id  bigint not null references customers (id),
  amount_saved integer not null,
  items        text,
  collected_at timestamptz not null default now(),
  unique (season_id, customer_id)
);
alter table distributions enable row level security;
grant select, insert, delete on distributions to authenticated;
create policy admin_select on distributions for select to authenticated using (is_admin());
create policy admin_insert on distributions for insert to authenticated
  with check (is_admin() and season_id = current_season());
create policy admin_delete on distributions for delete to authenticated
  using (is_admin() and season_id = current_season());

-- ───────────────────────── start_new_season ─────────────────────────
-- Closes the current season and opens a new one in one transaction.
-- Customers either carry over (their start date moves to the new season's
-- start) or are all marked removed. Old payments are untouched.
create or replace function start_new_season(
  p_name              text,
  p_started_on        date,
  p_distribution_date date,
  p_keep_customers    boolean
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  if p_distribution_date <= p_started_on then raise exception 'the distribution date must be after the start date'; end if;

  update seasons set closed_at = now() where id = current_season();
  insert into seasons (name, started_on, distribution_date)
  values (trim(p_name), p_started_on, p_distribution_date)
  returning id into new_id;

  update settings set current_season_id = new_id, distribution_date = p_distribution_date where id = 1;

  if p_keep_customers then
    update customers set start_date = p_started_on where active;
  else
    update customers set active = false where active;
  end if;
  return new_id;
end;
$$;

revoke all on function current_season() from public, anon;
revoke all on function start_new_season(text, date, date, boolean) from public, anon;
grant execute on function current_season() to authenticated, service_role; -- the insert trigger runs as the caller
grant execute on function start_new_season(text, date, date, boolean) to authenticated;
