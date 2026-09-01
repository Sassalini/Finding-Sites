-- Centralise listing-slot accounting and distinguish owner deletion from moderation.

create or replace function public.is_slot_occupying_listing(
  candidate_status public.listing_status,
  candidate_deleted_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate_deleted_at is null and candidate_status in (
    'draft', 'checkout_pending', 'pending_review', 'approved',
    'changes_requested', 'suspended', 'subscription_inactive'
  );
$$;

create or replace function public.count_slot_occupying_listings(
  candidate_owner_id uuid,
  excluded_listing_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  used_slots integer;
begin
  if candidate_owner_id is null then return 0; end if;
  if auth.role() <> 'service_role'
    and not public.is_admin()
    and auth.uid() is distinct from candidate_owner_id then
    raise exception 'LISTING_SLOT_COUNT_NOT_AUTHORIZED';
  end if;

  select count(*)::integer into used_slots
  from public.website_listings listing
  where listing.owner_id = candidate_owner_id
    and listing.id is distinct from excluded_listing_id
    and public.is_slot_occupying_listing(listing.status, listing.deleted_at);
  return used_slots;
end;
$$;

revoke all on function public.is_slot_occupying_listing(public.listing_status, timestamptz) from public;
revoke all on function public.count_slot_occupying_listings(uuid, uuid) from public, anon;
grant execute on function public.count_slot_occupying_listings(uuid, uuid) to authenticated, service_role;

create or replace function public.enforce_listing_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  used_slots integer;
  new_is_countable boolean;
  old_is_countable boolean := false;
begin
  if new.owner_id is null then return new; end if;
  new_is_countable := public.is_slot_occupying_listing(new.status, new.deleted_at);
  if tg_op = 'UPDATE' then
    old_is_countable := public.is_slot_occupying_listing(old.status, old.deleted_at);
  end if;
  if not new_is_countable
    or (tg_op = 'UPDATE' and old_is_countable and new.owner_id = old.owner_id) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  used_slots := public.count_slot_occupying_listings(new.owner_id, new.id);
  if used_slots >= 2 then
    raise exception using errcode = 'P0001', message = 'LISTING_LIMIT_REACHED';
  end if;
  return new;
end;
$$;

-- Older deployments allowed an owner to delete a moderated record. Restore the
-- private restricted record so it remains visible to its owner and keeps its slot.
update public.website_listings
set status = 'suspended', deleted_at = null
where moderation_status = 'removed'
  and (status = 'deleted' or deleted_at is not null);

create or replace function public.protect_admin_restricted_listing_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if session_user in ('postgres', 'supabase_admin')
    or auth.role() = 'service_role'
    or public.is_admin()
    or current_setting('app.account_deletion', true) = 'true' then
    return new;
  end if;

  if (old.moderation_status = 'removed' or old.status in ('suspended', 'permanently_rejected'))
    and (new.status = 'deleted' or new.deleted_at is not null) then
    raise exception using errcode = 'P0001', message = 'ADMIN_RESTRICTED_LISTING_CANNOT_BE_DELETED';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_protect_admin_restricted_deletion on public.website_listings;
create trigger listings_protect_admin_restricted_deletion
  before update of status, deleted_at on public.website_listings
  for each row execute function public.protect_admin_restricted_listing_deletion();

create or replace function public.soft_delete_owned_listing(candidate_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if exists (
    select 1 from public.website_listings listing
    where listing.id = candidate_listing_id
      and listing.owner_id = auth.uid()
      and (listing.moderation_status = 'removed' or listing.status in ('suspended', 'permanently_rejected'))
  ) then
    raise exception using errcode = 'P0001', message = 'ADMIN_RESTRICTED_LISTING_CANNOT_BE_DELETED';
  end if;

  update public.website_listings
  set status = 'deleted', deleted_at = now(), published_at = null
  where id = candidate_listing_id
    and owner_id = auth.uid()
    and status <> 'deleted'
    and moderation_status = 'active';
  if not found then raise exception 'Listing not found'; end if;
end;
$$;

revoke all on function public.soft_delete_owned_listing(uuid) from public, anon;
grant execute on function public.soft_delete_owned_listing(uuid) to authenticated;

-- The initial schema used a global unique constraint, which made an
-- owner-deleted domain impossible to reuse. Retain database uniqueness only for
-- current or administratively restricted records.
alter table public.website_listings
  drop constraint if exists website_listings_normalized_domain_key;

drop index if exists public.website_listings_current_normalized_domain_idx;
create unique index website_listings_current_normalized_domain_idx
  on public.website_listings (normalized_domain)
  where moderation_status = 'removed'
    or status in ('suspended', 'permanently_rejected')
    or (
      deleted_at is null
      and status not in ('deleted', 'expired', 'suspended', 'permanently_rejected')
    );

create or replace function public.get_domain_submission_conflict(
  candidate_domain text,
  excluded_listing_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  clean_domain text := lower(btrim(candidate_domain));
begin
  if clean_domain is null or clean_domain = '' then return 'none'; end if;

  if exists (
    select 1
    from public.website_listings listing
    where listing.id is distinct from excluded_listing_id
      and (listing.moderation_status = 'removed' or listing.status in ('suspended', 'permanently_rejected'))
      and (
        listing.normalized_domain = clean_domain
        or right(listing.normalized_domain, char_length(clean_domain) + 1) = '.' || clean_domain
        or right(clean_domain, char_length(listing.normalized_domain) + 1) = '.' || listing.normalized_domain
      )
  ) or exists (
    select 1
    from public.listing_revisions revision
    join public.website_listings parent on parent.id = revision.listing_id
    where parent.id is distinct from excluded_listing_id
      and revision.status = 'pending_review'
      and (parent.moderation_status = 'removed' or parent.status in ('suspended', 'permanently_rejected'))
      and (
        revision.normalized_domain = clean_domain
        or right(revision.normalized_domain, char_length(clean_domain) + 1) = '.' || clean_domain
        or right(clean_domain, char_length(revision.normalized_domain) + 1) = '.' || revision.normalized_domain
      )
  ) then
    return 'moderated';
  end if;

  if exists (
    select 1
    from public.website_listings listing
    where listing.id is distinct from excluded_listing_id
      and listing.deleted_at is null
      and listing.moderation_status = 'active'
      and listing.status not in ('deleted', 'expired', 'suspended', 'permanently_rejected')
      and (
        listing.normalized_domain = clean_domain
        or right(listing.normalized_domain, char_length(clean_domain) + 1) = '.' || clean_domain
        or right(clean_domain, char_length(listing.normalized_domain) + 1) = '.' || listing.normalized_domain
      )
  ) or exists (
    select 1
    from public.listing_revisions revision
    join public.website_listings parent on parent.id = revision.listing_id
    where parent.id is distinct from excluded_listing_id
      and revision.status = 'pending_review'
      and parent.deleted_at is null
      and parent.moderation_status = 'active'
      and parent.status not in ('deleted', 'expired', 'suspended', 'permanently_rejected')
      and (
        revision.normalized_domain = clean_domain
        or right(revision.normalized_domain, char_length(clean_domain) + 1) = '.' || clean_domain
        or right(clean_domain, char_length(revision.normalized_domain) + 1) = '.' || revision.normalized_domain
      )
  ) then
    return 'current';
  end if;

  return 'none';
end;
$$;

create or replace function public.has_likely_duplicate_domain(
  candidate_domain text,
  excluded_listing_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select public.get_domain_submission_conflict(candidate_domain, excluded_listing_id) <> 'none';
$$;

revoke all on function public.get_domain_submission_conflict(text, uuid) from public, anon;
revoke all on function public.has_likely_duplicate_domain(text, uuid) from public, anon;
grant execute on function public.get_domain_submission_conflict(text, uuid) to authenticated, service_role;
grant execute on function public.has_likely_duplicate_domain(text, uuid) to authenticated, service_role;

create or replace function public.finalize_listing_after_entitlement(
  candidate_listing_id uuid,
  candidate_owner_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  listing public.website_listings%rowtype;
  used_slots integer;
  now_at timestamptz := now();
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'Administrator or service role required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(candidate_owner_id::text, 0));
  select * into listing from public.website_listings
  where id = candidate_listing_id and owner_id = candidate_owner_id
  for update;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;
  if listing.status in ('deleted', 'suspended', 'permanently_rejected', 'expired')
    or listing.deleted_at is not null
    or listing.moderation_status = 'removed'
    or listing.removed_at is not null then
    raise exception 'LISTING_NOT_FINALIZABLE';
  end if;
  if listing.status = 'approved' then return 'approved'; end if;
  if listing.status not in ('draft', 'checkout_pending', 'pending_review', 'changes_requested') then
    raise exception 'LISTING_NOT_FINALIZABLE';
  end if;
  if not listing.ownership_confirmed or not listing.terms_accepted or listing.contact_email is null then
    raise exception 'LISTING_VALIDATION_INCOMPLETE';
  end if;
  if not public.has_qualifying_listing_subscription(candidate_owner_id) then
    raise exception 'LISTING_ENTITLEMENT_REQUIRED';
  end if;

  used_slots := public.count_slot_occupying_listings(candidate_owner_id);
  if used_slots > 2 then raise exception 'LISTING_LIMIT_REACHED'; end if;

  if listing.category_id is not null and listing.category_request_id is null then
    if not exists (
      select 1 from public.categories category
      where category.id = listing.category_id and category.is_active
    ) then raise exception 'CATEGORY_NOT_ACTIVE'; end if;
    update public.website_listings set
      status = 'approved',
      approved_at = now_at,
      published_at = now_at,
      submitted_at = now_at,
      rejection_reason = null,
      approval_source = 'automatic_existing_category',
      subscription_inactive_at = null,
      inactive_from_status = null
    where id = listing.id;
    return 'approved';
  end if;

  if listing.category_id is null and listing.category_request_id is not null then
    if not exists (
      select 1 from public.category_requests request
      where request.id = listing.category_request_id
        and request.requested_by = candidate_owner_id
        and request.status = 'pending'
    ) then raise exception 'CATEGORY_REQUEST_NOT_PENDING'; end if;
    update public.website_listings set
      status = 'pending_review',
      submitted_at = now_at,
      approved_at = null,
      published_at = null,
      rejection_reason = null,
      approval_source = null
    where id = listing.id;
    return 'pending_review';
  end if;

  raise exception 'INVALID_CATEGORY_MODE';
end;
$$;

revoke all on function public.finalize_listing_after_entitlement(uuid, uuid) from public;
grant execute on function public.finalize_listing_after_entitlement(uuid, uuid) to service_role;

comment on function public.count_slot_occupying_listings(uuid, uuid) is
  'Authoritative two-listing slot count. Owner-deleted and terminal historical records do not occupy a slot.';
comment on function public.get_domain_submission_conflict(text, uuid) is
  'Returns none, current, or moderated without exposing listing ownership or private moderation details.';
comment on index public.website_listings_current_normalized_domain_idx is
  'Exact-domain uniqueness for current and administratively restricted listings; owner-deleted domains may be reused.';
