-- Subscription-backed submission workflow. Apply after the website submissions migration.

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text not null unique,
  status text not null check (status in (
    'active', 'trialing', 'incomplete', 'incomplete_expired', 'past_due',
    'canceled', 'unpaid', 'paused'
  )),
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_checkout_sessions (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.website_listings(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'complete', 'expired')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists checkout_sessions_owner_created_idx
  on public.stripe_checkout_sessions (owner_id, created_at desc);
create index if not exists checkout_sessions_listing_idx
  on public.stripe_checkout_sessions (listing_id);
create unique index if not exists checkout_sessions_one_open_per_listing_idx
  on public.stripe_checkout_sessions (listing_id) where status = 'open';

drop trigger if exists billing_subscriptions_set_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_set_updated_at
  before update on public.billing_subscriptions
  for each row execute function public.set_updated_at();

alter table public.billing_subscriptions enable row level security;
alter table public.stripe_checkout_sessions enable row level security;
alter table public.stripe_webhook_events enable row level security;

create policy "Owners view their subscription" on public.billing_subscriptions
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "Owners view their checkout sessions" on public.stripe_checkout_sessions
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "Admins inspect Stripe webhook events" on public.stripe_webhook_events
  for select to authenticated using (public.is_admin());

grant select on public.billing_subscriptions, public.stripe_checkout_sessions to authenticated;
grant select on public.stripe_webhook_events to authenticated;

comment on table public.billing_subscriptions is 'Stripe-owned subscription state mirrored by verified webhooks. Only trusted service-role code writes this table.';
comment on table public.stripe_checkout_sessions is 'Server-created Stripe Checkout sessions tied to an authenticated owner and draft listing.';
comment on table public.stripe_webhook_events is 'Idempotency ledger for verified Stripe webhook events.';
