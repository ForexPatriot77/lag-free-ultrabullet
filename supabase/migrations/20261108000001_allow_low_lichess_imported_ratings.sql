alter table public.player_ratings
  drop constraint if exists player_ratings_hyperbullet_rating_check;
alter table public.player_ratings
  add constraint player_ratings_hyperbullet_rating_check
  check (hyperbullet_rating is null or hyperbullet_rating >= 0);

alter table public.player_ratings
  drop constraint if exists player_ratings_ultrabullet_rating_check;
alter table public.player_ratings
  add constraint player_ratings_ultrabullet_rating_check
  check (ultrabullet_rating >= 0);
