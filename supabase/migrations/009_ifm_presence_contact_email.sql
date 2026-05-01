-- Optional email on IFM for friend discovery (only stored when user opts in on the client).
alter table ifm_presence
  add column if not exists ifm_contact_email text not null default '';
