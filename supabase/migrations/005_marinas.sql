-- Worldwide marina POIs (e.g. imported from OpenStreetMap). Optional: seed rows can use source = 'seed'.

create table if not exists marinas (
  id text primary key,
  source text not null default 'osm' check (source in ('osm', 'seed', 'manual')),
  osm_type text,
  osm_id bigint,
  name text not null,
  harbour text not null default '',
  region text not null default '',
  country text not null default '',
  country_code text,
  lat double precision not null,
  lng double precision not null,
  price_from_eur int,
  max_length_m double precision,
  depth_m double precision,
  facilities text[] not null default '{}',
  description text not null default '',
  phone text not null default '',
  raw_tags jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marinas_country on marinas (country);
create index if not exists idx_marinas_country_code on marinas (country_code);
create index if not exists idx_marinas_lat on marinas (lat);
create index if not exists idx_marinas_lng on marinas (lng);
create index if not exists idx_marinas_name_search on marinas (lower(name));

create unique index if not exists idx_marinas_osm_unique on marinas (osm_type, osm_id)
  where osm_type is not null and osm_id is not null;

alter table marinas enable row level security;
