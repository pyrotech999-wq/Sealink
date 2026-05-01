-- Callback number for MOB alerts (E.164-style digits for tel: links).

alter table map_broadcasts
  add column if not exists mob_phone text;
