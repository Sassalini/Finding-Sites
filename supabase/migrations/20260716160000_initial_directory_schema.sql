create extension if not exists pgcrypto;

do $$ begin
  create type public.listing_status as enum (
    'draft',
    'pending_review',
    'approved',
    'rejected',
    'suspended',
    'expired'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 500),
  icon_key text,
  parent_id uuid references public.categories(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id)
);

create table if not exists public.website_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  url text not null check (char_length(url) <= 2048 and url ~* '^https?://[^[:space:]]+$'),
  normalized_domain text not null unique check (
    normalized_domain = lower(normalized_domain)
    and normalized_domain ~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'
    and normalized_domain not like '%.%.%.%.%.%'
  ),
  short_description text not null check (char_length(short_description) between 20 and 240),
  full_description text check (full_description is null or char_length(full_description) <= 5000),
  status public.listing_status not null default 'draft',
  is_verified boolean not null default false,
  is_featured boolean not null default false,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint approved_listing_dates check (
    status <> 'approved' or (approved_at is not null and published_at is not null)
  )
);

create table if not exists public.listing_metrics (
  listing_id uuid primary key references public.website_listings(id) on delete cascade,
  outbound_clicks bigint not null default 0 check (outbound_clicks >= 0),
  profile_views bigint not null default 0 check (profile_views >= 0),
  searches_appeared_in bigint not null default 0 check (searches_appeared_in >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  query text not null check (char_length(query) between 1 and 200),
  category_id uuid references public.categories(id) on delete set null,
  result_count integer not null check (result_count >= 0),
  created_at timestamptz not null default now(),
  anonymous_session_id uuid,
  user_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.category_requests (
  id uuid primary key default gen_random_uuid(),
  requested_name text not null check (char_length(requested_name) between 2 and 80),
  requested_description text check (requested_description is null or char_length(requested_description) <= 800),
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists categories_active_sort_idx on public.categories (is_active, sort_order, name);
create index if not exists categories_parent_idx on public.categories (parent_id) where parent_id is not null;
create index if not exists listings_public_directory_idx on public.website_listings (category_id, status, name) where status = 'approved';
create index if not exists listings_owner_status_idx on public.website_listings (owner_id, status) where owner_id is not null;
create index if not exists listings_published_idx on public.website_listings (published_at desc) where status = 'approved';
create index if not exists listings_updated_idx on public.website_listings (updated_at desc);
create index if not exists listings_name_search_idx on public.website_listings using gin (to_tsvector('english', name || ' ' || normalized_domain || ' ' || short_description));
create index if not exists search_events_created_idx on public.search_events (created_at desc);
create index if not exists search_events_category_idx on public.search_events (category_id, created_at desc) where category_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' or public.is_admin() then
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

create or replace function public.protect_listing_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' or public.is_admin() then
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
  else
    if new.owner_id is distinct from old.owner_id
      or new.is_verified is distinct from old.is_verified
      or new.is_featured is distinct from old.is_featured
      or new.approved_at is distinct from old.approved_at
      or new.published_at is distinct from old.published_at
      or new.status not in ('draft', 'pending_review') then
      raise exception 'Only administrators can change moderation fields';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(new.raw_user_meta_data ->> 'display_name', 80), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before insert or update on public.profiles for each row execute function public.protect_profile_role();
drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists listings_set_updated_at on public.website_listings;
create trigger listings_set_updated_at before update on public.website_listings for each row execute function public.set_updated_at();
drop trigger if exists listings_protect_moderation on public.website_listings;
create trigger listings_protect_moderation before insert or update on public.website_listings for each row execute function public.protect_listing_moderation_fields();
drop trigger if exists metrics_set_updated_at on public.listing_metrics;
create trigger metrics_set_updated_at before update on public.listing_metrics for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.website_listings enable row level security;
alter table public.listing_metrics enable row level security;
alter table public.search_events enable row level security;
alter table public.category_requests enable row level security;

create policy "Profiles are visible to their owner or an admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "Users may create their own member profile" on public.profiles for insert to authenticated with check (id = auth.uid() and role = 'member');
create policy "Users may update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Active categories are public" on public.categories for select using (is_active or public.is_admin());
create policy "Admins manage categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Approved listings in active categories are public" on public.website_listings for select using (
  (status = 'approved' and exists (select 1 from public.categories c where c.id = category_id and c.is_active))
  or owner_id = auth.uid()
  or public.is_admin()
);
create policy "Owners create drafts and submissions" on public.website_listings for insert to authenticated with check (
  owner_id = auth.uid() and status in ('draft', 'pending_review') and not is_verified and not is_featured and approved_at is null and published_at is null
);
create policy "Owners update editable submissions" on public.website_listings for update to authenticated using (
  owner_id = auth.uid() and status in ('draft', 'pending_review', 'rejected')
) with check (
  owner_id = auth.uid() and status in ('draft', 'pending_review')
);
create policy "Owners delete drafts" on public.website_listings for delete to authenticated using (owner_id = auth.uid() and status = 'draft');
create policy "Admins manage listings" on public.website_listings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage listing metrics" on public.listing_metrics for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins inspect search events" on public.search_events for select to authenticated using (public.is_admin());
create policy "Authenticated users request categories" on public.category_requests for insert to authenticated with check (
  requested_by = auth.uid() and status = 'pending' and reviewed_at is null
);
create policy "Users view their category requests" on public.category_requests for select to authenticated using (requested_by = auth.uid() or public.is_admin());
create policy "Admins manage category requests" on public.category_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.website_listings to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant insert, update, delete on public.website_listings to authenticated;
grant insert on public.category_requests to authenticated;
grant select on public.category_requests to authenticated;

comment on column public.website_listings.normalized_domain is 'Lower-case hostname only. Normalise on the trusted server with URL.hostname, remove a leading www., convert IDNs to ASCII, and reject non-http(s) protocols before insert.';
comment on table public.search_events is 'Server-written analytics only. No anon/authenticated insert policy is intentionally provided.';
comment on table public.listing_metrics is 'Updated only by trusted server code or admin operations; public clients cannot mutate counters.';
