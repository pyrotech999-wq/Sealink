-- Man overboard alerts: visible to viewers within 10 mi (vs default ~5 mi area broadcasts).

alter table map_broadcasts
  add column if not exists is_mob boolean not null default false;
