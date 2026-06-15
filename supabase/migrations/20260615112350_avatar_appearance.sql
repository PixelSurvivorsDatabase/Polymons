alter table public.profiles
  add column avatar_appearance jsonb not null default '{
    "face": "classic-smile",
    "bodyColors": {
      "head": "#e7bd91",
      "torso": "#7650d8",
      "leftArm": "#e7bd91",
      "rightArm": "#e7bd91",
      "leftLeg": "#313542",
      "rightLeg": "#313542"
    },
    "accessories": []
  }'::jsonb;

alter table public.profiles
  add constraint profiles_avatar_appearance_is_object
  check (jsonb_typeof(avatar_appearance) = 'object');
