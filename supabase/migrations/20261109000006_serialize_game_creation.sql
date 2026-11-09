-- Prevent challenge flooding and one account from entering multiple live games.

create or replace function public.create_ultrabullet_game(
  p_user_id uuid,
  p_initial_time_ms numeric,
  p_increment_ms numeric
)
returns public.games
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  created_game public.games;
  current_rating integer;
  open_challenges integer;
begin
  if p_user_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if p_increment_ms <> 0 or p_initial_time_ms not in
    (30000, 15000, 7500, 3250, 1625, 812.5, 406.25, 203.125) then
    raise exception 'Unsupported time control';
  end if;
  if exists (
    select 1 from public.games
    where status = 'active' and (white_player = p_user_id or black_player = p_user_id)
  ) then
    raise exception 'Finish your active game before creating another challenge';
  end if;

  delete from public.games
  where status = 'waiting' and created_at < clock_timestamp() - interval '24 hours';

  select count(*) into open_challenges
  from public.games where white_player = p_user_id and status = 'waiting';
  if open_challenges >= 3 then
    raise exception 'You already have three open challenges. Cancel one before creating another.';
  end if;

  insert into public.player_ratings (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select case p_initial_time_ms
    when 30000 then coalesce(hyperbullet_rating, 1500)
    when 15000 then ultrabullet_rating
    when 7500 then ultrazerk_rating
    when 3250 then psycho_3250_rating
    when 1625 then psycho_1625_rating
    when 812.5 then psycho_812_5_rating
    when 406.25 then psycho_406_25_rating
    when 203.125 then psycho_203_125_rating
  end
  into current_rating
  from public.player_ratings where user_id = p_user_id;

  insert into public.games (
    white_player, white_rating_before, initial_time_ms, white_time_ms,
    black_time_ms, increment_ms
  ) values (
    p_user_id, coalesce(current_rating, 1500), p_initial_time_ms, p_initial_time_ms,
    p_initial_time_ms, p_increment_ms
  ) returning * into created_game;
  return created_game;
end;
$function$;

create or replace function public.join_ultrabullet_game(p_game_id uuid, p_user_id uuid)
returns public.games
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  target public.games;
  current_rating integer;
begin
  if p_user_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if exists (
    select 1 from public.games
    where status = 'active' and (white_player = p_user_id or black_player = p_user_id)
  ) then
    raise exception 'Finish your active game before joining another';
  end if;

  insert into public.player_ratings (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select * into target from public.games where id = p_game_id for update;
  if not found or target.status <> 'waiting' or target.white_player = p_user_id
     or target.created_at < clock_timestamp() - interval '24 hours' then
    raise exception 'Game is no longer available';
  end if;

  select case target.initial_time_ms
    when 30000 then coalesce(hyperbullet_rating, 1500)
    when 15000 then ultrabullet_rating
    when 7500 then ultrazerk_rating
    when 3250 then psycho_3250_rating
    when 1625 then psycho_1625_rating
    when 812.5 then psycho_812_5_rating
    when 406.25 then psycho_406_25_rating
    when 203.125 then psycho_203_125_rating
  end
  into current_rating
  from public.player_ratings where user_id = p_user_id;

  update public.games
    set black_player = p_user_id,
        black_rating_before = coalesce(current_rating, 1500),
        status = 'active',
        started_at = clock_timestamp(),
        last_move_at = clock_timestamp()
    where id = p_game_id
    returning * into target;
  return target;
end;
$function$;

create or replace function public.find_ultrabullet_match(p_user_id uuid, p_initial_time_ms numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  opponent_id uuid;
  matched_game public.games;
begin
  if p_user_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if p_initial_time_ms not in (30000,15000,7500,3250,1625,812.5,406.25,203.125) then
    raise exception 'Unsupported time control';
  end if;
  if exists (
    select 1 from public.games
    where status = 'active' and (white_player = p_user_id or black_player = p_user_id)
  ) then
    delete from public.matchmaking_queue where user_id = p_user_id;
    raise exception 'Finish your active game before entering matchmaking';
  end if;

  delete from public.matchmaking_queue
  where created_at < clock_timestamp() - interval '2 minutes';

  delete from public.matchmaking_queue q
  where exists (
    select 1 from public.games g
    where g.status = 'active' and (g.white_player = q.user_id or g.black_player = q.user_id)
  );

  select q.user_id into opponent_id
  from public.matchmaking_queue q
  where q.initial_time_ms = p_initial_time_ms
    and q.user_id <> p_user_id
    and q.created_at >= clock_timestamp() - interval '2 minutes'
    and not exists (
      select 1 from public.games g
      where g.status = 'active' and (g.white_player = q.user_id or g.black_player = q.user_id)
    )
    and (
      select count(*) from public.games g
      where g.white_player = q.user_id and g.status = 'waiting'
    ) < 3
  order by q.created_at
  limit 1
  for update skip locked;

  if opponent_id is not null then
    delete from public.matchmaking_queue where user_id = opponent_id;
    delete from public.matchmaking_queue where user_id = p_user_id;
    select * into matched_game from public.create_ultrabullet_game(opponent_id, p_initial_time_ms, 0);
    select * into matched_game from public.join_ultrabullet_game(matched_game.id, p_user_id);
    return jsonb_build_object('queued', false, 'game', to_jsonb(matched_game));
  end if;

  insert into public.matchmaking_queue(user_id, initial_time_ms, created_at)
  values (p_user_id, p_initial_time_ms, clock_timestamp())
  on conflict (user_id) do update
    set initial_time_ms = excluded.initial_time_ms,
        created_at = clock_timestamp();

  return jsonb_build_object('queued', true);
end;
$function$;

revoke all on function public.create_ultrabullet_game(uuid,numeric,numeric) from public, anon, authenticated;
revoke all on function public.join_ultrabullet_game(uuid,uuid) from public, anon, authenticated;
revoke all on function public.find_ultrabullet_match(uuid,numeric) from public, anon, authenticated;
grant execute on function public.create_ultrabullet_game(uuid,numeric,numeric) to service_role;
grant execute on function public.join_ultrabullet_game(uuid,uuid) to service_role;
grant execute on function public.find_ultrabullet_match(uuid,numeric) to service_role;
