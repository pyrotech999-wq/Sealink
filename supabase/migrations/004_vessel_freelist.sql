-- Free vessel listing slots (promo codes + per-user balance). Server uses service role only.

create table if not exists vessel_listing_slot_balances (
  user_uid text primary key,
  balance int not null default 0 check (balance >= 0)
);

create table if not exists vessel_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code_norm text not null unique,
  label text,
  max_uses int not null default 10 check (max_uses > 0),
  uses int not null default 0 check (uses >= 0),
  slots_per_redeem int not null default 1 check (slots_per_redeem > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists vessel_promo_redemptions (
  promo_id uuid not null references vessel_promo_codes (id) on delete cascade,
  user_uid text not null,
  redeemed_at timestamptz not null default now(),
  primary key (promo_id, user_uid)
);

create index if not exists idx_vessel_promo_redemptions_user on vessel_promo_redemptions (user_uid);

alter table vessel_listing_slot_balances enable row level security;
alter table vessel_promo_codes enable row level security;
alter table vessel_promo_redemptions enable row level security;

create or replace function redeem_vessel_promo(p_code_norm text, p_user_uid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  promo vessel_promo_codes%rowtype;
begin
  select * into promo from vessel_promo_codes
  where code_norm = upper(trim(p_code_norm))
    and (expires_at is null or expires_at > now());
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Invalid or expired code');
  end if;

  if promo.uses >= promo.max_uses then
    return jsonb_build_object('ok', false, 'error', 'This code has no uses left');
  end if;

  if exists (
    select 1 from vessel_promo_redemptions r
    where r.promo_id = promo.id and r.user_uid = p_user_uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'You have already redeemed this code');
  end if;

  insert into vessel_promo_redemptions (promo_id, user_uid) values (promo.id, p_user_uid);

  update vessel_promo_codes
  set uses = uses + 1
  where id = promo.id and uses < max_uses;

  if not found then
    delete from vessel_promo_redemptions where promo_id = promo.id and user_uid = p_user_uid;
    return jsonb_build_object('ok', false, 'error', 'This code has no uses left');
  end if;

  insert into vessel_listing_slot_balances as b (user_uid, balance)
  values (p_user_uid, promo.slots_per_redeem)
  on conflict (user_uid) do update
  set balance = b.balance + excluded.balance;

  return jsonb_build_object('ok', true, 'slotsAdded', promo.slots_per_redeem);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'You have already redeemed this code');
end;
$$;

create or replace function consume_vessel_listing_slot(p_user_uid text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with u as (
    update vessel_listing_slot_balances
    set balance = balance - 1
    where user_uid = p_user_uid and balance > 0
    returning user_uid
  )
  select exists(select 1 from u);
$$;
