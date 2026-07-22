-- Extend the account, listing and subscription records for the two-site plan.
-- Enum additions are isolated so PostgreSQL can commit them before later
-- functions and policies reference the new values.

alter type public.listing_status add value if not exists 'checkout_pending';
alter type public.listing_status add value if not exists 'changes_requested';
alter type public.listing_status add value if not exists 'subscription_inactive';
alter type public.listing_status add value if not exists 'deleted';
alter type public.listing_status add value if not exists 'permanently_rejected';

alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists deletion_requested_at timestamptz;
create unique index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

alter table public.billing_subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists grace_period_end timestamptz,
  add column if not exists trial_entitlement boolean not null default false;

alter table public.website_listings
  add column if not exists contact_email text,
  add column if not exists ownership_confirmed boolean not null default false,
  add column if not exists terms_accepted boolean not null default false,
  add column if not exists subscription_inactive_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists inactive_from_status text,
  add column if not exists created_at timestamptz not null default now();

alter table public.website_listings drop constraint if exists website_listings_contact_email;
alter table public.website_listings add constraint website_listings_contact_email check (
  contact_email is null or (char_length(contact_email) <= 320 and contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
alter table public.website_listings drop constraint if exists website_listings_inactive_from_status;
alter table public.website_listings add constraint website_listings_inactive_from_status check (
  inactive_from_status is null or inactive_from_status in ('approved', 'pending_review', 'draft', 'changes_requested')
);

alter table public.listing_revisions
  add column if not exists full_description text,
  add column if not exists contact_email text,
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists review_notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.stripe_webhook_events
  add column if not exists processing_error text,
  add column if not exists created_at timestamptz not null default now();

comment on column public.billing_subscriptions.grace_period_end is 'Seven-day public-listing grace window set after a failed recurring payment.';
comment on column public.website_listings.inactive_from_status is 'Previous eligible status used to restore unchanged listings after subscription reactivation.';
