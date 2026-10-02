-- Reviewed ownerless seeds use the existing listings table. No billing changes.
begin;

-- Existing public policies also call this boolean helper. Anonymous callers
-- need execute permission; it only checks their own auth.uid() (normally NULL).
grant execute on function public.is_admin() to anon;

alter table public.website_listings
  add column source text not null default 'user_submission' check (source in ('user_submission', 'common_crawl')),
  add column is_seeded boolean not null default false,
  add column is_claimed boolean not null default true,
  add column source_crawl text check (source_crawl is null or source_crawl ~ '^CC-MAIN-[0-9]{4}-[0-9]{2}$'),
  add column imported_at timestamptz,
  add constraint listing_seed_provenance check (
    (not is_seeded and source = 'user_submission' and is_claimed and source_crawl is null and imported_at is null)
    or (is_seeded and source = 'common_crawl' and source_crawl is not null and imported_at is not null
      and (is_claimed or (owner_id is null and contact_email is null and not ownership_confirmed and not terms_accepted)))
  );

create index listings_seed_imported_idx on public.website_listings (imported_at desc) where is_seeded;

create or replace function public.protect_listing_seed_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize domain writes with the import RPC, including authenticated drafts.
  -- This also prevents root/subdomain races which exact-domain uniqueness cannot catch.
  if tg_op = 'INSERT' or new.normalized_domain is distinct from old.normalized_domain then
    perform pg_advisory_xact_lock(61002120000);
  end if;
  if session_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.is_seeded or new.source <> 'user_submission' or not new.is_claimed
      or new.source_crawl is not null or new.imported_at is not null then
      raise exception 'SEED_FIELDS_PROTECTED';
    end if;
  elsif new.source is distinct from old.source or new.is_seeded is distinct from old.is_seeded
    or new.is_claimed is distinct from old.is_claimed or new.source_crawl is distinct from old.source_crawl
    or new.imported_at is distinct from old.imported_at then
    raise exception 'SEED_FIELDS_PROTECTED';
  end if;
  return new;
end;
$$;
create trigger listings_00_protect_seed before insert or update on public.website_listings
  for each row execute function public.protect_listing_seed_fields();

create or replace function public.lock_listing_revision_domain()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(61002120000);
  return new;
end;
$$;
create trigger revisions_00_lock_domain before insert or update of normalized_domain on public.listing_revisions
  for each row execute function public.lock_listing_revision_domain();

-- Retain the existing seven-argument entitlement helper. The additional seed
-- branch is invoked using trusted row fields in RLS, statistics and restoration.
create or replace function public.is_listing_publicly_eligible(
  candidate_status public.listing_status, candidate_deleted_at timestamptz,
  candidate_published_at timestamptz, candidate_owner_id uuid, candidate_category_id uuid,
  candidate_moderation_status text, candidate_removed_at timestamptz,
  candidate_source text, candidate_is_seeded boolean, candidate_is_claimed boolean
)
returns boolean language sql stable security definer set search_path = '' set row_security = off as $$
  select public.is_listing_publicly_eligible(candidate_status, candidate_deleted_at, candidate_published_at,
    candidate_owner_id, candidate_category_id, candidate_moderation_status, candidate_removed_at)
  or (
    candidate_source = 'common_crawl' and candidate_is_seeded and not candidate_is_claimed
    and candidate_owner_id is null and candidate_status = 'approved'
    and candidate_deleted_at is null and candidate_published_at is not null
    and candidate_moderation_status = 'active' and candidate_removed_at is null
    and exists (select 1 from public.categories c where c.id = candidate_category_id and c.is_active)
  );
$$;
revoke all on function public.is_listing_publicly_eligible(public.listing_status, timestamptz, timestamptz, uuid, uuid, text, timestamptz, text, boolean, boolean) from public;
grant execute on function public.is_listing_publicly_eligible(public.listing_status, timestamptz, timestamptz, uuid, uuid, text, timestamptz, text, boolean, boolean) to anon, authenticated, service_role;

drop policy "Eligible approved listings are public" on public.website_listings;
create policy "Eligible approved listings are public" on public.website_listings for select using (
  public.is_listing_publicly_eligible(status, deleted_at, published_at, owner_id, category_id,
    moderation_status, removed_at, source, is_seeded, is_claimed)
  or (owner_id = (select auth.uid()) and status <> 'deleted') or public.is_admin()
);

create or replace function public.import_seeded_listing(
  candidate_name text, candidate_url text, candidate_domain text,
  candidate_category_id uuid, candidate_crawl text
)
returns text language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  listing_id uuid := gen_random_uuid();
  now_at timestamptz := now();
  hostname text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(61002120000);
  -- Active category locked through insertion so concurrent deactivation waits.
  perform 1 from public.categories where id = candidate_category_id and is_active for share;
  if not found then raise exception 'CATEGORY_NOT_ACTIVE'; end if;
  if candidate_url is null or candidate_url !~ '^https://[a-z0-9.-]+/$'
    or candidate_domain is null or candidate_domain <> lower(btrim(candidate_domain))
    or candidate_domain !~ '^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$'
    or candidate_crawl is null or candidate_crawl !~ '^CC-MAIN-[0-9]{4}-[0-9]{2}$'
    or candidate_name is null or char_length(btrim(candidate_name)) not between 2 and 120 then
    raise exception 'INVALID_SEED_INPUT';
  end if;
  hostname := substring(candidate_url from '^https://([^/]+)/$');
  if hostname <> candidate_domain and right(hostname, char_length(candidate_domain) + 1) <> '.' || candidate_domain then
    raise exception 'INVALID_SEED_DOMAIN';
  end if;
  if public.get_domain_submission_conflict(candidate_domain, null) <> 'none'
    or exists (select 1 from public.website_listings l where l.normalized_domain = candidate_domain
      or right(l.normalized_domain, char_length(candidate_domain) + 1) = '.' || candidate_domain
      or right(candidate_domain, char_length(l.normalized_domain) + 1) = '.' || l.normalized_domain) then
    return 'duplicate';
  end if;
  insert into public.website_listings
    (id, owner_id, category_id, name, slug, url, normalized_domain, short_description,
     source, is_seeded, is_claimed, source_crawl, imported_at, status, approved_at, published_at)
  values (listing_id, null, candidate_category_id, btrim(candidate_name),
    'seed-' || listing_id::text, candidate_url, candidate_domain, '',
    'common_crawl', true, false, candidate_crawl, now_at, 'approved', now_at, now_at);
  return 'inserted';
end;
$$;
revoke all on function public.import_seeded_listing(text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.import_seeded_listing(text, text, text, uuid, text) to service_role;

create or replace function public.admin_delete_seeded_listing(candidate_listing_id uuid)
returns void language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  -- Soft deletion preserves provenance and moderation history. Claimed seeds
  -- must use the normal owned-listing moderation path instead.
  update public.website_listings set status = 'deleted', deleted_at = now(), published_at = null
  where id = candidate_listing_id and is_seeded and not is_claimed and owner_id is null
    and moderation_status = 'active' and deleted_at is null;
  if not found then raise exception 'UNCLAIMED_ACTIVE_SEED_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.admin_delete_seeded_listing(uuid) from public, anon;
grant execute on function public.admin_delete_seeded_listing(uuid) to authenticated;

comment on column public.website_listings.is_claimed is
  'Seed claim state; only trusted code/admins may convert a seed after ownership verification. Claimed seeds require normal billing eligibility.';
comment on function public.import_seeded_listing(text, text, text, uuid, text) is
  'Local reviewed seed import only; never changes existing records, creates owners, or touches billing.';
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
    listing.category_id, listing.moderation_status, listing.removed_at, listing.source, listing.is_seeded, listing.is_claimed
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
    listing.category_id, 'active', null, listing.source, listing.is_seeded, listing.is_claimed
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
      and (not listing.is_seeded or listing.is_claimed or listing.owner_id is not null)
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
      and (not parent.is_seeded or parent.is_claimed or parent.owner_id is not null)
      and parent.status not in ('deleted', 'expired', 'suspended', 'permanently_rejected')
      and (
        revision.normalized_domain = clean_domain
        or right(revision.normalized_domain, char_length(clean_domain) + 1) = '.' || clean_domain
        or right(clean_domain, char_length(revision.normalized_domain) + 1) = '.' || revision.normalized_domain
      )
  ) then
    return 'current';
  end if;

  if exists (
    select 1 from public.website_listings listing
    where listing.id is distinct from excluded_listing_id
      and listing.is_seeded and not listing.is_claimed and listing.owner_id is null
      and listing.deleted_at is null and listing.moderation_status = 'active'
      and listing.status not in ('deleted', 'expired', 'suspended', 'permanently_rejected')
      and (listing.normalized_domain = clean_domain
        or right(listing.normalized_domain, char_length(clean_domain) + 1) = '.' || clean_domain
        or right(clean_domain, char_length(listing.normalized_domain) + 1) = '.' || listing.normalized_domain)
  ) then return 'seeded'; end if;

  return 'none';
end;
$$;


commit;

