-- Administrator-only public listing takedowns with reversible state and audit history.

alter table public.website_listings
  add column if not exists moderation_status text not null default 'active'
    check (moderation_status in ('active', 'removed')),
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.profiles(id) on delete set null,
  add column if not exists removal_reason text
    check (removal_reason is null or removal_reason in (
      'nsfw', 'malware', 'scam', 'spam', 'illegal', 'misleading', 'terms', 'other'
    ));

alter table public.website_listings
  add constraint listing_removal_state_consistent check (
    (moderation_status = 'active' and removed_at is null and removed_by is null and removal_reason is null)
    or
    (moderation_status = 'removed' and removed_at is not null and removed_by is not null and removal_reason is not null)
  );

create index if not exists listings_moderation_status_idx
  on public.website_listings (moderation_status, removed_at desc);

create table if not exists public.listing_moderation_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.website_listings(id) on delete restrict,
  admin_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('removed', 'restored')),
  reason text check (reason is null or reason in (
    'nsfw', 'malware', 'scam', 'spam', 'illegal', 'misleading', 'terms', 'other'
  )),
  notes text check (notes is null or char_length(notes) between 1 and 2000),
  publication_result text check (publication_result is null or publication_result in ('hidden', 'public', 'private')),
  created_at timestamptz not null default now()
);

create index if not exists listing_moderation_events_listing_created_idx
  on public.listing_moderation_events (listing_id, created_at desc);

alter table public.listing_moderation_events enable row level security;
create policy "Admins inspect listing moderation history" on public.listing_moderation_events
  for select to authenticated using (public.is_admin());
grant select on public.listing_moderation_events to authenticated;

create or replace function public.protect_listing_takedown_fields()
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
    new.moderation_status = 'active';
    new.removed_at = null;
    new.removed_by = null;
    new.removal_reason = null;
  elsif new.moderation_status is distinct from old.moderation_status
    or new.removed_at is distinct from old.removed_at
    or new.removed_by is distinct from old.removed_by
    or new.removal_reason is distinct from old.removal_reason then
    raise exception 'Only administrators can change listing takedown fields';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_protect_takedown on public.website_listings;
create trigger listings_protect_takedown
  before insert or update on public.website_listings
  for each row execute function public.protect_listing_takedown_fields();

create or replace function public.is_listing_publicly_eligible(
  candidate_status public.listing_status,
  candidate_deleted_at timestamptz,
  candidate_published_at timestamptz,
  candidate_owner_id uuid,
  candidate_category_id uuid,
  candidate_moderation_status text,
  candidate_removed_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select
    candidate_status = 'approved'
    and candidate_deleted_at is null
    and candidate_published_at is not null
    and candidate_owner_id is not null
    and candidate_category_id is not null
    and candidate_moderation_status = 'active'
    and candidate_removed_at is null
    and public.has_current_listing_entitlement(candidate_owner_id)
    and exists (
      select 1 from public.categories category
      where category.id = candidate_category_id and category.is_active
    );
$$;

revoke execute on function public.is_listing_publicly_eligible(public.listing_status, timestamptz, timestamptz, uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.is_listing_publicly_eligible(public.listing_status, timestamptz, timestamptz, uuid, uuid, text, timestamptz) to anon, authenticated, service_role;

drop policy if exists "Eligible approved listings are public" on public.website_listings;
create policy "Eligible approved listings are public" on public.website_listings
for select
using (
  public.is_listing_publicly_eligible(status, deleted_at, published_at, owner_id, category_id, moderation_status, removed_at)
  or (owner_id = (select auth.uid()) and status <> 'deleted')
  or public.is_admin()
);

create or replace function public.get_directory_stats(
  candidate_min_popular_frequency integer default 3,
  candidate_popular_window_days integer default 7
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set row_security = off
as $$
declare
  london_today date := (now() at time zone 'Europe/London')::date;
  today_starts_at timestamptz := london_today::timestamp at time zone 'Europe/London';
  tomorrow_starts_at timestamptz := (london_today + 1)::timestamp at time zone 'Europe/London';
  minimum_frequency integer := greatest(coalesce(candidate_min_popular_frequency, 3), 2);
  window_days integer := least(greatest(coalesce(candidate_popular_window_days, 7), 1), 30);
  website_count bigint;
  category_count bigint;
  searches_today bigint;
  popular_searches jsonb;
begin
  select count(*) into website_count
  from public.website_listings listing
  where public.is_listing_publicly_eligible(
    listing.status, listing.deleted_at, listing.published_at, listing.owner_id,
    listing.category_id, listing.moderation_status, listing.removed_at
  );

  select count(*) into category_count from public.categories category where category.is_active;
  select count(*) into searches_today from public.search_events event
    where event.created_at >= today_starts_at and event.created_at < tomorrow_starts_at;

  with normalized_events as (
    select lower(regexp_replace(btrim(event.query), '[[:space:]]+', ' ', 'g')) as normalized_query,
      event.created_at, coalesce(event.user_id::text, event.anonymous_session_id::text) as search_actor
    from public.search_events event
    where event.created_at >= now() - make_interval(days => window_days)
      and char_length(btrim(event.query)) >= 2 and event.query !~ '[[:cntrl:]]'
      and event.query !~* '(^|[^[:alnum:]._%+-])[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}([^[:alnum:]]|$)'
      and event.query !~* '(https?://|www\.)'
  ), ranked as (
    select normalized_query as query, count(*)::integer as search_count, max(created_at) as last_searched_at
    from normalized_events where normalized_query <> '' and search_actor is not null
    group by normalized_query having count(*) >= minimum_frequency and count(distinct search_actor) >= 2
    order by count(*) desc, max(created_at) desc, normalized_query asc limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object('query', query, 'count', search_count)
    order by search_count desc, last_searched_at desc, query asc), '[]'::jsonb)
  into popular_searches from ranked;

  return jsonb_build_object('websiteCount', website_count, 'categoryCount', category_count,
    'searchesToday', searches_today, 'popularSearches', popular_searches);
end;
$$;

-- Remove the superseded five-argument overload so there is only one public-eligibility definition.
drop function if exists public.is_listing_publicly_eligible(
  public.listing_status, timestamptz, timestamptz, uuid, uuid
);

create or replace function public.admin_moderate_public_listing(
  candidate_listing_id uuid,
  moderation_action text,
  moderation_reason text default null,
  moderation_notes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  listing public.website_listings%rowtype;
  admin_id uuid := auth.uid();
  clean_reason text := nullif(btrim(moderation_reason), '');
  clean_notes text := nullif(btrim(moderation_notes), '');
  restored_publicly boolean;
begin
  if admin_id is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if moderation_action not in ('remove', 'restore') then raise exception 'INVALID_MODERATION_ACTION'; end if;

  select * into listing from public.website_listings where id = candidate_listing_id for update;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;

  if moderation_action = 'remove' then
    if listing.deleted_at is not null or listing.status = 'deleted' then raise exception 'LISTING_DELETED'; end if;
    if listing.moderation_status = 'removed' then raise exception 'LISTING_ALREADY_REMOVED'; end if;
    if clean_reason is null or clean_reason not in ('nsfw', 'malware', 'scam', 'spam', 'illegal', 'misleading', 'terms', 'other') then
      raise exception 'REMOVAL_REASON_REQUIRED';
    end if;
    if clean_reason = 'other' and (clean_notes is null or char_length(clean_notes) < 5) then
      raise exception 'REMOVAL_NOTES_REQUIRED';
    end if;
    if clean_notes is not null and char_length(clean_notes) > 2000 then raise exception 'REMOVAL_NOTES_TOO_LONG'; end if;

    update public.website_listings set moderation_status = 'removed', removed_at = now(),
      removed_by = admin_id, removal_reason = clean_reason where id = listing.id;
    insert into public.listing_moderation_events
      (listing_id, admin_user_id, action, reason, notes, publication_result)
      values (listing.id, admin_id, 'removed', clean_reason, clean_notes, 'hidden');
    return 'removed';
  end if;

  if listing.moderation_status <> 'removed' then raise exception 'LISTING_NOT_REMOVED'; end if;
  if listing.deleted_at is not null or listing.status = 'deleted' then raise exception 'RESTORE_NOT_ALLOWED'; end if;

  restored_publicly := public.is_listing_publicly_eligible(
    listing.status, listing.deleted_at, listing.published_at, listing.owner_id,
    listing.category_id, 'active', null
  );
  update public.website_listings set moderation_status = 'active', removed_at = null,
    removed_by = null, removal_reason = null where id = listing.id;
  insert into public.listing_moderation_events
    (listing_id, admin_user_id, action, notes, publication_result)
    values (listing.id, admin_id, 'restored', clean_notes, case when restored_publicly then 'public' else 'private' end);
  return case when restored_publicly then 'restored_public' else 'restored_private' end;
end;
$$;

revoke all on function public.admin_moderate_public_listing(uuid, text, text, text) from public, anon;
grant execute on function public.admin_moderate_public_listing(uuid, text, text, text) to authenticated;

comment on column public.website_listings.moderation_status is 'Administrator takedown state, separate from owner deletion and billing publication status.';
comment on table public.listing_moderation_events is 'Immutable administrator-only audit history. Notes are intentionally not stored on the owner-readable listing row.';
comment on function public.admin_moderate_public_listing(uuid, text, text, text) is 'Authenticated admin-only atomic remove/restore operation with audit history.';
