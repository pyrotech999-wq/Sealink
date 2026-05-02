-- Admin-only: grant subscription benefits without PayPal (complementary access).
alter table profiles
  add column if not exists admin_granted_free_access boolean not null default false;

comment on column profiles.admin_granted_free_access is 'Site admin may set true so this user has plan benefits without an active PayPal subscription.';
