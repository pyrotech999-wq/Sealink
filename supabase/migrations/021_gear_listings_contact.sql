-- Add contact details to gear listings
alter table gear_listings
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists contact_phone_public boolean not null default false;

create index if not exists idx_gear_listings_contact_email on gear_listings (contact_email);

