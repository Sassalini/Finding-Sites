-- Production directory statistics and controlled search-event recording.
-- Raw search events remain unreadable and unwritable by public clients.

create or replace function public.is_listing_publicly_eligible(
  candidate_status public.listing_status,
  candidate_deleted_at timestamptz,
  candidate_published_at timestamptz,
  candidate_owner_id uuid,
  candidate_category_id uuid
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
    and public.has_current_listing_entitlement(candidate_owner_id)
    and exists (
      select 1
      from public.categories category
      where category.id = candidate_category_id
        and category.is_active
    );
$$;

revoke execute on function public.is_listing_publicly_eligible(public.listing_status, timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_listing_publicly_eligible(public.listing_status, timestamptz, timestamptz, uuid, uuid) to anon, authenticated, service_role;

drop policy if exists "Eligible approved listings are public" on public.website_listings;
create policy "Eligible approved listings are public" on public.website_listings
for select
using (
  public.is_listing_publicly_eligible(status, deleted_at, published_at, owner_id, category_id)
  or (owner_id = (select auth.uid()) and status <> 'deleted')
  or public.is_admin()
);

create index if not exists search_events_session_created_idx
  on public.search_events (anonymous_session_id, created_at desc)
  where anonymous_session_id is not null;

create or replace function public.record_directory_search_event(
  candidate_query text,
  candidate_category_id uuid,
  candidate_result_count integer,
  candidate_anonymous_session_id uuid,
  candidate_user_id uuid default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
set row_security = off
as $$
declare
  normalized_query text := regexp_replace(btrim(candidate_query), '[[:space:]]+', ' ', 'g');
begin
  if candidate_anonymous_session_id is null
    or char_length(normalized_query) < 2
    or char_length(normalized_query) > 120
    or normalized_query ~ '[[:cntrl:]]'
    or normalized_query ~* '(^|[^[:alnum:]._%+-])[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}([^[:alnum:]]|$)'
  then
    return false;
  end if;

  if candidate_category_id is not null and not exists (
    select 1 from public.categories category
    where category.id = candidate_category_id and category.is_active
  ) then
    return false;
  end if;

  if (
    select count(*) from public.search_events event
    where event.anonymous_session_id = candidate_anonymous_session_id
      and event.created_at >= now() - interval '1 hour'
  ) >= 30 then
    return false;
  end if;

  if exists (
    select 1 from public.search_events event
    where event.anonymous_session_id = candidate_anonymous_session_id
      and lower(regexp_replace(btrim(event.query), '[[:space:]]+', ' ', 'g')) = lower(normalized_query)
      and event.category_id is not distinct from candidate_category_id
      and event.created_at >= now() - interval '5 minutes'
  ) then
    return false;
  end if;

  insert into public.search_events (query, category_id, result_count, anonymous_session_id, user_id)
  values (
    normalized_query,
    candidate_category_id,
    greatest(coalesce(candidate_result_count, 0), 0),
    candidate_anonymous_session_id,
    case when candidate_user_id is not null and exists (
      select 1 from public.profiles profile where profile.id = candidate_user_id
    ) then candidate_user_id else null end
  );
  return true;
end;
$$;

revoke execute on function public.record_directory_search_event(text, uuid, integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_directory_search_event(text, uuid, integer, uuid, uuid) to service_role;

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
    listing.status,
    listing.deleted_at,
    listing.published_at,
    listing.owner_id,
    listing.category_id
  );

  select count(*) into category_count
  from public.categories category
  where category.is_active;

  select count(*) into searches_today
  from public.search_events event
  where event.created_at >= today_starts_at
    and event.created_at < tomorrow_starts_at;

  with normalized_events as (
    select
      lower(regexp_replace(btrim(event.query), '[[:space:]]+', ' ', 'g')) as normalized_query,
      event.created_at,
      coalesce(event.user_id::text, event.anonymous_session_id::text) as search_actor
    from public.search_events event
    where event.created_at >= now() - make_interval(days => window_days)
      and char_length(btrim(event.query)) >= 2
      and event.query !~ '[[:cntrl:]]'
      and event.query !~* '(^|[^[:alnum:]._%+-])[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}([^[:alnum:]]|$)'
      and event.query !~* '(https?://|www\.)'
  ), ranked as (
    select
      normalized_query as query,
      count(*)::integer as search_count,
      max(created_at) as last_searched_at
    from normalized_events
    where normalized_query <> '' and search_actor is not null
    group by normalized_query
    having count(*) >= minimum_frequency
      and count(distinct search_actor) >= 2
    order by count(*) desc, max(created_at) desc, normalized_query asc
    limit 5
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('query', query, 'count', search_count) order by search_count desc, last_searched_at desc, query asc),
    '[]'::jsonb
  ) into popular_searches
  from ranked;

  return jsonb_build_object(
    'websiteCount', website_count,
    'categoryCount', category_count,
    'searchesToday', searches_today,
    'popularSearches', popular_searches
  );
end;
$$;

revoke execute on function public.get_directory_stats(integer, integer) from public, anon, authenticated;
grant execute on function public.get_directory_stats(integer, integer) to service_role;

comment on function public.is_listing_publicly_eligible(public.listing_status, timestamptz, timestamptz, uuid, uuid) is 'Single eligibility definition shared by public-listing RLS and directory statistics.';
comment on function public.record_directory_search_event(text, uuid, integer, uuid, uuid) is 'Service-only validated search logger with per-session duplicate suppression and hourly rate limiting.';
comment on function public.get_directory_stats(integer, integer) is 'Service-only aggregated directory statistics. Today follows Europe/London calendar boundaries.';
