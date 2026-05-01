/* Anchor alert cross-device state (was local JSON; required for serverless / multi-instance) */

create table if not exists anchor_devices (
  user_uid text not null references user_accounts (uid) on delete cascade,
  device_id text not null,
  name text not null default 'This device',
  updated_at timestamptz not null default now(),
  last_lat double precision,
  last_lng double precision,
  last_fix_at timestamptz,
  primary key (user_uid, device_id)
);

create index if not exists idx_anchor_devices_user on anchor_devices (user_uid);
create index if not exists idx_anchor_devices_stale on anchor_devices (updated_at);

create table if not exists anchor_monitor_config (
  user_uid text primary key references user_accounts (uid) on delete cascade,
  monitor_device_id text,
  alert_device_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists anchor_alerts (
  id uuid primary key,
  user_uid text not null references user_accounts (uid) on delete cascade,
  created_at timestamptz not null default now(),
  message text not null,
  seen_at timestamptz,
  kind text not null default 'alert',
  expires_at timestamptz
);

create index if not exists idx_anchor_alerts_user_created on anchor_alerts (user_uid, created_at desc);

alter table anchor_devices enable row level security;
alter table anchor_monitor_config enable row level security;
alter table anchor_alerts enable row level security;
