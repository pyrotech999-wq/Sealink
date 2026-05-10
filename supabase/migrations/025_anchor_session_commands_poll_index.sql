-- Speeds monitor HTTP poll: same user, non-terminal rows, oldest first (matches list query shape).
create index if not exists idx_anchor_session_commands_poll_open
  on anchor_session_commands (user_uid, created_at asc)
  where status in ('queued', 'received');
