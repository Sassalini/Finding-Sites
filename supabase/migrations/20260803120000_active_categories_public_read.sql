-- Make the active-category read contract explicit for both public browsing and
-- authenticated submission forms. The original policy had no role clause;
-- recreating it here also repairs deployments where that policy is missing.

drop policy if exists "Active categories are public" on public.categories;
drop policy if exists "Active categories are publicly readable" on public.categories;

create policy "Active categories are publicly readable"
on public.categories
for select
to anon, authenticated
using (is_active = true);

grant select on public.categories to anon, authenticated;
