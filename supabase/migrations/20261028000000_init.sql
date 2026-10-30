-- Savings Bot — Phase 1 schema (admin-only).
-- Money is whole naira (integer). Dates/times are stored in UTC; the bot
-- converts to Africa/Lagos (UTC+1, no daylight saving) in code.
-- Columns marked "Phase 2" are reserved for customers and unused for now.

-- ───────────────────────── settings (single row) ─────────────────────────
create table settings (
  id                    int primary key default 1 check (id = 1),
  target                integer not null default 150000 check (target > 0),
  distribution_date     date    not null default '2026-12-20',
  daily_amount          integer not null default 500   check (daily_amount > 0),
  weekly_amount         integer not null default 3500  check (weekly_amount > 0),
  monthly_amount        integer not null default 15000 check (monthly_amount > 0),
  admin_phone           text    not null default '',   -- 234XXXXXXXXXX, must match ADMIN_PHONE secret
  admin_last_inbound_at timestamptz,                   -- start of the 24h free reply window
  customers_enabled     boolean not null default false -- Phase 2 feature flag
);
insert into settings (id) values (1);

-- ───────────────────────── customers ─────────────────────────
create table customers (
  id              bigint generated always as identity primary key,
  name            text not null check (length(trim(name)) > 0),
  phone           text not null check (phone ~ '^234[0-9]{10}$'),
  plan            text not null check (plan in ('daily', 'weekly', 'monthly')),
  start_date      date not null,
  active          boolean not null default true,
  last_inbound_at timestamptz,                         -- Phase 2
  created_at      timestamptz not null default now()
);
-- No two active customers may share a name, so name lookups stay unambiguous.
create unique index customers_active_name_uniq on customers (lower(name)) where active;

-- ───────────────────────── payments ─────────────────────────
-- Never deleted. `undo` inserts a negative row (source 'undo') that points at
-- the payment it reverses, so sum(amount) is always the true total.
create table payments (
  id                  bigint generated always as identity primary key,
  customer_id         bigint not null references customers (id),
  amount              integer not null,
  status              text not null default 'confirmed'
                        check (status in ('confirmed', 'pending', 'rejected')), -- pending/rejected: Phase 2
  source              text not null default 'admin'
                        check (source in ('admin', 'undo', 'customer')),       -- customer: Phase 2
  proof_path          text,                                                    -- Phase 2
  proof_hash          text,                                                    -- Phase 2
  reject_reason       text,                                                    -- Phase 2
  note                text,
  reverses_payment_id bigint unique references payments (id),
  paid_at             timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  constraint payments_amount_sign check (
    (amount > 0 and source <> 'undo' and reverses_payment_id is null)
    or (amount < 0 and source = 'undo' and reverses_payment_id is not null)
  )
);
create index payments_customer_paid_idx on payments (customer_id, paid_at);
create index payments_paid_idx on payments (paid_at);

-- ───────────────────────── usage (reply budget) ─────────────────────────
create table usage (
  month            text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'), -- Lagos month, e.g. 2026-10
  admin_replies    integer not null default 0,
  customer_replies integer not null default 0                             -- Phase 2
);

-- ───────────────────────── bot_pending (YES/NO + pick-a-number) ─────────────────────────
create table bot_pending (
  phone      text primary key,
  action     text not null,          -- 'confirm' | 'choose'
  payload    jsonb not null default '{}',
  expires_at timestamptz not null
);

-- ───────────────────────── bot_log (duplicate guard + undo history) ─────────────────────────
-- One row per inbound WhatsApp message. Rows that saved something get
-- `action` + `payload` (what undo needs to reverse it).
create table bot_log (
  id         bigint generated always as identity primary key,
  message_id text not null unique,
  phone      text not null,
  action     text,
  payload    jsonb,
  reversed   boolean not null default false,
  created_at timestamptz not null default now()
);
create index bot_log_undoable_idx on bot_log (id desc)
  where action is not null and action <> 'undo' and not reversed;

-- ───────────────────────── outbox (Phase 2, unused) ─────────────────────────
create table outbox (
  id           bigint generated always as identity primary key,
  phone        text not null,
  body         text not null,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz
);

-- ───────────────────────── lock down ─────────────────────────
-- RLS on with no policies: only the Edge Function (service role) can touch data.
alter table settings    enable row level security;
alter table customers   enable row level security;
alter table payments    enable row level security;
alter table usage       enable row level security;
alter table bot_pending enable row level security;
alter table bot_log     enable row level security;
alter table outbox      enable row level security;

-- ───────────────────────── apply_action ─────────────────────────
-- Runs every data change in ONE transaction: the ops, the bot_log stamp, and
-- clearing the pending confirmation. Any error rolls everything back, so a
-- change is either fully saved or not saved at all.
create or replace function apply_action(
  p_message_id text,
  p_phone      text,
  p_action     text,
  p_payload    jsonb,
  p_ops        jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  op     jsonb;
  s      jsonb;
  result jsonb := '{}'::jsonb;
  new_id bigint;
  n      int;
begin
  for op in select * from jsonb_array_elements(p_ops) loop
    case op->>'op'
      when 'insert_customer' then
        insert into customers (name, phone, plan, start_date)
        values (op->>'name', op->>'phone', op->>'plan', (op->>'start_date')::date)
        returning id into new_id;
        result := result || jsonb_build_object('customer_id', new_id);

      when 'update_customer' then
        s := op->'set';
        update customers set
          name   = case when s ? 'name'   then s->>'name'               else name   end,
          phone  = case when s ? 'phone'  then s->>'phone'              else phone  end,
          plan   = case when s ? 'plan'   then s->>'plan'               else plan   end,
          active = case when s ? 'active' then (s->>'active')::boolean  else active end
        where id = (op->>'id')::bigint;
        get diagnostics n = row_count;
        if n <> 1 then raise exception 'customer % not found', op->>'id'; end if;

      when 'insert_payment' then
        insert into payments (customer_id, amount, source, note, reverses_payment_id, paid_at)
        values (
          (op->>'customer_id')::bigint,
          (op->>'amount')::integer,
          coalesce(op->>'source', 'admin'),
          op->>'note',
          (op->>'reverses_payment_id')::bigint,
          (op->>'paid_at')::timestamptz
        )
        returning id into new_id;
        result := result || jsonb_build_object('payment_id', new_id);

      when 'mark_reversed' then
        update bot_log set reversed = true
        where id = (op->>'log_id')::bigint and action is not null and not reversed;
        get diagnostics n = row_count;
        if n <> 1 then raise exception 'action % was already undone', op->>'log_id'; end if;

      else
        raise exception 'unknown op %', op->>'op';
    end case;
  end loop;

  update bot_log
     set action = p_action, payload = coalesce(p_payload, '{}'::jsonb) || result
   where message_id = p_message_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'bot_log row % missing', p_message_id; end if;

  delete from bot_pending where phone = p_phone;
  return result;
end;
$$;

-- ───────────────────────── reserve_reply ─────────────────────────
-- Atomically counts one reply against the monthly cap. Returns the new total
-- used this month, or NULL if the cap is already reached (caller must not send).
create or replace function reserve_reply(
  p_month    text,
  p_cap      integer,
  p_audience text default 'admin'
) returns integer
language plpgsql
set search_path = public
as $$
declare
  used integer;
begin
  insert into usage (month) values (p_month) on conflict (month) do nothing;
  update usage set
    admin_replies    = admin_replies    + case when p_audience = 'admin'    then 1 else 0 end,
    customer_replies = customer_replies + case when p_audience = 'customer' then 1 else 0 end
  where month = p_month and admin_replies + customer_replies < p_cap
  returning admin_replies + customer_replies into used;
  return used;
end;
$$;

revoke all on function apply_action(text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function reserve_reply(text, integer, text) from public, anon, authenticated;
grant execute on function apply_action(text, text, text, jsonb, jsonb) to service_role;
grant execute on function reserve_reply(text, integer, text) to service_role;
