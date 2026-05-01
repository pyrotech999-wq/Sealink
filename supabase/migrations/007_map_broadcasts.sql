-- Area broadcasts (~5 mi radius on the home map). Replaces ephemeral serverless file storage.

create table if not exists map_broadcasts (
  id uuid primary key default gen_random_uuid(),
  author_uid text not null,
  lat double precision not null,
  lng double precision not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_map_broadcasts_created on map_broadcasts (created_at desc);
create index if not exists idx_map_broadcasts_author_created on map_broadcasts (author_uid, created_at desc);

alter table map_broadcasts enable row level security;
