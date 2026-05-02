-- Area broadcast audience: everyone nearby (default), IFM friends within ~5 mi, or IFM friends worldwide.

alter table map_broadcasts
  add column if not exists audience text not null default 'all_nearby';

alter table map_broadcasts
  drop constraint if exists map_broadcasts_audience_check;

alter table map_broadcasts
  add constraint map_broadcasts_audience_check check (audience in ('all_nearby', 'friends_nearby', 'friends_global'));

create index if not exists idx_map_broadcasts_audience on map_broadcasts (audience);
