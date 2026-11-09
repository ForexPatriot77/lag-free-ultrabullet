-- Enable all eight no-increment time controls and maintain independent Elo pools.
-- Existing 15-second games remain in the Ultrabullet pool.

alter table public.games
  drop constraint if exists games_initial_time_ms_check;

alter table public.games
  add constraint games_initial_time_ms_supported
  check (initial_time_ms in (30000, 15000, 7500, 3250, 1625, 812.5, 406.25, 203.125));

alter table public.games
  add column if not exists rating_pool text
  generated always as (
    case initial_time_ms
      when 30000 then 'hyperbullet'
      when 15000 then 'ultrabullet'
      when 7500 then 'ultrazerk'
      when 3250 then 'psycho_3250'
      when 1625 then 'psycho_1625'
      when 812.5 then 'psycho_812_5'
      when 406.25 then 'psycho_406_25'
      when 203.125 then 'psycho_203_125'
      else 'unsupported'
    end
  ) stored;

alter table public.player_ratings
  add column if not exists ultrazerk_rating integer not null default 1500
    check (ultrazerk_rating >= 0),
  add column if not exists psycho_3250_rating integer not null default 1500
    check (psycho_3250_rating >= 0),
  add column if not exists psycho_1625_rating integer not null default 1500
    check (psycho_1625_rating >= 0),
  add column if not exists psycho_812_5_rating integer not null default 1500
    check (psycho_812_5_rating >= 0),
  add column if not exists psycho_406_25_rating integer not null default 1500
    check (psycho_406_25_rating >= 0),
  add column if not exists psycho_203_125_rating integer not null default 1500
    check (psycho_203_125_rating >= 0);

create table if not exists public.player_rating_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  rating_pool text not null check (rating_pool in (
    'hyperbullet','ultrabullet','ultrazerk',
    'psycho_3250','psycho_1625','psycho_812_5','psycho_406_25','psycho_203_125'
  )),
  rating integer not null check (rating >= 0),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (game_id, user_id)
);

alter table public.player_rating_history enable row level security;
revoke all on public.player_rating_history from anon, authenticated;
grant select on public.player_rating_history to authenticated;
drop policy if exists "Rating history is publicly readable" on public.player_rating_history;
create policy "Rating history is publicly readable"
  on public.player_rating_history for select to authenticated using (true);

create index if not exists games_waiting_created_at_idx
  on public.games (created_at desc) where status = 'waiting';
create index if not exists games_active_started_at_idx
  on public.games (started_at desc) where status = 'active';
create index if not exists player_rating_history_user_pool_time_idx
  on public.player_rating_history (user_id, rating_pool, recorded_at);

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
begin
  if p_user_id is null then raise exception 'Authentication required'; end if;
  if p_increment_ms <> 0 or p_initial_time_ms not in
    (30000, 15000, 7500, 3250, 1625, 812.5, 406.25, 203.125) then
    raise exception 'Unsupported time control';
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

  insert into public.player_ratings (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select * into target from public.games where id = p_game_id for update;
  if not found or target.status <> 'waiting' or target.white_player = p_user_id then
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

create or replace function public.apply_ultrabullet_rating_changes(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  target public.games;
  rating_column text;
  white_rating integer;
  black_rating integer;
  white_score numeric;
  expected_white numeric;
  white_delta integer;
  updated_rating integer;
begin
  select * into target from public.games where id = p_game_id for update;
  if not found or target.status <> 'finished' or target.ratings_applied_at is not null
     or target.black_player is null then
    return;
  end if;

  rating_column := case target.initial_time_ms
    when 30000 then 'hyperbullet_rating'
    when 15000 then 'ultrabullet_rating'
    when 7500 then 'ultrazerk_rating'
    when 3250 then 'psycho_3250_rating'
    when 1625 then 'psycho_1625_rating'
    when 812.5 then 'psycho_812_5_rating'
    when 406.25 then 'psycho_406_25_rating'
    when 203.125 then 'psycho_203_125_rating'
    else null
  end;
  if rating_column is null then raise exception 'Unsupported rating pool'; end if;

  insert into public.player_ratings (user_id) values (target.white_player), (target.black_player)
  on conflict (user_id) do nothing;

  perform user_id from public.player_ratings
  where user_id in (target.white_player, target.black_player)
  order by user_id for update;

  execute format('select coalesce(%I, 1500) from public.player_ratings where user_id = $1', rating_column)
    into white_rating using target.white_player;
  execute format('select coalesce(%I, 1500) from public.player_ratings where user_id = $1', rating_column)
    into black_rating using target.black_player;

  white_rating := coalesce(target.white_rating_before, white_rating, 1500);
  black_rating := coalesce(target.black_rating_before, black_rating, 1500);
  white_score := case target.result when '1-0' then 1.0 when '0-1' then 0.0 else 0.5 end;
  expected_white := 1.0 / (1.0 + power(10.0, (black_rating - white_rating)::numeric / 400.0));
  white_delta := round(32.0 * (white_score - expected_white))::integer;

  execute format(
    'update public.player_ratings
       set %1$I = greatest(100, coalesce(%1$I, 1500) + $1),
           games_played = games_played + 1,
           wins = wins + $2, draws = draws + $3, losses = losses + $4,
           updated_at = clock_timestamp()
     where user_id = $5', rating_column
  ) using white_delta,
    case when white_score = 1.0 then 1 else 0 end,
    case when white_score = 0.5 then 1 else 0 end,
    case when white_score = 0.0 then 1 else 0 end,
    target.white_player;

  execute format(
    'update public.player_ratings
       set %1$I = greatest(100, coalesce(%1$I, 1500) - $1),
           games_played = games_played + 1,
           wins = wins + $2, draws = draws + $3, losses = losses + $4,
           updated_at = clock_timestamp()
     where user_id = $5', rating_column
  ) using white_delta,
    case when white_score = 0.0 then 1 else 0 end,
    case when white_score = 0.5 then 1 else 0 end,
    case when white_score = 1.0 then 1 else 0 end,
    target.black_player;

  execute format('select %I from public.player_ratings where user_id = $1', rating_column)
    into updated_rating using target.white_player;
  insert into public.player_rating_history(user_id, game_id, rating_pool, rating)
    values (target.white_player, p_game_id, target.rating_pool, updated_rating)
    on conflict (game_id, user_id) do update set rating = excluded.rating, recorded_at = clock_timestamp();

  execute format('select %I from public.player_ratings where user_id = $1', rating_column)
    into updated_rating using target.black_player;
  insert into public.player_rating_history(user_id, game_id, rating_pool, rating)
    values (target.black_player, p_game_id, target.rating_pool, updated_rating)
    on conflict (game_id, user_id) do update set rating = excluded.rating, recorded_at = clock_timestamp();

  update public.games
    set white_rating_change = white_delta,
        black_rating_change = -white_delta,
        ratings_applied_at = clock_timestamp()
  where id = p_game_id;
end;
$function$;

create or replace function public.commit_ultrabullet_move(
  p_game_id uuid,
  p_user_id uuid,
  p_expected_ply integer,
  p_expected_fen text,
  p_from text,
  p_to text,
  p_promotion text,
  p_san text,
  p_fen_after text,
  p_white_time_ms numeric,
  p_black_time_ms numeric,
  p_turn_color text,
  p_result text default null,
  p_termination text default null
)
returns public.games
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  target public.games;
  next_ply integer;
begin
  select * into target from public.games where id = p_game_id for update;
  if not found or target.status <> 'active' then raise exception 'Game is not active'; end if;
  if target.ply <> p_expected_ply or target.fen <> p_expected_fen then
    raise exception 'Position changed; refresh the game';
  end if;
  if (target.turn_color = 'white' and target.white_player <> p_user_id)
     or (target.turn_color = 'black' and target.black_player <> p_user_id) then
    raise exception 'It is not your turn'; end if;
  next_ply := target.ply + 1;
  if p_white_time_ms < 0 or p_black_time_ms < 0
     or p_white_time_ms > target.initial_time_ms + (next_ply * target.increment_ms)
     or p_black_time_ms > target.initial_time_ms + (next_ply * target.increment_ms) then
    raise exception 'Invalid clock state'; end if;
  if p_turn_color not in ('white','black') then raise exception 'Invalid turn'; end if;
  if (p_result is null and p_termination is not null)
     or (p_result is not null and (p_result not in ('1-0','0-1','1/2-1/2')
         or p_termination not in ('checkmate','stalemate','draw'))) then
    raise exception 'Invalid result state';
  end if;

  update public.games
    set fen = p_fen_after, ply = next_ply,
        white_time_ms = p_white_time_ms, black_time_ms = p_black_time_ms,
        turn_color = p_turn_color, last_move_at = clock_timestamp(),
        status = case when p_result is null then 'active' else 'finished' end,
        result = p_result, termination = p_termination,
        finished_at = case when p_result is null then null else clock_timestamp() end
    where id = p_game_id returning * into target;

  insert into public.game_moves (
    game_id, ply, player_id, from_square, to_square, promotion, san, fen_after
  ) values (
    p_game_id, next_ply, p_user_id, p_from, p_to, p_promotion, p_san, p_fen_after
  );

  if p_result is not null then
    perform public.apply_ultrabullet_rating_changes(p_game_id);
    select * into target from public.games where id = p_game_id;
  end if;
  return target;
end;
$function$;

create or replace function public.finish_ultrabullet_game(
  p_game_id uuid,
  p_user_id uuid,
  p_result text,
  p_termination text
)
returns public.games
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  target public.games;
begin
  select * into target from public.games where id = p_game_id for update;
  if not found or target.status <> 'active' then raise exception 'Game is not active'; end if;
  if p_user_id <> target.white_player and p_user_id <> target.black_player then
    raise exception 'Not a game participant';
  end if;
  if p_result not in ('1-0','0-1','1/2-1/2')
     or p_termination not in ('resignation','timeout','draw','checkmate','stalemate') then
    raise exception 'Invalid game result';
  end if;

  update public.games
    set status = 'finished',
        result = p_result,
        termination = p_termination,
        white_time_ms = case when p_termination = 'timeout' and turn_color = 'white' then 0 else white_time_ms end,
        black_time_ms = case when p_termination = 'timeout' and turn_color = 'black' then 0 else black_time_ms end,
        finished_at = clock_timestamp()
    where id = p_game_id returning * into target;

  perform public.apply_ultrabullet_rating_changes(p_game_id);
  select * into target from public.games where id = p_game_id;
  return target;
end;
$function$;

-- SECURITY DEFINER game RPCs are service-role-only; the Edge Function authenticates
-- the user and supplies the verified identity. Keep direct client invocation closed.
revoke all on function public.create_ultrabullet_game(uuid,numeric,numeric) from public, anon, authenticated;
revoke all on function public.join_ultrabullet_game(uuid,uuid) from public, anon, authenticated;
revoke all on function public.commit_ultrabullet_move(uuid,uuid,integer,text,text,text,text,text,text,numeric,numeric,text,text,text) from public, anon, authenticated;
revoke all on function public.finish_ultrabullet_game(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.apply_ultrabullet_rating_changes(uuid) from public, anon, authenticated;
grant execute on function public.create_ultrabullet_game(uuid,numeric,numeric) to service_role;
grant execute on function public.join_ultrabullet_game(uuid,uuid) to service_role;
grant execute on function public.commit_ultrabullet_move(uuid,uuid,integer,text,text,text,text,text,text,numeric,numeric,text,text,text) to service_role;
grant execute on function public.finish_ultrabullet_game(uuid,uuid,text,text) to service_role;
grant execute on function public.apply_ultrabullet_rating_changes(uuid) to service_role;
