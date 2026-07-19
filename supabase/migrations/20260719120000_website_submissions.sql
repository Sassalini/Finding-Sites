-- Website submission workflow. Apply after 20260716160000_initial_directory_schema.sql.

do $$ begin
  create type public.listing_revision_status as enum (
    'pending_review',
    'approved',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

alter table public.website_listings
  alter column category_id drop not null,
  add column if not exists category_request_id uuid references public.category_requests(id) on delete restrict,
  add column if not exists rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000);

alter table public.website_listings drop constraint if exists website_listings_category_choice;
alter table public.website_listings add constraint website_listings_category_choice check (
  (category_id is not null and category_request_id is null)
  or (category_id is null and category_request_id is not null and status <> 'approved')
);

-- The initial trigger used current_user inside a SECURITY DEFINER function.
-- current_user is the function owner in that context, so use session_user for
-- trusted SQL sessions and auth.role()/is_admin() for API requests instead.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if session_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role = 'member';
  elsif new.role is distinct from old.role or new.id is distinct from old.id then
    raise exception 'Only administrators can change profile roles or ownership';
  end if;
  return new;
end;
$$;

create table if not exists public.listing_revisions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.website_listings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete restrict,
  category_request_id uuid references public.category_requests(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  url text not null check (char_length(url) <= 2048 and url ~* '^https?://[^[:space:]]+$'),
  normalized_domain text not null check (
    normalized_domain = lower(normalized_domain)
    and normalized_domain ~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'
  ),
  short_description text not null check (char_length(short_description) between 20 and 240),
  status public.listing_revision_status not null default 'pending_review',
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint listing_revisions_category_choice check (
    (category_id is not null and category_request_id is null)
    or (category_id is null and category_request_id is not null and status <> 'approved')
  )
);

create unique index if not exists listing_revisions_one_pending_idx
  on public.listing_revisions (listing_id) where status = 'pending_review';
create index if not exists listing_revisions_owner_created_idx
  on public.listing_revisions (owner_id, created_at desc);

create or replace function public.has_likely_duplicate_domain(
  candidate_domain text,
  excluded_listing_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.website_listings listing
    where listing.id is distinct from excluded_listing_id
      and listing.status not in ('suspended', 'expired')
      and (
        listing.normalized_domain = candidate_domain
        or right(listing.normalized_domain, char_length(candidate_domain) + 1) = '.' || candidate_domain
        or right(candidate_domain, char_length(listing.normalized_domain) + 1) = '.' || listing.normalized_domain
      )
  ) or exists (
    select 1
    from public.listing_revisions revision
    where revision.listing_id is distinct from excluded_listing_id
      and revision.status = 'pending_review'
      and (
        revision.normalized_domain = candidate_domain
        or right(revision.normalized_domain, char_length(candidate_domain) + 1) = '.' || candidate_domain
        or right(candidate_domain, char_length(revision.normalized_domain) + 1) = '.' || revision.normalized_domain
      )
  );
$$;

revoke all on function public.has_likely_duplicate_domain(text, uuid) from public;
grant execute on function public.has_likely_duplicate_domain(text, uuid) to authenticated;

create or replace function public.protect_listing_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if session_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.owner_id is distinct from auth.uid() or new.status not in ('draft', 'pending_review') then
      raise exception 'Owners may only create their own drafts or submissions';
    end if;
    new.is_verified = false;
    new.is_featured = false;
    new.approved_at = null;
    new.published_at = null;
    new.rejection_reason = null;
    new.submitted_at = now();
  else
    if old.owner_id is distinct from auth.uid()
      or old.status not in ('draft', 'rejected')
      or new.owner_id is distinct from old.owner_id
      or new.is_verified is distinct from old.is_verified
      or new.is_featured is distinct from old.is_featured
      or new.approved_at is distinct from old.approved_at
      or new.published_at is distinct from old.published_at
      or new.rejection_reason is distinct from old.rejection_reason
      or new.status not in ('draft', 'pending_review') then
      raise exception 'Only drafts and rejected submissions may be edited by their owner';
    end if;
    if new.status = 'pending_review' and old.status <> 'pending_review' then
      new.submitted_at = now();
    else
      new.submitted_at = old.submitted_at;
    end if;
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.categories category
    where category.id = new.category_id and category.is_active
  ) then
    raise exception 'The selected category is not active';
  end if;

  if new.category_request_id is not null and not exists (
    select 1 from public.category_requests request
    where request.id = new.category_request_id
      and request.requested_by = auth.uid()
      and request.status = 'pending'
  ) then
    raise exception 'The requested category is not available to this owner';
  end if;

  if public.has_likely_duplicate_domain(
    new.normalized_domain,
    case when tg_op = 'UPDATE' then old.id else null end
  ) then
    raise exception 'This domain or a related subdomain already has a submission';
  end if;

  return new;
end;
$$;

create or replace function public.protect_listing_revision_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if session_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op <> 'INSERT'
    or new.owner_id is distinct from auth.uid()
    or new.status <> 'pending_review'
    or new.rejection_reason is not null
    or new.reviewed_at is not null
    or not exists (
      select 1 from public.website_listings listing
      where listing.id = new.listing_id
        and listing.owner_id = auth.uid()
        and listing.status = 'approved'
    ) then
    raise exception 'Owners may only propose revisions to their own approved listings';
  end if;

  if new.category_request_id is not null and not exists (
    select 1 from public.category_requests request
    where request.id = new.category_request_id
      and request.requested_by = auth.uid()
      and request.status = 'pending'
  ) then
    raise exception 'The requested category is not available to this owner';
  end if;


  if new.category_id is not null and not exists (
    select 1 from public.categories category
    where category.id = new.category_id and category.is_active
  ) then
    raise exception 'The selected category is not active';
  end if;

  if public.has_likely_duplicate_domain(new.normalized_domain, new.listing_id) then
    raise exception 'This domain or a related subdomain already has a submission';
  end if;

  return new;
end;
$$;

drop trigger if exists listing_revisions_protect_fields on public.listing_revisions;
create trigger listing_revisions_protect_fields
  before insert or update on public.listing_revisions
  for each row execute function public.protect_listing_revision_fields();

drop policy if exists "Owners update editable submissions" on public.website_listings;
create policy "Owners update editable submissions" on public.website_listings
  for update to authenticated
  using (owner_id = auth.uid() and status in ('draft', 'rejected'))
  with check (owner_id = auth.uid() and status in ('draft', 'pending_review'));

alter table public.listing_revisions enable row level security;

create policy "Owners view their listing revisions" on public.listing_revisions
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "Owners propose approved listing revisions" on public.listing_revisions
  for insert to authenticated with check (
    owner_id = auth.uid()
    and status = 'pending_review'
    and rejection_reason is null
    and reviewed_at is null
    and exists (
      select 1 from public.website_listings listing
      where listing.id = listing_id
        and listing.owner_id = auth.uid()
        and listing.status = 'approved'
    )
  );
create policy "Admins manage listing revisions" on public.listing_revisions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.listing_revisions to authenticated;
grant update, delete on public.category_requests to authenticated;
grant insert, update, delete on public.categories to authenticated;

comment on table public.listing_revisions is 'Owner-proposed changes to approved listings. The published listing remains unchanged until an admin accepts a revision.';
comment on function public.has_likely_duplicate_domain(text, uuid) is 'Returns only a boolean so duplicate detection does not expose another owner submission.';
