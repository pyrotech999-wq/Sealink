-- Shared reply threads for area broadcasts: anyone who could see the original post can read/post.

create table if not exists broadcast_reply_threads (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references map_broadcasts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint broadcast_reply_threads_one_per_broadcast unique (broadcast_id)
);

create table if not exists broadcast_reply_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references broadcast_reply_threads (id) on delete cascade,
  sender_uid text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint broadcast_reply_messages_body_len check (char_length(body) between 1 and 4000)
);

create index if not exists idx_broadcast_reply_messages_thread_time
  on broadcast_reply_messages (thread_id, created_at desc);

alter table broadcast_reply_threads enable row level security;
alter table broadcast_reply_messages enable row level security;
