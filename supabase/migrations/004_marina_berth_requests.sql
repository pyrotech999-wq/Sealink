-- Saved berth requests (pre-booking workflow). Requires user_accounts from 001_initial.sql.

create table if not exists marina_berth_requests (
  id uuid primary key default gen_random_uuid(),
  user_uid text not null references user_accounts (uid) on delete cascade,
  user_email text not null,
  marina_id text not null,
  marina_name text not null,
  marina_phone text not null default '',
  arrival date not null,
  departure date not null,
  boat_length_m double precision,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marina_berth_requests_user on marina_berth_requests (user_uid, created_at desc);
create index if not exists idx_marina_berth_requests_marina on marina_berth_requests (marina_id, created_at desc);

alter table marina_berth_requests enable row level security;
