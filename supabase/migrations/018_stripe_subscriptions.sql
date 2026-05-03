-- Stripe Billing subscriptions (Checkout + Customer Portal / webhooks)
create table if not exists stripe_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_uid text not null,
  stripe_customer_id text,
  subscription_id text not null unique,
  status text not null,
  price_id text,
  raw jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_stripe_sub_user on stripe_subscriptions (user_uid);

comment on table stripe_subscriptions is 'Latest Stripe subscription per Stripe subscription_id; app access uses status (trialing/active).';

alter table stripe_subscriptions enable row level security;
