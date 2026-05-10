-- Tie queued commands to the active armed anchor (centre) and resolved monitor handset (server-owned).

alter table anchor_session_commands
  add column if not exists session_id text,
  add column if not exists target_device_id text;

create index if not exists idx_anchor_session_commands_user_session_status_created
  on anchor_session_commands (user_uid, session_id, status, created_at asc);
