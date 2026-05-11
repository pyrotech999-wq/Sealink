-- Per-user Telegram chat ID for anchor geofence alerts.
alter table anchor_geofence_config
  add column if not exists telegram_chat_id text;
