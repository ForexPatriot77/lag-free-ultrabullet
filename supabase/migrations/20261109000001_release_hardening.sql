-- Release hardening: least-privilege profile grants, challenge expiry, and cancellation.

revoke insert, update, delete on public.profiles from anon;
revoke delete on public.profiles from authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

drop index if exists public.games_waiting_created_idx;

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

create or replace function public.cancel_waiting_game(p_game_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  delete from public.games
  where id = p_game_id and white_player = p_user_id and status = 'waiting';
  if not found then raise exception 'Only the challenge creator can cancel an open challenge'; end if;
end;
$function$;

revoke all on function public.join_ultrabullet_game(uuid,uuid) from public, anon, authenticated;
grant execute on function public.join_ultrabullet_game(uuid,uuid) to service_role;
revoke all on function public.cancel_waiting_game(uuid,uuid) from public, anon, authenticated;
grant execute on function public.cancel_waiting_game(uuid,uuid) to service_role;
