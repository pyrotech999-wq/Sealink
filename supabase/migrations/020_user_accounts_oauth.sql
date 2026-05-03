-- OAuth sign-in (Google / Apple / Facebook) alongside email+password accounts.
-- Run in Supabase SQL Editor after deploying app code that reads these columns.

alter table user_accounts
  add column if not exists oauth_provider text,
  add column if not exists oauth_sub text;

create unique index if not exists user_accounts_oauth_provider_sub_key
  on user_accounts (oauth_provider, oauth_sub)
  where oauth_sub is not null and oauth_provider is not null;
