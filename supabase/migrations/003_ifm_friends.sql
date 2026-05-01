-- IFM friends list — shared across app instances (same pattern as ifm_presence).
-- Run in Supabase SQL Editor after 002_ifm_presence.sql (or whenever after 001).

create table if not exists ifm_friends (
  user_uid text not null,
  kind text not null check (kind in ('email', 'phone')),
  value text not null,
  added_at timestamptz not null default now(),
  primary key (user_uid, kind, value)
);

create index if not exists idx_ifm_friends_user_added on ifm_friends (user_uid, added_at desc);

alter table ifm_friends enable row level security;
