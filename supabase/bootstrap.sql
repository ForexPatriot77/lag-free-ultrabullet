-- Lag-Free Ultrabullet database baseline.
-- For a brand-new Supabase project only. Apply this file once, then apply the
-- timestamped migrations in supabase/migrations in ascending order.
-- Do not run this baseline against an existing populated project.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    constraint profiles_username_format check (username = lower(username) and username ~ '^[a-z0-9_]{3,20}$'),
  display_name text
    constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 32),
  bio text
    constraint profiles_bio_length check (bio is null or char_length(bio) <= 160),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  white_player uuid not null references auth.users(id) on delete cascade,
  black_player uuid references auth.users(id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting','active','finished')),
  initial_time_ms numeric not null default 15000 constraint games_initial_time_ms_check check (initial_time_ms = 15000),
  increment_ms numeric not null default 0 constraint games_increment_ms_check check (increment_ms >= 0 and increment_ms <= 60000),
  white_time_ms numeric not null default 15000 check (white_time_ms >= 0),
  black_time_ms numeric not null default 15000 check (black_time_ms >= 0),
  turn_color text not null default 'white' check (turn_color in ('white','black')),
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  ply integer not null default 0 check (ply >= 0),
  result text check (result in ('1-0','0-1','1/2-1/2')),
  termination text check (termination in ('checkmate','stalemate','draw','resignation','timeout')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  last_move_at timestamptz,
  finished_at timestamptz,
  white_rating_before integer,
  black_rating_before integer,
  white_rating_change integer,
  black_rating_change integer,
  ratings_applied_at timestamptz,
  constraint games_distinct_players check (black_player is null or black_player <> white_player),
  constraint games_finished_consistency check (
    (status = 'finished' and result is not null and finished_at is not null)
    or (status <> 'finished' and result is null and finished_at is null)
  )
);

create table public.game_moves (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  ply integer not null check (ply > 0),
  player_id uuid not null references auth.users(id) on delete cascade,
  from_square text not null check (from_square ~ '^[a-h][1-8]$'),
  to_square text not null check (to_square ~ '^[a-h][1-8]$'),
  promotion text check (promotion in ('q','r','b','n')),
  san text not null,
  fen_after text not null,
  created_at timestamptz not null default now(),
  unique (game_id, ply)
);

create table public.player_ratings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ultrabullet_rating integer not null default 1500 check (ultrabullet_rating >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  updated_at timestamptz not null default now(),
  constraint player_rating_record_counts check (games_played = wins + draws + losses)
);

create index games_white_player_idx on public.games (white_player, created_at desc);
create index games_black_player_idx on public.games (black_player, created_at desc);
create index games_waiting_created_idx on public.games (created_at desc) where status = 'waiting';
create index game_moves_player_id_idx on public.game_moves (player_id);

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_moves enable row level security;
alter table public.player_ratings enable row level security;

create policy "Profiles are publicly readable" on public.profiles
  for select to anon, authenticated using (true);
create policy "Players can create their own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "Players can update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Signed-in users can read public games" on public.games
  for select to authenticated using (
    status in ('waiting','active','finished')
    or (select auth.uid()) = white_player
    or (select auth.uid()) = black_player
  );
create policy "Signed-in users can read public game moves" on public.game_moves
  for select to authenticated using (
    exists (
      select 1 from public.games g
      where g.id = game_moves.game_id
        and (g.status in ('active','finished')
          or (select auth.uid()) = g.white_player
          or (select auth.uid()) = g.black_player)
    )
  );
create policy "Players can view public ratings" on public.player_ratings
  for select to authenticated using (true);

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.games, public.game_moves, public.player_ratings to authenticated;
grant all on public.profiles, public.games, public.game_moves, public.player_ratings to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'player_' || substr(replace(new.id::text, '-', ''), 1, 8),
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), '')
  );
  return new;
end;
$function$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.apply_ultrabullet_rating_changes(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  target public.games;
  white_rating integer;
  black_rating integer;
  white_score numeric;
  expected_white numeric;
  white_delta integer;
begin
  select * into target from public.games where id = p_game_id for update;
  if not found or target.status <> 'finished' or target.ratings_applied_at is not null then return; end if;

  insert into public.player_ratings (user_id) values (target.white_player)
    on conflict (user_id) do nothing;
  insert into public.player_ratings (user_id) values (target.black_player)
    on conflict (user_id) do nothing;

  perform user_id from public.player_ratings
    where user_id in (target.white_player, target.black_player)
    order by user_id for update;

  select ultrabullet_rating into white_rating from public.player_ratings where user_id = target.white_player;
  select ultrabullet_rating into black_rating from public.player_ratings where user_id = target.black_player;

  white_rating := coalesce(target.white_rating_before, white_rating);
  black_rating := coalesce(target.black_rating_before, black_rating);
  white_score := case target.result when '1-0' then 1.0 when '0-1' then 0.0 else 0.5 end;
  expected_white := 1.0 / (1.0 + power(10.0, (black_rating - white_rating)::numeric / 400.0));
  white_delta := round(32.0 * (white_score - expected_white))::integer;

  update public.player_ratings
    set ultrabullet_rating = greatest(100, ultrabullet_rating + white_delta),
        games_played = games_played + 1,
        wins = wins + case when white_score = 1.0 then 1 else 0 end,
        draws = draws + case when white_score = 0.5 then 1 else 0 end,
        losses = losses + case when white_score = 0.0 then 1 else 0 end,
        updated_at = clock_timestamp()
    where user_id = target.white_player;

  update public.player_ratings
    set ultrabullet_rating = greatest(100, ultrabullet_rating - white_delta),
        games_played = games_played + 1,
        wins = wins + case when white_score = 0.0 then 1 else 0 end,
        draws = draws + case when white_score = 0.5 then 1 else 0 end,
        losses = losses + case when white_score = 1.0 then 1 else 0 end,
        updated_at = clock_timestamp()
    where user_id = target.black_player;

  update public.games set white_rating_change = white_delta,
    black_rating_change = -white_delta, ratings_applied_at = clock_timestamp()
    where id = p_game_id;
end;
$function$;

create or replace function public.create_ultrabullet_game(p_user_id uuid, p_initial_time_ms numeric, p_increment_ms numeric)
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
  if p_initial_time_ms <> 15000 or p_increment_ms <> 0 then raise exception 'Unsupported time control'; end if;
  insert into public.player_ratings (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select ultrabullet_rating into current_rating from public.player_ratings where user_id = p_user_id;
  insert into public.games (white_player, white_rating_before, initial_time_ms, white_time_ms, black_time_ms, increment_ms)
  values (p_user_id, current_rating, p_initial_time_ms, p_initial_time_ms, p_initial_time_ms, p_increment_ms)
  returning * into created_game;
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
  insert into public.player_ratings (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select ultrabullet_rating into current_rating from public.player_ratings where user_id = p_user_id;
  select * into target from public.games where id = p_game_id for update;
  if not found or target.status <> 'waiting' or target.white_player = p_user_id then
    raise exception 'Game is no longer available';
  end if;
  update public.games set black_player = p_user_id, black_rating_before = current_rating,
    status = 'active', started_at = clock_timestamp(), last_move_at = clock_timestamp()
    where id = p_game_id returning * into target;
  return target;
end;
$function$;

create or replace function public.commit_ultrabullet_move(
  p_game_id uuid, p_user_id uuid, p_expected_ply integer, p_expected_fen text,
  p_from text, p_to text, p_promotion text, p_san text, p_fen_after text,
  p_white_time_ms numeric, p_black_time_ms numeric, p_turn_color text,
  p_result text default null, p_termination text default null
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
  if target.ply <> p_expected_ply or target.fen <> p_expected_fen then raise exception 'Position changed; refresh the game'; end if;
  if (target.turn_color = 'white' and target.white_player <> p_user_id)
     or (target.turn_color = 'black' and target.black_player <> p_user_id) then raise exception 'It is not your turn'; end if;
  next_ply := target.ply + 1;
  if p_white_time_ms < 0 or p_black_time_ms < 0
     or p_white_time_ms > target.initial_time_ms + (next_ply * target.increment_ms)
     or p_black_time_ms > target.initial_time_ms + (next_ply * target.increment_ms) then raise exception 'Invalid clock state'; end if;
  if p_turn_color not in ('white','black') then raise exception 'Invalid turn'; end if;
  update public.games set fen = p_fen_after, ply = next_ply,
    white_time_ms = p_white_time_ms, black_time_ms = p_black_time_ms,
    turn_color = p_turn_color, last_move_at = clock_timestamp(),
    status = case when p_result is null then 'active' else 'finished' end,
    result = p_result, termination = p_termination,
    finished_at = case when p_result is null then null else clock_timestamp() end
    where id = p_game_id returning * into target;
  insert into public.game_moves (game_id, ply, player_id, from_square, to_square, promotion, san, fen_after)
    values (p_game_id, next_ply, p_user_id, p_from, p_to, p_promotion, p_san, p_fen_after);
  if p_result is not null and target.initial_time_ms = 15000 and target.increment_ms = 0 then
    perform public.apply_ultrabullet_rating_changes(p_game_id);
    select * into target from public.games where id = p_game_id;
  end if;
  return target;
end;
$function$;

create or replace function public.finish_ultrabullet_game(p_game_id uuid, p_user_id uuid, p_result text, p_termination text)
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
  if p_user_id <> target.white_player and p_user_id <> target.black_player then raise exception 'Not a game participant'; end if;
  if p_result not in ('1-0','0-1','1/2-1/2')
     or p_termination not in ('resignation','timeout','draw','checkmate','stalemate') then raise exception 'Invalid game result'; end if;
  update public.games set status = 'finished', result = p_result, termination = p_termination,
    white_time_ms = case when p_termination = 'timeout' and turn_color = 'white' then 0 else white_time_ms end,
    black_time_ms = case when p_termination = 'timeout' and turn_color = 'black' then 0 else black_time_ms end,
    finished_at = clock_timestamp() where id = p_game_id returning * into target;
  if target.initial_time_ms = 15000 and target.increment_ms = 0 then
    perform public.apply_ultrabullet_rating_changes(p_game_id);
    select * into target from public.games where id = p_game_id;
  end if;
  return target;
end;
$function$;

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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;
