-- Complete the category-request review audit trail and let administrators edit
-- the category details before atomically publishing the requested listing.

alter table public.category_requests
  add column if not exists resolved_category_id uuid references public.categories(id) on delete restrict,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists review_status text not null default 'pending',
  add column if not exists review_notes text;

alter table public.category_requests drop constraint if exists category_requests_review_status;
alter table public.category_requests add constraint category_requests_review_status check (
  review_status in ('pending', 'approved', 'assigned_existing', 'changes_requested', 'rejected')
);

update public.category_requests
set review_status = case status when 'approved' then 'approved' when 'rejected' then 'rejected' else 'pending' end
where review_status = 'pending' and status <> 'pending';

create or replace function public.protect_category_request_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() or auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.status = 'pending';
    new.resolved_category_id = null;
    new.reviewed_by = null;
    new.reviewed_at = null;
    new.review_status = 'pending';
    new.review_notes = null;
  elsif new.status is distinct from old.status
    or new.resolved_category_id is distinct from old.resolved_category_id
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.review_status is distinct from old.review_status
    or new.review_notes is distinct from old.review_notes then
    raise exception 'Only administrators may review category requests';
  end if;
  return new;
end;
$$;

drop trigger if exists category_requests_protect_review_fields on public.category_requests;
create trigger category_requests_protect_review_fields
  before insert or update on public.category_requests
  for each row execute function public.protect_category_request_review_fields();

drop function if exists public.admin_moderate_category_listing(uuid, text, uuid, text);

create function public.admin_moderate_category_listing(
  candidate_listing_id uuid,
  moderation_action text,
  selected_category_id uuid default null,
  moderation_reason text default null,
  category_name text default null,
  category_slug_input text default null,
  category_icon_key text default null,
  category_sort_order integer default null
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
  clean_category_name text;
  clean_category_name_key text;
  clean_category_slug text;
  clean_icon_key text := nullif(trim(category_icon_key), '');
  clean_reason text := nullif(trim(moderation_reason), '');
  next_sort_order integer;
  now_at timestamptz := now();
  admin_id uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select * into listing from public.website_listings
  where id = candidate_listing_id and status = 'pending_review'
  for update;
  if not found or listing.category_request_id is null then raise exception 'REVIEW_NOT_FOUND'; end if;

  select * into request from public.category_requests
  where id = listing.category_request_id and status = 'pending' and review_status = 'pending'
  for update;
  if not found or request.requested_by is distinct from listing.owner_id then
    raise exception 'CATEGORY_REQUEST_NOT_FOUND';
  end if;

  if moderation_action in ('request_changes', 'reject') then
    if clean_reason is null or char_length(clean_reason) < 5 or char_length(clean_reason) > 1000 then
      raise exception 'REASON_REQUIRED';
    end if;
    if moderation_action = 'request_changes' then
      update public.category_requests set
        review_status = 'changes_requested', reviewed_by = admin_id,
        reviewed_at = now_at, review_notes = clean_reason
      where id = request.id;
      update public.website_listings set
        status = 'changes_requested', rejection_reason = clean_reason,
        approved_at = null, published_at = null, approval_source = null
      where id = listing.id;
      return 'changes_requested';
    end if;
    update public.category_requests set
      status = 'rejected', review_status = 'rejected', reviewed_by = admin_id,
      reviewed_at = now_at, review_notes = clean_reason
    where id = request.id;
    update public.website_listings set
      status = 'permanently_rejected', rejection_reason = clean_reason,
      approved_at = null, published_at = null, approval_source = null
    where id = listing.id;
    return 'permanently_rejected';
  end if;

  if moderation_action = 'assign_existing' then
    if selected_category_id is null or not exists (
      select 1 from public.categories category where category.id = selected_category_id and category.is_active
    ) then raise exception 'CATEGORY_NOT_ACTIVE'; end if;
    category_id_to_use := selected_category_id;
    update public.category_requests set
      status = 'approved', review_status = 'assigned_existing', resolved_category_id = category_id_to_use,
      reviewed_by = admin_id, reviewed_at = now_at, review_notes = clean_reason
    where id = request.id;
  elsif moderation_action = 'approve_new_category' then
    clean_category_name := regexp_replace(trim(coalesce(nullif(category_name, ''), request.requested_name)), '[[:space:]]+', ' ', 'g');
    if char_length(clean_category_name) < 2 or char_length(clean_category_name) > 80 then
      raise exception 'CATEGORY_NAME_INVALID';
    end if;
    clean_category_name_key := lower(regexp_replace(clean_category_name, '[^a-zA-Z0-9]+', '', 'g'));
    clean_category_slug := trim(both '-' from regexp_replace(lower(trim(coalesce(nullif(category_slug_input, ''), clean_category_name))), '[^a-z0-9]+', '-', 'g'));
    if clean_category_slug = '' or char_length(clean_category_slug) > 100 then
      raise exception 'CATEGORY_SLUG_INVALID';
    end if;
    if clean_icon_key is not null and (char_length(clean_icon_key) > 50 or clean_icon_key !~ '^[a-z0-9-]+$') then
      raise exception 'CATEGORY_ICON_INVALID';
    end if;
    if exists (
      select 1 from public.categories category
      where lower(regexp_replace(trim(category.name), '[^a-zA-Z0-9]+', '', 'g')) = clean_category_name_key
        or category.slug = clean_category_slug
    ) then raise exception 'CATEGORY_DUPLICATE'; end if;
    select coalesce(max(sort_order), 0) + 10 into next_sort_order from public.categories;
    insert into public.categories (name, slug, description, icon_key, sort_order, is_active)
    values (
      clean_category_name, clean_category_slug, left(request.requested_description, 500),
      clean_icon_key, coalesce(category_sort_order, next_sort_order), true
    )
    returning id into category_id_to_use;
    update public.category_requests set
      status = 'approved', review_status = 'approved', resolved_category_id = category_id_to_use,
      reviewed_by = admin_id, reviewed_at = now_at, review_notes = clean_reason
    where id = request.id;
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

revoke all on function public.admin_moderate_category_listing(uuid, text, uuid, text, text, text, text, integer) from public;
grant execute on function public.admin_moderate_category_listing(uuid, text, uuid, text, text, text, text, integer) to authenticated;

comment on function public.admin_moderate_category_listing(uuid, text, uuid, text, text, text, text, integer)
is 'Atomically resolves a requested category and publishes its listing using administrator-reviewed category details.';
