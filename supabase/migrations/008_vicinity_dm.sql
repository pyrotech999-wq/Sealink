-- Direct messages between users (started from area broadcast “Reply”).

create table if not exists vicinity_dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a text not null,
  user_b text not null,
  created_at timestamptz not null default now(),
  constraint vicinity_dm_threads_ordered check (user_a < user_b),
  constraint vicinity_dm_threads_distinct check (user_a <> user_b)
);

create unique index if not exists idx_vicinity_dm_threads_pair on vicinity_dm_threads (user_a, user_b);

create table if not exists vicinity_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references vicinity_dm_threads (id) on delete cascade,
  sender_uid text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint vicinity_dm_messages_body_len check (char_length(body) between 1 and 4000)
);

create index if not exists idx_vicinity_dm_messages_thread_time on vicinity_dm_messages (thread_id, created_at desc);

alter table vicinity_dm_threads enable row level security;
alter table vicinity_dm_messages enable row level security;
