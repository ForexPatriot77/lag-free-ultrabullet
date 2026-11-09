import { withSupabase } from "npm:@supabase/server";
import { Chess } from "npm:chess.js@1.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const unwrap = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? value[0] ?? null : value;

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  const userId = ctx.userClaims?.id;
  if (!userId) return json({ error: "Sign in to play." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const admin = ctx.supabaseAdmin;
  const action = body.action;

  if (action === "create") {
    const { data, error } = await admin.rpc("create_ultrabullet_game", {
      p_user_id: userId,
      p_initial_time_ms: Number(body.initialTimeMs ?? 15000),
      p_increment_ms: Number(body.incrementMs ?? 0),
    });
    if (error) return json({ error: error.message }, 400);
    return json({ game: unwrap(data) });
  }

  if (action === "matchmake") {
    const initialTimeMs = Number(body.initialTimeMs ?? 15000);
    const { data, error } = await admin.rpc("find_ultrabullet_match", {
      p_user_id: userId,
      p_initial_time_ms: initialTimeMs,
    });
    if (error) return json({ error: error.message }, 409);
    return json(data);
  }

  if (action === "cancel_matchmaking") {
    const { error } = await admin.rpc("cancel_ultrabullet_matchmaking", {
      p_user_id: userId,
    });
    if (error) return json({ error: error.message }, 409);
    return json({ ok: true });
  }

  if (action === "list") {
    const { data, error } = await admin
      .from("games")
      .select("id, white_player, created_at, initial_time_ms, increment_ms")
      .eq("status", "waiting")
      .neq("white_player", userId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) return json({ error: error.message }, 400);

    const playerIds = [...new Set((data ?? []).map((g) => g.white_player))];
    const { data: profiles } = playerIds.length
      ? await admin.from("profiles").select("id, username, display_name").in("id", playerIds)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return json({
      games: (data ?? []).map((g) => ({
        ...g,
        opponent: byId.get(g.white_player) ?? null,
      })),
    });
  }

  if (action === "live") {
    const { data, error } = await admin
      .from("games")
      .select("id, white_player, black_player, started_at, ply, turn_color, status")
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(25);
    if (error) return json({ error: error.message }, 400);
    const ids = [...new Set((data ?? []).flatMap((g) => [g.white_player, g.black_player].filter(Boolean)))];
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id, username, display_name").in("id", ids)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return json({
      games: (data ?? []).map((g) => ({
        ...g,
        white: byId.get(g.white_player) ?? null,
        black: g.black_player ? byId.get(g.black_player) ?? null : null,
      })),
    });
  }

  if (action === "leaderboard") {
    const allowedRatingPools = [
      "hyperbullet_rating", "ultrabullet_rating", "ultrazerk_rating",
      "psycho_3250_rating", "psycho_1625_rating", "psycho_812_5_rating",
      "psycho_406_25_rating", "psycho_203_125_rating",
    ] as const;
    const requestedPool = typeof body.ratingPool === "string" ? body.ratingPool : "ultrabullet_rating";
    const ratingPool = allowedRatingPools.find((pool) => pool === requestedPool) ?? "ultrabullet_rating";
    const { data, error } = await admin
      .from("player_ratings")
      .select("user_id, hyperbullet_rating, ultrabullet_rating, ultrazerk_rating, psycho_3250_rating, psycho_1625_rating, psycho_812_5_rating, psycho_406_25_rating, psycho_203_125_rating, games_played, wins, draws, losses")
      .order(ratingPool, { ascending: false, nullsFirst: false })
      .order("games_played", { ascending: false })
      .limit(50);
    if (error) return json({ error: error.message }, 400);
    const ids = (data ?? []).map((p) => p.user_id);
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id, username, display_name").in("id", ids)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return json({
      players: (data ?? []).map((p) => ({
        ...p,
        rating: p[ratingPool],
        profile: byId.get(p.user_id) ?? null,
      })),
    });
  }

  if (action === "history") {
    const { data, error } = await admin
      .from("games")
      .select("id, white_player, black_player, status, result, termination, created_at, finished_at, white_rating_change, black_rating_change")
      .or(`white_player.eq.${userId},black_player.eq.${userId}`)
      .eq("status", "finished")
      .order("finished_at", { ascending: false })
      .limit(20);
    if (error) return json({ error: error.message }, 400);

    const opponents = [...new Set((data ?? []).map((g) =>
      g.white_player === userId ? g.black_player : g.white_player
    ).filter(Boolean))];
    const { data: profiles } = opponents.length
      ? await admin.from("profiles").select("id, username, display_name").in("id", opponents)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return json({
      games: (data ?? []).map((g) => {
        const opponentId = g.white_player === userId ? g.black_player : g.white_player;
        return { ...g, opponent: opponentId ? byId.get(opponentId) ?? null : null };
      }),
    });
  }

  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  if (!gameId || !/^[0-9a-f-]{36}$/i.test(gameId)) {
    return json({ error: "A valid game ID is required." }, 400);
  }

  if (action === "join") {
    const { data, error } = await admin.rpc("join_ultrabullet_game", {
      p_game_id: gameId,
      p_user_id: userId,
    });
    if (error) return json({ error: error.message }, 409);
    return json({ game: unwrap(data) });
  }

  if (action === "cancel") {
    const { error } = await admin.rpc("cancel_waiting_game", {
      p_game_id: gameId,
      p_user_id: userId,
    });
    if (error) return json({ error: error.message }, 409);
    return json({ ok: true });
  }

  const { data: game, error: loadError } = await admin
    .from("games")
    .select("*")
    .eq("id", gameId)
    .maybeSingle();

  if (loadError) return json({ error: loadError.message }, 400);
  if (!game) return json({ error: "Game not found." }, 404);
  const isParticipant = game.white_player === userId || game.black_player === userId;
  if (!isParticipant && !["active", "finished"].includes(game.status)) {
    return json({ error: "You cannot view this game yet." }, 403);
  }

  if (action === "state") {
    if (game.status === "active" && game.last_move_at) {
      const elapsed = Math.max(0, Date.now() - new Date(game.last_move_at).getTime());
      const remaining = game.turn_color === "white" ? game.white_time_ms : game.black_time_ms;
      if (elapsed >= remaining && isParticipant) {
        const chess = new Chess(game.fen);
        const timeoutIsDraw = chess.isInsufficientMaterial();
        const result = timeoutIsDraw
          ? "1/2-1/2"
          : game.turn_color === "white" ? "0-1" : "1-0";
        const { error } = await admin.rpc("finish_ultrabullet_game", {
          p_game_id: gameId,
          p_user_id: userId,
          p_result: result,
          p_termination: timeoutIsDraw ? "draw" : "timeout",
        });
        if (error) return json({ error: error.message }, 409);
      }
    }

    const [{ data: freshGame }, { data: moves }] = await Promise.all([
      admin.from("games").select("*").eq("id", gameId).single(),
      admin.from("game_moves").select("ply, player_id, from_square, to_square, promotion, san, fen_after, created_at")
        .eq("game_id", gameId).order("ply", { ascending: true }),
    ]);
    return json({ game: freshGame, moves: moves ?? [], serverTime: Date.now() });
  }

  if (action === "move") {
    if (!isParticipant) return json({ error: "Spectators cannot move pieces." }, 403);
    if (game.status !== "active") return json({ error: "This game is not active." }, 409);
    const isWhite = game.white_player === userId;
    if ((game.turn_color === "white") !== isWhite) {
      return json({ error: "It is not your turn." }, 409);
    }

    const elapsed = Math.max(0, Date.now() - new Date(game.last_move_at).getTime());
    const currentTime = game.turn_color === "white" ? game.white_time_ms : game.black_time_ms;
    if (elapsed >= currentTime) {
      const chess = new Chess(game.fen);
      const timeoutIsDraw = chess.isInsufficientMaterial();
      const result = timeoutIsDraw ? "1/2-1/2" : isWhite ? "0-1" : "1-0";
      const { error } = await admin.rpc("finish_ultrabullet_game", {
        p_game_id: gameId,
        p_user_id: userId,
        p_result: result,
        p_termination: timeoutIsDraw ? "draw" : "timeout",
      });
      if (error) return json({ error: error.message }, 409);
      return json({ error: "Your clock expired.", finished: true }, 409);
    }

    const from = typeof body.from === "string" ? body.from : "";
    const to = typeof body.to === "string" ? body.to : "";
    const promotion = typeof body.promotion === "string" ? body.promotion : "q";
    if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to) ||
        !["q", "r", "b", "n"].includes(promotion)) {
      return json({ error: "Invalid move format." }, 400);
    }

    const chess = new Chess(game.fen);
    let move;
    try {
      move = chess.move({ from, to, promotion });
    } catch {
      return json({ error: "That move is not legal." }, 400);
    }
    if (!move) return json({ error: "That move is not legal." }, 400);

    let whiteTime = game.white_time_ms;
    let blackTime = game.black_time_ms;
    if (isWhite) whiteTime = Math.max(0, whiteTime - elapsed) + game.increment_ms;
    else blackTime = Math.max(0, blackTime - elapsed) + game.increment_ms;

    let result: string | null = null;
    let termination: string | null = null;
    if (chess.isCheckmate()) {
      result = move.color === "w" ? "1-0" : "0-1";
      termination = "checkmate";
    } else if (chess.isStalemate()) {
      result = "1/2-1/2";
      termination = "stalemate";
    } else if (chess.isDraw()) {
      result = "1/2-1/2";
      termination = "draw";
    }

    const { data, error } = await admin.rpc("commit_ultrabullet_move", {
      p_game_id: gameId,
      p_user_id: userId,
      p_expected_ply: game.ply,
      p_expected_fen: game.fen,
      p_from: from,
      p_to: to,
      p_promotion: move.promotion ?? null,
      p_san: move.san,
      p_fen_after: chess.fen(),
      p_white_time_ms: whiteTime,
      p_black_time_ms: blackTime,
      p_turn_color: chess.turn() === "w" ? "white" : "black",
      p_result: result,
      p_termination: termination,
    });
    if (error) return json({ error: error.message }, 409);
    return json({ game: unwrap(data), move: { san: move.san, from, to }, serverTime: Date.now() });
  }

  if (action === "resign") {
    if (game.status !== "active") return json({ error: "This game is not active." }, 409);
    const result = game.white_player === userId ? "0-1" : "1-0";
    const { data, error } = await admin.rpc("finish_ultrabullet_game", {
      p_game_id: gameId,
      p_user_id: userId,
      p_result: result,
      p_termination: "resignation",
    });
    if (error) return json({ error: error.message }, 409);
    return json({ game: unwrap(data) });
  }

  return json({ error: "Unknown action." }, 400);
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const response = await handler(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
