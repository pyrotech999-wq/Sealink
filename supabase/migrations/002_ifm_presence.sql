-- IFM (International Friends Map) — shared presence so all app instances see the same peers.
-- Run in Supabase SQL Editor after 001_initial.sql.

create table if not exists ifm_presence (
  uid text primary key,
  lat double precision not null default 0,
  lng double precision not null default 0,
  full_name text not null default '',
  boat_name text not null default '',
  avatar_data_url text not null default '',
  phone_norm text not null default '',
  updated_at timestamptz not null default now(),
  share boolean not null default true
);

create index if not exists idx_ifm_presence_share_updated on ifm_presence (share, updated_at desc);

alter table ifm_presence enable row level security;
