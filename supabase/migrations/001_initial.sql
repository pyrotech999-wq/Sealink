-- SeaLink initial schema — run in Supabase SQL Editor (or supabase db push).
-- After this: Dashboard → Storage → New bucket `site-uploads` → Public bucket, 5MB limit, MIME image/jpeg, image/png, image/webp
-- Or uncomment the storage section below if your project allows SQL bucket creation.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Auth mirror (passwords hashed by app with scrypt — not Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists user_accounts (
  id uuid primary key default gen_random_uuid(),
  uid text not null unique,
  email text not null unique,
  password_hash jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_accounts_email on user_accounts (lower(email));

-- ---------------------------------------------------------------------------
-- Profile & sign-up fields (avatar URL points at Storage public object)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  user_uid text primary key references user_accounts (uid) on delete cascade,
  full_name text,
  boat_name text,
  phone text,
  age int,
  line1 text,
  line2 text,
  city text,
  postcode text,
  invited_emails text,
  location_access text,
  avatar_public_url text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Device limit (was account-devices.json)
-- ---------------------------------------------------------------------------
create table if not exists account_devices (
  user_uid text not null references user_accounts (uid) on delete cascade,
  device_id text not null,
  name text not null default '',
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  primary key (user_uid, device_id)
);

create index if not exists idx_account_devices_user on account_devices (user_uid);

-- ---------------------------------------------------------------------------
-- Vessel classifieds (was vessel-classifieds.json)
-- ---------------------------------------------------------------------------
create table if not exists vessel_listings (
  id uuid primary key,
  owner_uid text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  removed_at timestamptz,
  status text not null,
  payment_status text not null,
  payment_provider text,
  payment_ref text,
  category_id text not null,
  title text not null,
  description text not null,
  price_gbp numeric,
  location_label text,
  year int,
  length_ft numeric,
  make_model text,
  image_urls text[] not null default '{}'
);

create index if not exists idx_vessel_listings_owner on vessel_listings (owner_uid);
create index if not exists idx_vessel_listings_status_exp on vessel_listings (status, expires_at);

-- ---------------------------------------------------------------------------
-- Gear listings (was gear-listings.json)
-- ---------------------------------------------------------------------------
create table if not exists gear_listings (
  id uuid primary key,
  seller_uid text not null,
  kind text not null,
  title text not null,
  description text not null,
  category_id text not null,
  price_label text,
  image_urls text[] not null default '{}',
  created_at timestamptz not null,
  expires_at timestamptz not null,
  sold_at timestamptz,
  reminder_sent_at timestamptz
);

create index if not exists idx_gear_listings_seller on gear_listings (seller_uid);
create index if not exists idx_gear_listings_exp on gear_listings (expires_at);

-- ---------------------------------------------------------------------------
-- PayPal subscriptions (trial / billing record)
-- ---------------------------------------------------------------------------
create table if not exists paypal_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_uid text not null,
  subscription_id text not null unique,
  status text not null,
  plan text,
  raw jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_paypal_sub_user on paypal_subscriptions (user_uid);

-- ---------------------------------------------------------------------------
-- Optional: storage bucket (may require service_role; often easier via UI)
-- ---------------------------------------------------------------------------
-- insert into storage.buckets (id, name, public, file_size_limit)
-- values ('site-uploads', 'site-uploads', true, 5242880)
-- on conflict (id) do nothing;

alter table user_accounts enable row level security;
alter table profiles enable row level security;
alter table account_devices enable row level security;
alter table vessel_listings enable row level security;
alter table gear_listings enable row level security;
alter table paypal_subscriptions enable row level security;

-- No policies: anon/authenticated clients use your Next.js API only.
-- Service role (server) bypasses RLS.
