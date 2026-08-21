-- Existing active categories can publish automatically after entitlement.
-- New category requests remain private until an administrator resolves them.

alter table public.website_listings
  add column if not exists approval_source text,
  add column if not exists resolved_category_request_id uuid references public.category_requests(id) on delete restrict;

alter table public.website_listings drop constraint if exists website_listings_approval_source;
alter table public.website_listings add constraint website_listings_approval_source check (
  approval_source is null or approval_source in ('automatic_existing_category', 'admin_new_category', 'admin_existing_category')
);

create or replace function public.protect_listing_approval_audit()
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
    new.approval_source = null;
    new.resolved_category_request_id = null;
  elsif new.approval_source is distinct from old.approval_source
    or new.resolved_category_request_id is distinct from old.resolved_category_request_id then
    raise exception 'Only trusted moderation code may change approval audit fields';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_protect_approval_audit on public.website_listings;
create trigger listings_protect_approval_audit
  before insert or update on public.website_listings
  for each row execute function public.protect_listing_approval_audit();

create or replace function public.has_qualifying_listing_subscription(candidate_owner_id uuid)
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
      )
  );
$$;

revoke all on function public.has_qualifying_listing_subscription(uuid) from public;
grant execute on function public.has_qualifying_listing_subscription(uuid) to service_role;

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
  if listing.status in ('deleted', 'suspended', 'permanently_rejected', 'expired') then
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

  select count(*) into used_slots from public.website_listings counted
  where counted.owner_id = candidate_owner_id
    and counted.deleted_at is null
    and counted.status in ('draft', 'checkout_pending', 'pending_review', 'approved', 'changes_requested', 'suspended', 'subscription_inactive');
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

create or replace function public.admin_moderate_category_listing(
  candidate_listing_id uuid,
  moderation_action text,
  selected_category_id uuid default null,
  moderation_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  listing public.website_listings%rowtype;
  request public.category_requests%rowtype;
  category_id_to_use uuid;
  category_slug_base text;
  category_slug text;
  slug_suffix integer := 1;
  now_at timestamptz := now();
  clean_reason text := nullif(trim(moderation_reason), '');
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select * into listing from public.website_listings
  where id = candidate_listing_id and status = 'pending_review'
  for update;
  if not found or listing.category_request_id is null then raise exception 'REVIEW_NOT_FOUND'; end if;

  select * into request from public.category_requests
  where id = listing.category_request_id and status = 'pending'
  for update;
  if not found or request.requested_by is distinct from listing.owner_id then
    raise exception 'CATEGORY_REQUEST_NOT_FOUND';
  end if;

  if moderation_action in ('request_changes', 'reject') then
    if clean_reason is null or char_length(clean_reason) < 5 or char_length(clean_reason) > 1000 then
      raise exception 'REASON_REQUIRED';
    end if;
    if moderation_action = 'request_changes' then
      update public.website_listings set status = 'changes_requested', rejection_reason = clean_reason,
        approved_at = null, published_at = null, approval_source = null
      where id = listing.id;
      return 'changes_requested';
    end if;
    update public.category_requests set status = 'rejected', reviewed_at = now_at where id = request.id;
    update public.website_listings set status = 'permanently_rejected', rejection_reason = clean_reason,
      approved_at = null, published_at = null, approval_source = null
    where id = listing.id;
    return 'permanently_rejected';
  end if;

  if moderation_action = 'assign_existing' then
    if selected_category_id is null or not exists (
      select 1 from public.categories category where category.id = selected_category_id and category.is_active
    ) then raise exception 'CATEGORY_NOT_ACTIVE'; end if;
    category_id_to_use := selected_category_id;
    update public.category_requests set status = 'rejected', reviewed_at = now_at where id = request.id;
  elsif moderation_action = 'approve_new_category' then
    category_slug_base := trim(both '-' from regexp_replace(lower(trim(request.requested_name)), '[^a-z0-9]+', '-', 'g'));
    if category_slug_base = '' then category_slug_base := 'category'; end if;
    if exists (
      select 1 from public.categories category
      where lower(regexp_replace(trim(category.name), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(trim(request.requested_name), '[[:space:]]+', ' ', 'g'))
        or category.slug = category_slug_base
    ) then raise exception 'CATEGORY_DUPLICATE'; end if;
    category_slug := category_slug_base;
    while exists (select 1 from public.categories category where category.slug = category_slug) loop
      slug_suffix := slug_suffix + 1;
      category_slug := category_slug_base || '-' || slug_suffix::text;
    end loop;
    insert into public.categories (name, slug, description, is_active)
    values (regexp_replace(trim(request.requested_name), '[[:space:]]+', ' ', 'g'), category_slug, left(request.requested_description, 500), true)
    returning id into category_id_to_use;
    update public.category_requests set status = 'approved', reviewed_at = now_at where id = request.id;
  else
    raise exception 'INVALID_MODERATION_ACTION';
  end if;

  update public.website_listings set
    category_id = category_id_to_use,
    category_request_id = null,
    resolved_category_request_id = request.id,
    status = 'approved',
    rejection_reason = null,
    approved_at = now_at,
    published_at = now_at,
    submitted_at = coalesce(listing.submitted_at, now_at),
    approval_source = case moderation_action
      when 'approve_new_category' then 'admin_new_category'
      else 'admin_existing_category'
    end
  where id = listing.id;
  return 'approved';
end;
$$;

revoke all on function public.admin_moderate_category_listing(uuid, text, uuid, text) from public;
grant execute on function public.admin_moderate_category_listing(uuid, text, uuid, text) to authenticated;

comment on column public.website_listings.approval_source is 'Trusted audit marker describing how the listing was first published.';
comment on column public.website_listings.resolved_category_request_id is 'Preserves the category request resolved during approval after category_request_id is cleared.';
comment on function public.finalize_listing_after_entitlement(uuid, uuid) is 'Authoritative post-entitlement listing finalisation: active existing categories publish automatically; category requests enter review.';
comment on function public.admin_moderate_category_listing(uuid, text, uuid, text) is 'Atomic administrator resolution for new-category listing reviews.';
