-- Abort games where the first move is not made before the initial clock expires.
-- Aborted games do not receive a result and never update either player's rating.

create or replace function public.abort_ultrabullet_game(
  p_game_id uuid,
  p_user_id uuid
)
returns public.games
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  target public.games;
begin
  select * into target
  from public.games
  where id = p_game_id
  for update;

  if not found or target.status <> 'active' then
    raise exception 'Game is not active';
  end if;
  if p_user_id <> target.white_player and p_user_id <> target.black_player then
    raise exception 'Not a game participant';
  end if;
  if target.ply <> 0 then
    raise exception 'Only games with no moves can be aborted';
  end if;
  if target.started_at is null
     or clock_timestamp() < target.started_at + (target.initial_time_ms / 1000.0) * interval '1 second' then
    raise exception 'The first-move deadline has not expired';
  end if;

  update public.games
  set status = 'finished',
      result = null,
      termination = 'aborted',
      finished_at = clock_timestamp()
  where id = p_game_id
  returning * into target;

  -- Do not call apply_ultrabullet_rating_changes for an aborted game.
  return target;
end;
$function$;

revoke all on function public.abort_ultrabullet_game(uuid,uuid) from public, anon, authenticated;
grant execute on function public.abort_ultrabullet_game(uuid,uuid) to service_role;
