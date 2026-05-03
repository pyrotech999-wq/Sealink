-- Per-viewer read state for shared area-broadcast reply threads (new-reply alerts).

create table if not exists broadcast_reply_seen (
  viewer_uid text not null,
  broadcast_id uuid not null references map_broadcasts (id) on delete cascade,
  last_seen_at timestamptz not null,
  primary key (viewer_uid, broadcast_id)
);

create index if not exists idx_broadcast_reply_seen_viewer on broadcast_reply_seen (viewer_uid);

alter table broadcast_reply_seen enable row level security;

comment on table broadcast_reply_seen is 'Updated when viewer opens thread or taps Seen; alerts when reply messages exist newer than last_seen_at.';
