-- Safe transactional smoke test for a configured Supabase project.
-- Uses the first existing auth user and rolls back every test row.
-- Run only after bootstrap + all migrations have been applied.

begin;

do $$
declare
  test_user uuid;
  time_ms numeric;
  created_game public.games;
  tested integer := 0;
begin
  select id into test_user from auth.users order by created_at limit 1;
  if test_user is null then
    raise exception 'Create one test account before running the database smoke test';
  end if;

  for time_ms in
    select unnest(array[30000,15000,7500,3250,1625,812.5,406.25,203.125]::numeric[])
  loop
    select * into created_game
    from public.create_ultrabullet_game(test_user, time_ms, 0);

    if created_game.initial_time_ms <> time_ms
       or created_game.rating_pool = 'unsupported' then
      raise exception 'Time-control creation failed for % ms', time_ms;
    end if;

    delete from public.games where id = created_game.id;
    tested := tested + 1;
  end loop;

  raise notice 'Passed: % time-control game creations', tested;
end $$;

select public.find_ultrabullet_match(
  (select id from auth.users order by created_at limit 1),
  15000
) as matchmaking_smoke_test;

select public.cancel_ultrabullet_matchmaking(
  (select id from auth.users order by created_at limit 1)
);

rollback;

-- Expected after rollback: no new games and no matchmaking queue rows.
select
  (select count(*) from public.games) as remaining_games,
  (select count(*) from public.matchmaking_queue) as remaining_queue_entries;
