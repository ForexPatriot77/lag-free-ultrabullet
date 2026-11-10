create table if not exists public.arcade_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('frenzy', 'endurance', 'cheat')),
  score integer not null check (score >= 0 and score <= 10000000),
  played_at timestamptz not null default now()
);

create index if not exists arcade_scores_mode_score_idx
  on public.arcade_scores (mode, score desc, played_at asc);
create index if not exists arcade_scores_user_mode_score_idx
  on public.arcade_scores (user_id, mode, score desc);

alter table public.arcade_scores enable row level security;

grant select on public.arcade_scores to anon, authenticated;
grant insert on public.arcade_scores to authenticated;

drop policy if exists "Arcade scores are publicly readable" on public.arcade_scores;
create policy "Arcade scores are publicly readable"
  on public.arcade_scores for select
  to anon, authenticated
  using (true);

drop policy if exists "Players can submit their own arcade scores" on public.arcade_scores;
create policy "Players can submit their own arcade scores"
  on public.arcade_scores for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
