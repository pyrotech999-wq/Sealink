-- Add contact details to vessel listings
alter table vessel_listings
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists contact_phone_public boolean not null default false;

create index if not exists idx_vessel_listings_contact_email on vessel_listings (contact_email);
