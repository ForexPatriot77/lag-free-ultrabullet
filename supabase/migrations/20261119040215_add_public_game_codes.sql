-- Give every game a stable, shareable ten-character public code.
-- Existing UUID game IDs remain unchanged; the API resolves public codes to UUIDs.
alter table public.games add column public_code text;
update public.games
set public_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
where public_code is null;
alter table public.games alter column public_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
alter table public.games alter column public_code set not null;
alter table public.games add constraint games_public_code_format check (public_code ~ '^[A-F0-9]{10}$');
create unique index games_public_code_unique_idx on public.games (public_code);
