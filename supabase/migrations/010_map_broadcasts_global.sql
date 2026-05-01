-- When true, broadcast is shown to every viewer regardless of map position (~5 mi filter skipped).
alter table map_broadcasts
  add column if not exists is_global boolean not null default false;
