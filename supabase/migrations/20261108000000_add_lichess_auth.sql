alter table public.player_ratings
  add column if not exists hyperbullet_rating integer not null default 1500
  check (hyperbullet_rating >= 100);

create table if not exists public.lichess_accounts (
  lichess_id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  lichess_username text not null,
  bullet_rating integer,
  ultrabullet_rating integer,
  updated_at timestamptz not null default now(),
  constraint lichess_accounts_bullet_rating_nonnegative check (bullet_rating is null or bullet_rating >= 0),
  constraint lichess_accounts_ultrabullet_rating_nonnegative check (ultrabullet_rating is null or ultrabullet_rating >= 0)
);

alter table public.lichess_accounts enable row level security;
revoke all on public.lichess_accounts from anon, authenticated;
grant select on public.lichess_accounts to authenticated;
drop policy if exists "Players can view their own Lichess connection" on public.lichess_accounts;
create policy "Players can view their own Lichess connection"
  on public.lichess_accounts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
