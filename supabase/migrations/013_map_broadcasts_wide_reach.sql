-- Area broadcasts that use the same ~10 mi radius as MOB (e.g. MOB cancellation notices).

alter table map_broadcasts
  add column if not exists wide_area_reach boolean not null default false;
