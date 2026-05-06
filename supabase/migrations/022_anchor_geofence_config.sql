-- Server-backed anchor geofence config (cross-device reset + sync)
create table if not exists anchor_geofence_config (
  user_uid text primary key references user_accounts (uid) on delete cascade,
  armed boolean not null default false,
  anchor_lat double precision,
  anchor_lng double precision,
  radius_m int not null default 20,
  angle_deg int not null default 360,
  monitor_device_id text not null default 'this',
  last_bearing_deg double precision,
  last_alert_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_anchor_geofence_updated on anchor_geofence_config (updated_at);

alter table anchor_geofence_config enable row level security;

