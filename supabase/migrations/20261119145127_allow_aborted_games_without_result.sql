ALTER TABLE public.games DROP CONSTRAINT games_finished_consistency;
ALTER TABLE public.games DROP CONSTRAINT games_termination_check;

ALTER TABLE public.games
  ADD CONSTRAINT games_termination_check
  CHECK (termination = ANY (ARRAY['checkmate','stalemate','draw','resignation','timeout','aborted']::text[]));

ALTER TABLE public.games
  ADD CONSTRAINT games_finished_consistency
  CHECK (
    (
      status = 'finished'
      AND finished_at IS NOT NULL
      AND (
        (result IS NOT NULL AND termination IN ('checkmate','stalemate','draw','resignation','timeout'))
        OR (result IS NULL AND termination = 'aborted' AND ply = 0)
      )
    )
    OR
    (
      status <> 'finished'
      AND result IS NULL
      AND finished_at IS NULL
      AND termination IS NULL
    )
  );