-- Transaction-safe matchmaking queue for all eight exact time controls.

create table if not exists public.matchmaking_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  initial_time_ms numeric not null check (initial_time_ms in (30000,15000,7500,3250,1625,812.5,406.25,203.125)),
  created_at timestamptz not null default clock_timestamp()
);

alter table public.matchmaking_queue enable row level security;
revoke all on public.matchmaking_queue from anon, authenticated;
grant all on public.matchmaking_queue to service_role;

create index if not exists matchmaking_queue_control_created_idx
  on public.matchmaking_queue (initial_time_ms, created_at);

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
  if p_initial_time_ms not in (30000,15000,7500,3250,1625,812.5,406.25,203.125) then
    raise exception 'Unsupported time control';
  end if;

  -- Drop abandoned queue entries and claim exactly one compatible opponent.
  delete from public.matchmaking_queue
  where created_at < clock_timestamp() - interval '2 minutes';

  select user_id into opponent_id
  from public.matchmaking_queue
  where initial_time_ms = p_initial_time_ms
    and user_id <> p_user_id
    and created_at >= clock_timestamp() - interval '2 minutes'
  order by created_at
  limit 1
  for update skip locked;

  if opponent_id is not null then
    delete from public.matchmaking_queue where user_id = opponent_id;
    delete from public.matchmaking_queue where user_id = p_user_id;

    select * into matched_game
    from public.create_ultrabullet_game(opponent_id, p_initial_time_ms, 0);

    select * into matched_game
    from public.join_ultrabullet_game(matched_game.id, p_user_id);

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

create or replace function public.cancel_ultrabullet_matchmaking(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if p_user_id is null then raise exception 'Authentication required'; end if;
  delete from public.matchmaking_queue where user_id = p_user_id;
end;
$function$;

revoke all on function public.find_ultrabullet_match(uuid,numeric) from public, anon, authenticated;
revoke all on function public.cancel_ultrabullet_matchmaking(uuid) from public, anon, authenticated;
grant execute on function public.find_ultrabullet_match(uuid,numeric) to service_role;
grant execute on function public.cancel_ultrabullet_matchmaking(uuid) to service_role;
