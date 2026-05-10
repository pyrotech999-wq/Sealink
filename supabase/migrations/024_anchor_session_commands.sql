-- Remote → boat anchor session commands (queue); silence flag on shared geofence row

alter table anchor_geofence_config
  add column if not exists remote_alarm_silenced_until_reset boolean not null default false;

create table if not exists anchor_session_commands (
  id uuid primary key default gen_random_uuid(),
  user_uid text not null references user_accounts (uid) on delete cascade,
  command_type text not null check (command_type in ('INCREASE_RADIUS', 'RESET_ANCHOR', 'SILENCE_UNTIL_RESET')),
  meters int,
  status text not null default 'queued' check (status in ('queued', 'received', 'applied', 'failed')),
  source_device_id text not null,
  error_message text,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists idx_anchor_session_commands_user_status_created
  on anchor_session_commands (user_uid, status, created_at asc);

alter table anchor_session_commands enable row level security;
