-- Race-safe listing limits, entitlement-aware public reads and safe account operations.

update public.website_listings set status = 'changes_requested' where status = 'rejected';

drop policy if exists "Admins inspect Stripe webhook events" on public.stripe_webhook_events;
revoke select on public.stripe_webhook_events from authenticated;

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
  if current_setting('app.account_deletion', true) = 'true' then return new; end if;

  if tg_op = 'INSERT' then
    if new.owner_id is distinct from auth.uid() or new.status <> 'draft' then
      raise exception 'Owners may only create their own drafts';
    end if;
    new.is_verified = false;
    new.is_featured = false;
    new.approved_at = null;
    new.published_at = null;
    new.rejection_reason = null;
    new.subscription_inactive_at = null;
    new.deleted_at = null;
    new.inactive_from_status = null;
  else
    if old.owner_id is distinct from auth.uid() then
      raise exception 'Only the listing owner may edit this record';
    end if;

    if new.status = 'deleted' and old.status <> 'deleted' then
      if new.owner_id is distinct from old.owner_id
        or new.category_id is distinct from old.category_id
        or new.category_request_id is distinct from old.category_request_id
        or new.name is distinct from old.name
        or new.slug is distinct from old.slug
        or new.url is distinct from old.url
        or new.normalized_domain is distinct from old.normalized_domain
        or new.short_description is distinct from old.short_description
        or new.full_description is distinct from old.full_description
        or new.contact_email is distinct from old.contact_email
        or new.is_verified is distinct from old.is_verified
        or new.is_featured is distinct from old.is_featured
        or new.approved_at is distinct from old.approved_at then
        raise exception 'Deletion may not alter listing content or administrative fields';
      end if;
      new.deleted_at = coalesce(new.deleted_at, now());
      new.published_at = null;
      return new;
    end if;

    if old.status not in ('draft', 'pending_review', 'changes_requested')
      or new.owner_id is distinct from old.owner_id
      or new.is_verified is distinct from old.is_verified
      or new.is_featured is distinct from old.is_featured
      or new.approved_at is distinct from old.approved_at
      or new.published_at is distinct from old.published_at
      or new.subscription_inactive_at is distinct from old.subscription_inactive_at
      or new.deleted_at is distinct from old.deleted_at
      or new.inactive_from_status is distinct from old.inactive_from_status
      or new.status not in ('draft', 'pending_review') then
      raise exception 'Only editable submission fields may be changed by the owner';
    end if;
    if new.status = 'pending_review' then
      if not new.ownership_confirmed or not new.terms_accepted or new.contact_email is null then
        raise exception 'Ownership, terms and a contact email are required before review';
      end if;
      new.submitted_at = now();
    end if;
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.categories category where category.id = new.category_id and category.is_active
  ) then raise exception 'The selected category is not active'; end if;
  if new.category_request_id is not null and not exists (
    select 1 from public.category_requests request
    where request.id = new.category_request_id and request.requested_by = auth.uid() and request.status = 'pending'
  ) then raise exception 'The requested category is not available to this owner'; end if;
  if public.has_likely_duplicate_domain(new.normalized_domain, case when tg_op = 'UPDATE' then old.id else null end) then
    raise exception 'This domain or a related subdomain already has a submission';
  end if;
  return new;
end;
$$;

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
  if current_setting('app.account_deletion', true) = 'true' then return new; end if;
  if tg_op = 'INSERT' then
    new.role = 'member';
    new.stripe_customer_id = null;
    new.deletion_requested_at = null;
  elsif new.role is distinct from old.role
    or new.id is distinct from old.id
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.deletion_requested_at is distinct from old.deletion_requested_at then
    raise exception 'Protected profile fields may only be changed by trusted server code';
  end if;
  return new;
end;
$$;

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
  new_is_countable := new.deleted_at is null and new.status in (
    'draft', 'checkout_pending', 'pending_review', 'approved',
    'changes_requested', 'suspended', 'subscription_inactive'
  );
  if tg_op = 'UPDATE' then
    old_is_countable := old.deleted_at is null and old.status in (
      'draft', 'checkout_pending', 'pending_review', 'approved',
      'changes_requested', 'suspended', 'subscription_inactive'
    );
  end if;
  if not new_is_countable or (tg_op = 'UPDATE' and old_is_countable and new.owner_id = old.owner_id) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  select count(*) into used_slots
  from public.website_listings listing
  where listing.owner_id = new.owner_id
    and listing.id is distinct from new.id
    and listing.deleted_at is null
    and listing.status in (
      'draft', 'checkout_pending', 'pending_review', 'approved',
      'changes_requested', 'suspended', 'subscription_inactive'
    );
  if used_slots >= 2 then
    raise exception using errcode = 'P0001', message = 'LISTING_LIMIT_REACHED';
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
  if session_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' or public.is_admin() then return new; end if;
  if tg_op <> 'INSERT'
    or new.owner_id is distinct from auth.uid()
    or new.status <> 'pending_review'
    or new.rejection_reason is not null
    or new.reviewed_at is not null
    or new.reviewed_by is not null
    or new.review_notes is not null
    or not exists (
      select 1 from public.website_listings listing
      where listing.id = new.listing_id and listing.owner_id = auth.uid() and listing.status = 'approved'
    ) then
    raise exception 'Owners may only propose unreviewed revisions to their own approved listings';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories category where category.id = new.category_id and category.is_active
  ) then raise exception 'The selected category is not active'; end if;
  if new.category_request_id is not null and not exists (
    select 1 from public.category_requests request
    where request.id = new.category_request_id and request.requested_by = auth.uid() and request.status = 'pending'
  ) then raise exception 'The requested category is not available to this owner'; end if;
  if public.has_likely_duplicate_domain(new.normalized_domain, new.listing_id) then
    raise exception 'This domain or a related subdomain already has a submission';
  end if;
  new.submitted_at = now();
  return new;
end;
$$;

drop trigger if exists listings_enforce_limit on public.website_listings;
create trigger listings_enforce_limit
  before insert or update of owner_id, status, deleted_at on public.website_listings
  for each row execute function public.enforce_listing_limit();

create or replace function public.has_current_listing_entitlement(candidate_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1 from public.billing_subscriptions subscription
    where subscription.owner_id = candidate_owner_id
      and (
        subscription.status = 'active'
        or (subscription.status = 'trialing' and subscription.trial_entitlement)
        or (subscription.status = 'canceled' and subscription.current_period_end > now())
        or (subscription.status = 'past_due' and subscription.grace_period_end > now())
      )
  );
$$;

revoke all on function public.has_current_listing_entitlement(uuid) from public;
grant execute on function public.has_current_listing_entitlement(uuid) to anon, authenticated;

drop policy if exists "Approved listings in active categories are public" on public.website_listings;
create policy "Eligible approved listings are public" on public.website_listings for select using (
  (
    status = 'approved'
    and deleted_at is null
    and owner_id is not null
    and public.has_current_listing_entitlement(owner_id)
    and exists (select 1 from public.categories category where category.id = category_id and category.is_active)
  )
  or (owner_id = auth.uid() and status <> 'deleted')
  or public.is_admin()
);

drop policy if exists "Owners update editable submissions" on public.website_listings;
create policy "Owners update editable submissions" on public.website_listings
  for update to authenticated
  using (owner_id = auth.uid() and status in ('draft', 'pending_review', 'changes_requested'))
  with check (owner_id = auth.uid() and status in ('draft', 'pending_review', 'deleted'));

create or replace function public.soft_delete_owned_listing(candidate_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  update public.website_listings
  set status = 'deleted', deleted_at = now(), published_at = null
  where id = candidate_listing_id and owner_id = auth.uid() and status <> 'deleted';
  if not found then raise exception 'Listing not found'; end if;
end;
$$;
revoke all on function public.soft_delete_owned_listing(uuid) from public;
grant execute on function public.soft_delete_owned_listing(uuid) to authenticated;

create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if exists (
    select 1 from public.billing_subscriptions subscription
    where subscription.owner_id = auth.uid()
      and (
        subscription.status in ('active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete')
        or subscription.current_period_end > now()
      )
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_BILLING_EXISTS';
  end if;
  perform set_config('app.account_deletion', 'true', true);
  update public.profiles set display_name = null, deletion_requested_at = now() where id = auth.uid();
  update public.website_listings
    set status = 'deleted', deleted_at = now(), published_at = null
    where owner_id = auth.uid() and status <> 'deleted';
end;
$$;
revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

create or replace function public.has_likely_duplicate_domain(candidate_domain text, excluded_listing_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1 from public.website_listings listing
    where listing.id is distinct from excluded_listing_id
      and listing.status not in ('suspended', 'expired', 'deleted', 'permanently_rejected')
      and (
        listing.normalized_domain = candidate_domain
        or right(listing.normalized_domain, char_length(candidate_domain) + 1) = '.' || candidate_domain
        or right(candidate_domain, char_length(listing.normalized_domain) + 1) = '.' || listing.normalized_domain
      )
  ) or exists (
    select 1 from public.listing_revisions revision
    where revision.listing_id is distinct from excluded_listing_id
      and revision.status = 'pending_review'
      and (
        revision.normalized_domain = candidate_domain
        or right(revision.normalized_domain, char_length(candidate_domain) + 1) = '.' || candidate_domain
        or right(candidate_domain, char_length(revision.normalized_domain) + 1) = '.' || revision.normalized_domain
      )
  );
$$;

grant execute on function public.has_likely_duplicate_domain(text, uuid) to authenticated;
grant execute on function public.soft_delete_owned_listing(uuid), public.request_account_deletion() to authenticated;
