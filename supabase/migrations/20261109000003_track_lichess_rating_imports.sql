-- Track whether initial Lichess ratings were successfully imported.
alter table public.lichess_accounts
  add column if not exists ratings_imported_at timestamptz;

-- Accounts already linked by the previous implementation had their starting
-- ratings imported. Mark them so a later OAuth sign-in never resets local Elo.
update public.lichess_accounts
set ratings_imported_at = coalesce(ratings_imported_at, updated_at, clock_timestamp())
where ratings_imported_at is null;
