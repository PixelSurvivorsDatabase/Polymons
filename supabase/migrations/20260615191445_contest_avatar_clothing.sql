insert into public.avatar_items (
  id,
  name,
  description,
  item_type,
  unlock_type,
  unlock_threshold,
  sort_order
)
values
  (
    'orange-polymons-shirt',
    'Orange Polymons Shirt',
    'A fiery orange Polymons shirt based on community contest artwork.',
    'shirt',
    'free',
    null,
    40
  ),
  (
    'polymons-varsity-jacket',
    'Polymons Varsity Jacket',
    'A purple varsity-style Polymons jacket based on community contest artwork.',
    'shirt',
    'free',
    null,
    50
  ),
  (
    'beta-tester-pants',
    'Beta Tester Pants',
    'Flowing green, red, and purple pants made to match the Beta Tester Shirt.',
    'pants',
    'free',
    null,
    130
  ),
  (
    'creators-pants',
    'Creator''s Pants',
    'Dark Poly Studio pants made to match the Creator''s Shirt.',
    'pants',
    'creator_visits',
    100,
    140
  ),
  (
    'orange-polymons-pants',
    'Orange Polymons Pants',
    'Orange contest pants with gray and black shoe cuffs.',
    'pants',
    'free',
    null,
    150
  ),
  (
    'polymons-varsity-pants',
    'Polymons Varsity Pants',
    'Dark pants with purple details made to match the Polymons Varsity Jacket.',
    'pants',
    'free',
    null,
    160
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  item_type = excluded.item_type,
  unlock_type = excluded.unlock_type,
  unlock_threshold = excluded.unlock_threshold,
  sort_order = excluded.sort_order;
