-- Import Lichess starting ratings exactly once and atomically with its marker.
create or replace function public.import_lichess_ratings(
  p_user_id uuid,
  p_lichess_id text,
  p_bullet_rating integer,
  p_ultrabullet_rating integer
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  import_time timestamptz;
begin
  if p_user_id is null or p_lichess_id is null then
    raise exception 'Missing account identity';
  end if;
  if p_bullet_rating is not null and p_bullet_rating < 0 then
    raise exception 'Invalid Bullet rating';
  end if;
  if p_ultrabullet_rating is not null and p_ultrabullet_rating < 0 then
    raise exception 'Invalid Ultrabullet rating';
  end if;

  select ratings_imported_at into import_time
  from public.lichess_accounts
  where lichess_id = p_lichess_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Lichess account link not found'; end if;
  if import_time is not null then return false; end if;

  insert into public.player_ratings(user_id, hyperbullet_rating, ultrabullet_rating)
  values (p_user_id, p_bullet_rating, coalesce(p_ultrabullet_rating, 1500))
  on conflict (user_id) do update set
    hyperbullet_rating = coalesce(excluded.hyperbullet_rating, player_ratings.hyperbullet_rating),
    ultrabullet_rating = case
      when p_ultrabullet_rating is null then player_ratings.ultrabullet_rating
      else excluded.ultrabullet_rating
    end,
    updated_at = clock_timestamp();

  update public.lichess_accounts
  set ratings_imported_at = clock_timestamp()
  where lichess_id = p_lichess_id and user_id = p_user_id;

  return true;
end;
$function$;

revoke all on function public.import_lichess_ratings(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.import_lichess_ratings(uuid,text,integer,integer) to service_role;
