-- Persist a logical Checkout attempt before contacting Stripe so an uncertain
-- network retry can reuse the same idempotency key without pinning a listing
-- to one Checkout payload forever.

create table public.stripe_checkout_attempts (
  checkout_attempt_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.website_listings(id) on delete cascade,
  stripe_checkout_session_id text unique references public.stripe_checkout_sessions(id) on delete set null,
  checkout_status text not null default 'creating' check (checkout_status in (
    'creating', 'open', 'failed', 'abandoned', 'complete', 'expired'
  )),
  request_version text not null,
  checkout_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stripe_checkout_attempts_owner_started_idx
  on public.stripe_checkout_attempts (owner_id, checkout_started_at desc);
create index stripe_checkout_attempts_listing_started_idx
  on public.stripe_checkout_attempts (listing_id, checkout_started_at desc);
create unique index stripe_checkout_attempts_one_active_per_listing_idx
  on public.stripe_checkout_attempts (listing_id)
  where checkout_status in ('creating', 'open');

drop trigger if exists stripe_checkout_attempts_set_updated_at on public.stripe_checkout_attempts;
create trigger stripe_checkout_attempts_set_updated_at
  before update on public.stripe_checkout_attempts
  for each row execute function public.set_updated_at();

alter table public.stripe_checkout_attempts enable row level security;

create policy "Owners view their checkout attempts" on public.stripe_checkout_attempts
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());

grant select on public.stripe_checkout_attempts to authenticated;

-- Preserve resumability for sessions created before attempt IDs existed.
insert into public.stripe_checkout_attempts (
  owner_id,
  listing_id,
  stripe_checkout_session_id,
  checkout_status,
  request_version,
  checkout_started_at
)
select
  owner_id,
  listing_id,
  id,
  case status when 'open' then 'open' when 'complete' then 'complete' else 'expired' end,
  'legacy-listing-key-v1',
  created_at
from public.stripe_checkout_sessions
on conflict (stripe_checkout_session_id) do nothing;

comment on table public.stripe_checkout_attempts is 'Logical Stripe Checkout attempts. Creating attempts retain their UUID for safe retries after indeterminate network failures.';
comment on column public.stripe_checkout_attempts.request_version is 'Non-secret Checkout payload revision. Bump when intentional parameter changes require a fresh attempt.';
