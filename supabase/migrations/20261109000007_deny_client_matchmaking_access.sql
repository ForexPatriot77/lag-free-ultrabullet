-- Explicitly deny all direct client access; only the service-role Edge Function
-- may read or write matchmaking entries.
drop policy if exists "No client access to matchmaking queue" on public.matchmaking_queue;
create policy "No client access to matchmaking queue"
  on public.matchmaking_queue
  for all
  to anon, authenticated
  using (false)
  with check (false);
