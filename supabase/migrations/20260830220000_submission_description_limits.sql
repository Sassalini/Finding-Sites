-- Allow empty descriptions and up to 250 characters for submissions and revisions.
-- Keep existing data intact: if a legacy category request exceeds 250 characters,
-- this transaction fails validation rather than silently truncating its description.
begin;

alter table public.website_listings
  drop constraint website_listings_short_description_check,
  add constraint website_listings_short_description_check
    check (char_length(short_description) between 0 and 250);

alter table public.listing_revisions
  drop constraint listing_revisions_short_description_check,
  add constraint listing_revisions_short_description_check
    check (char_length(short_description) between 0 and 250);

alter table public.category_requests
  drop constraint category_requests_requested_description_check,
  add constraint category_requests_requested_description_check
    check (requested_description is null or char_length(requested_description) between 0 and 250);

commit;
