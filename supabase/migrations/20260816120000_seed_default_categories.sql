-- Install the canonical Finding Sites categories through the migration path so
-- linked and production projects receive the same data as local database resets.

insert into public.categories (name, slug, description, icon_key, sort_order)
values
  ('Business & Services', 'business-services', 'Professional services and practical support for organisations.', 'briefcase', 10),
  ('Computers & Internet', 'computers-internet', 'Software, hosting, technology and the open web.', 'monitor', 20),
  ('Education', 'education', 'Courses, resources and learning communities.', 'book', 30),
  ('Entertainment', 'entertainment', 'Independent entertainment, games and creative culture.', 'spark', 40),
  ('Finance', 'finance', 'Independent financial tools, advice and services.', 'pound', 50),
  ('Health & Fitness', 'health-fitness', 'Wellbeing, activity and healthcare information.', 'heart', 60),
  ('Hobbies & Interests', 'hobbies-interests', 'Specialist communities, guides and supplies.', 'compass', 70),
  ('Home & Garden', 'home-garden', 'Homes, interiors, gardening and maintenance.', 'home', 80),
  ('Life & Style', 'life-style', 'Independent style, living and personal interests.', 'leaf', 90),
  ('News & Media', 'news-media', 'Publishers, newsletters and independent reporting.', 'news', 100),
  ('Pets & Animals', 'pets-animals', 'Animal care, welfare and pet services.', 'paw', 110),
  ('Shopping', 'shopping', 'Independent shops and specialist retailers.', 'bag', 120),
  ('Society & Culture', 'society-culture', 'Communities, culture and public-interest projects.', 'people', 130),
  ('Sports & Recreation', 'sports-recreation', 'Clubs, activities, coaching and outdoor pursuits.', 'activity', 140),
  ('Travel & Tourism', 'travel-tourism', 'Independent travel resources and local experiences.', 'map', 150)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon_key = excluded.icon_key,
  sort_order = excluded.sort_order;

