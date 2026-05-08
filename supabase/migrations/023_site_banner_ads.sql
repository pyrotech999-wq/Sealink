-- Rotating site banner ads (bottom dock on selected pages). Managed via service role only.

create table if not exists site_banner_ads (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  link_url text not null,
  alt_text text not null default '',
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_site_banner_ads_enabled_sort on site_banner_ads (enabled, sort_order, id);

alter table site_banner_ads enable row level security;
