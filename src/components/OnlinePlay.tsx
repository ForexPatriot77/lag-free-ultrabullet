import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Chess } from "chess.js";
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Color, Key } from "@lichess-org/chessground/types";
import { supabase } from "../lib/supabase";
import { TIME_CONTROLS, controlLabel, ratingColumnForTime } from "../lib/timeControls";
import type { TimeControl } from "../lib/timeControls";
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

type GameRow = {
  id: string;
  white_player: string;
  black_player: string | null;
  status: "waiting" | "active" | "finished";
  initial_time_ms: number;
  increment_ms: number;
  white_time_ms: number;
  black_time_ms: number;
  turn_color: "white" | "black";
  fen: string;
  ply: number;
  result: string | null;
  termination: string | null;
  last_move_at: string | null;
  created_at: string;
};

type MoveRow = {
  ply: number;
  player_id: string;
  from_square: string;
  to_square: string;
  promotion: string | null;
  san: string;
};

type LobbyGame = {
  id: string;
  white_player: string;
  created_at: string;
  initial_time_ms: number;
  increment_ms: number;
  opponent: { username: string; display_name: string | null } | null;
};

type HistoryGame = {
  id: string;
  white_player: string;
  black_player: string | null;
  result: string | null;
  termination: string | null;
  finished_at: string | null;
  white_rating_change: number | null;
  black_rating_change: number | null;
  opponent: { username: string; display_name: string | null } | null;
};

type LiveGame = {
  id: string;
  white_player: string;
  black_player: string;
  started_at: string | null;
  ply: number;
  turn_color: "white" | "black";
  white: { username: string; display_name: string | null } | null;
  black: { username: string; display_name: string | null } | null;
};

type LeaderboardPlayer = {
  user_id: string;
  rating: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  profile: { username: string; display_name: string | null } | null;
};

function destinations(chess: Chess): Map<Key, Key[]> {
  const result = new Map<Key, Key[]>();
  for (const rank of "12345678") {
    for (const file of "abcdefgh") {
      const square = `${file}${rank}`;
      const moves = chess.moves({ square: square as never, verbose: true });
      if (moves.length) result.set(square as Key, moves.map((move) => move.to as Key));
    }
  }
  return result;
}

function clockText(ms: number): string {
  const seconds = Math.max(0, ms / 1000);
  return seconds < 1 ? seconds.toFixed(3) + "s" : seconds.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "s";
}

export function OnlinePlay({ user, initialGameId, onOpenProfile }: { user: User; initialGameId?: string | null; onOpenProfile?: (username: string) => void }) {
  const [gameId, setGameId] = useState<string | null>(initialGameId ?? null);
  const [game, setGame] = useState<GameRow | null>(null);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [lobby, setLobby] = useState<LobbyGame[]>([]);
  const [history, setHistory] = useState<HistoryGame[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [selectedControl, setSelectedControl] = useState<TimeControl>(TIME_CONTROLS[1]);
  const [promotion, setPromotion] = useState<"q" | "r" | "b" | "n">("q");
  const [boardOrientation, setBoardOrientation] = useState<Color>("white");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tick, setTick] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const boardElement = useRef<HTMLDivElement>(null);
  const ground = useRef<Api | null>(null);
  const gameRef = useRef<GameRow | null>(null);
  const timeoutRequested = useRef<string | null>(null);
  const orientedGameId = useRef<string | null>(null);
  const userId = user.id;

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("ultrabullet", { body });
    if (error) {
      // Supabase FunctionsHttpError carries the actual HTTP response in context.
      // Surface the server's JSON error instead of the generic non-2xx message.
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        const payload = await context.clone().json().catch(() => null) as { error?: unknown; message?: unknown } | null;
        if (typeof payload?.error === "string") throw new Error(payload.error);
        if (typeof payload?.message === "string") throw new Error(payload.message);
      }
      throw new Error(error.message || "Could not reach the game server.");
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadLobby = useCallback(async () => {
    try {
      const data = await invoke({ action: "list" });
      setLobby((data.games ?? []) as LobbyGame[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load open challenges.");
    }
  }, [invoke]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await invoke({ action: "history" });
      setHistory((data.games ?? []) as HistoryGame[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load game history.");
    }
  }, [invoke]);

  const loadLeaderboard = useCallback(async () => {
    try {
      const data = await invoke({ action: "leaderboard", ratingPool: ratingColumnForTime(selectedControl.initialTimeMs) });
      setLeaderboard((data.players ?? []) as LeaderboardPlayer[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the leaderboard.");
    }
  }, [invoke, selectedControl.initialTimeMs]);

  const loadLiveGames = useCallback(async () => {
    try {
      const data = await invoke({ action: "live" });
      setLiveGames((data.games ?? []) as LiveGame[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load live games.");
    }
  }, [invoke]);

  const loadMyRating = useCallback(async () => {
    const { data } = await supabase
      .from("player_ratings")
      .select("hyperbullet_rating, ultrabullet_rating, ultrazerk_rating, psycho_3250_rating, psycho_1625_rating, psycho_812_5_rating, psycho_406_25_rating, psycho_203_125_rating")
      .eq("user_id", userId)
      .maybeSingle();
    const column = ratingColumnForTime(selectedControl.initialTimeMs);
    setMyRating(data?.[column] ?? null);
  }, [userId, selectedControl.initialTimeMs]);

  const loadState = useCallback(async (id: string) => {
    const data = await invoke({ action: "state", gameId: id });
    setServerOffset((data.serverTime ?? Date.now()) - Date.now());
    setGame(data.game as GameRow);
    if (orientedGameId.current !== id) {
      orientedGameId.current = id;
      const row = data.game as GameRow;
      setBoardOrientation(row.white_player === userId ? "white" : row.black_player === userId ? "black" : "white");
    }
    setMoves((data.moves ?? []) as MoveRow[]);
  }, [invoke]);

  const openGame = useCallback(async (id: string, tryJoin = true) => {
    setLoading(true);
    setMessage("");
    try {
      try {
        await loadState(id);
      } catch (firstError) {
        if (!tryJoin) throw firstError;
        await invoke({ action: "join", gameId: id });
        await loadState(id);
      }
      setGameId(id);
      await loadMyRating();
      const url = new URL(window.location.href);
      url.searchParams.set("game", id);
      window.history.replaceState({}, "", url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open this game.");
    } finally {
      setLoading(false);
    }
  }, [invoke, loadState, loadMyRating]);

  useEffect(() => {
    if (initialGameId) void openGame(initialGameId);
    else {
      void loadLobby();
      void loadHistory();
      void loadLeaderboard();
      void loadLiveGames();
    }
    void loadMyRating();
  }, [initialGameId, openGame, loadLobby, loadHistory, loadLeaderboard, loadLiveGames, loadMyRating]);

  useEffect(() => {
    if (!gameId) return;
    const channel = supabase
      .channel(`game:${gameId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "games",
        filter: `id=eq.${gameId}`,
      }, () => { void loadState(gameId).catch(() => undefined); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [gameId, loadState]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 50);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (game) gameRef.current = game;
  }, [game]);

  const sendMove = useCallback(async (from: string, to: string) => {
    const current = gameRef.current;
    if (!current || current.status !== "active" || busy) return;
    if (current.white_player !== userId && current.black_player !== userId) return;
    const myColor = current.white_player === userId ? "white" : "black";
    if (current.turn_color !== myColor) return;
    setBusy(true);
    try {
      await invoke({ action: "move", gameId: current.id, from, to, promotion });
      await loadState(current.id);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Move was not accepted.");
      await loadState(current.id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }, [busy, invoke, loadState, promotion, userId]);

  const moveHandler = useRef(sendMove);
  useEffect(() => { moveHandler.current = sendMove; }, [sendMove]);

  useEffect(() => {
    if (!boardElement.current) return;
    ground.current = Chessground(boardElement.current, {
      fen: game?.fen,
      orientation: boardOrientation,
      coordinates: true,
      animation: { enabled: true, duration: 100 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, color: undefined, dests: new Map(), events: {
        after: (from, to) => moveHandler.current(from, to),
      } },
      draggable: { showGhost: true },
      premovable: { enabled: false },
      drawable: { enabled: true, visible: true },
    });
    return () => {
      ground.current?.destroy();
      ground.current = null;
    };
  }, [userId, Boolean(game)]);

  useEffect(() => {
    if (!game) return;
    const chess = new Chess(game.fen);
    const isPlayer = game.white_player === userId || game.black_player === userId;
    const myColor: Color = isPlayer ? (game.white_player === userId ? "white" : "black") : "white";
    const canMove = isPlayer && game.status === "active" && game.turn_color === myColor && !busy;
    ground.current?.set({
      fen: game.fen,
      orientation: boardOrientation,
      turnColor: game.turn_color,
      check: chess.isCheck() ? game.turn_color : undefined,
      movable: {
        color: canMove ? myColor : undefined,
        dests: destinations(chess),
      },
    });
  }, [game, userId, busy, boardOrientation]);

  const createGame = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await invoke({ action: "create", initialTimeMs: selectedControl.initialTimeMs, incrementMs: selectedControl.incrementMs });
      const id = data.game.id as string;
      await openGame(id, false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create a challenge.");
    } finally {
      setBusy(false);
    }
  };

  const resign = async () => {
    if (!game) return;
    setBusy(true);
    try {
      await invoke({ action: "resign", gameId: game.id });
      await loadState(game.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not resign.");
    } finally {
      setBusy(false);
    }
  };

  const shareInvite = async () => {
    if (!game) return;
    const url = new URL(window.location.href);
    url.searchParams.set("game", game.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setMessage("Challenge link copied. Send it to your opponent.");
    } catch {
      setMessage(url.toString());
    }
  };

  const backToLobby = () => {
    setGame(null);
    setMoves([]);
    setGameId(null);
    orientedGameId.current = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("game");
    window.history.replaceState({}, "", url);
    void loadLobby();
    void loadHistory();
    void loadLeaderboard();
    void loadLiveGames();
    void loadMyRating();
  };

  const cancelChallenge = async () => {
    if (!game || game.status !== "waiting") return;
    setBusy(true);
    try {
      await invoke({ action: "cancel", gameId: game.id });
      backToLobby();
      setMessage("Challenge cancelled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not cancel the challenge.");
    } finally {
      setBusy(false);
    }
  };

  const isWhite = game?.white_player === userId;
  const isParticipant = Boolean(game && (game.white_player === userId || game.black_player === userId));
  const myColor: Color = isParticipant ? (isWhite ? "white" : "black") : "white";
  const currentRemaining = useMemo(() => {
    if (!game) return selectedControl.initialTimeMs;
    const base = game.turn_color === "white" ? game.white_time_ms : game.black_time_ms;
    if (game.status !== "active" || !game.last_move_at) return base;
    const elapsed = Date.now() + serverOffset - new Date(game.last_move_at).getTime();
    return Math.max(0, base - elapsed);
  }, [game, serverOffset, tick]);
  const whiteClock = game
    ? game.white_time_ms - (game.status === "active" && game.turn_color === "white" && game.last_move_at
      ? Math.max(0, Date.now() + serverOffset - new Date(game.last_move_at).getTime()) : 0)
    : selectedControl.initialTimeMs;
  const blackClock = game
    ? game.black_time_ms - (game.status === "active" && game.turn_color === "black" && game.last_move_at
      ? Math.max(0, Date.now() + serverOffset - new Date(game.last_move_at).getTime()) : 0)
    : selectedControl.initialTimeMs;

  useEffect(() => {
    if (game?.status === "active" && currentRemaining <= 0 && timeoutRequested.current !== game.id) {
      timeoutRequested.current = game.id;
      void loadState(game.id).catch(() => undefined);
    }
  }, [game?.id, game?.status, currentRemaining, loadState]);

  useEffect(() => {
    if (game?.status === "finished") void loadMyRating();
  }, [game?.status, loadMyRating]);

  const status = !game ? "Choose an online game" :
    game.status === "waiting" ? "Waiting for an opponent" :
    game.status === "finished" ? `Game finished · ${game.result ?? ""} · ${game.termination ?? ""}` :
    !isParticipant ? "Watching live game" :
    game.turn_color === myColor ? "Your turn" : "Opponent's turn";

  return (
    <section className="online-section" id="online-play">
      <div className="online-heading">
        <div>
          <span className="online-kicker">LIVE CHESS</span>
          <h2>Online chess</h2>
          <p>Server-validated moves · live clocks · eight no-increment time controls</p>
          <span className="my-rating">Your {selectedControl.category} rating: <strong>{myRating ?? "Unrated"}</strong></span>
        </div>
        {game && <button className="online-secondary" type="button" onClick={backToLobby}>Back to lobby</button>}
      </div>

      {message && <div className="online-message" role="status">{message}</div>}

      {!game && (
        <div className="online-lobby">
          <div className="lobby-create">
            <div>
              <strong>Challenge someone</strong>
              <span>Choose your speed. Each time control has its own rating pool.</span>
            </div>
            <label className="time-control-picker">Time control
              <select value={String(selectedControl.initialTimeMs) + "-" + String(selectedControl.incrementMs)} onChange={(event) => {
                const parts = event.target.value.split("-").map(Number);
                const found = TIME_CONTROLS.find((item) => item.initialTimeMs === parts[0] && item.incrementMs === parts[1]);
                if (found) setSelectedControl(found);
              }}>
                {TIME_CONTROLS.map((item) => <option key={item.initialTimeMs + "-" + item.incrementMs} value={item.initialTimeMs + "-" + item.incrementMs}>{item.label}</option>)}
              </select>
            </label>
            <button className="online-primary" type="button" disabled={busy || loading} onClick={createGame}>
              {busy ? "Creating…" : "＋ Create challenge"}
            </button>
          </div>
          <div className="lobby-list-head">
            <strong>Open challenges</strong>
            <button type="button" onClick={() => void loadLobby()}>↻ Refresh</button>
          </div>
          {lobby.length === 0 ? (
            <div className="lobby-empty">No open challenges right now. Create one and invite a friend.</div>
          ) : lobby.map((item) => (
            <div className="lobby-row" key={item.id}>
              <div className="lobby-avatar">♟</div>
              <div className="lobby-player">
                <strong>{item.opponent?.username && onOpenProfile ? <button className="player-name-link" onClick={() => onOpenProfile(item.opponent!.username)}>{item.opponent.display_name || item.opponent.username}</button> : (item.opponent?.display_name || item.opponent?.username || "Player")}</strong>
                <span>{controlLabel(item.initial_time_ms, item.increment_ms)} · waiting for opponent</span>
              </div>
              <button type="button" className="online-join" disabled={loading} onClick={() => void openGame(item.id)}>
                Join
              </button>
            </div>
          ))}
          <div className="history-head"><strong>Recent games</strong><button type="button" onClick={() => void loadHistory()}>↻ Refresh</button></div>
          {history.length === 0 ? (
            <div className="lobby-empty history-empty">Completed games will appear here.</div>
          ) : history.map((item) => (
            <div className="lobby-row" key={item.id}>
              <div className="lobby-avatar">♜</div>
              <div className="lobby-player">
                <strong>{item.opponent?.display_name || item.opponent?.username || "Former opponent"}</strong>
                <span>{item.result} · {item.termination} · {((item.white_player === userId ? item.white_rating_change : item.black_rating_change) ?? 0) >= 0 ? "+" : ""}{(item.white_player === userId ? item.white_rating_change : item.black_rating_change) ?? 0}</span>
              </div>
              <button type="button" className="online-join" disabled={loading} onClick={() => void openGame(item.id, false)}>
                Review
              </button>
            </div>
          ))}
          <div className="history-head" id="players"><strong>{selectedControl.category} leaderboard</strong><button type="button" onClick={() => void loadLeaderboard()}>↻ Refresh</button></div>
          {leaderboard.length === 0 ? (
            <div className="lobby-empty history-empty">Ratings appear after players finish their first game.</div>
          ) : leaderboard.map((player, index) => (
            <div className="lobby-row leaderboard-row" key={player.user_id}>
              <span className="leaderboard-rank">{index + 1}</span>
              <div className="lobby-player">
                <strong>{player.profile?.username && onOpenProfile ? <button className="player-name-link" onClick={() => onOpenProfile(player.profile!.username)}>{player.profile.display_name || player.profile.username}</button> : (player.profile?.display_name || player.profile?.username || "Player")}</strong>
                <span>{player.games_played} games · {player.wins} wins · {player.draws} draws</span>
              </div>
              <strong className="leaderboard-rating">{player.rating}</strong>
            </div>
          ))}
          <div className="history-head" id="watch"><strong>Live games</strong><button type="button" onClick={() => void loadLiveGames()}>↻ Refresh</button></div>
          {liveGames.length === 0 ? (
            <div className="lobby-empty history-empty">No live games to watch right now.</div>
          ) : liveGames.map((item) => (
            <div className="lobby-row" key={item.id}>
              <div className="lobby-avatar">◉</div>
              <div className="lobby-player">
                <strong>{item.white?.display_name || item.white?.username || "White"} vs {item.black?.display_name || item.black?.username || "Black"}</strong>
                <span>{item.ply} half-moves · {item.turn_color} to move</span>
              </div>
              <button type="button" className="online-join" disabled={loading} onClick={() => void openGame(item.id, false)}>
                Watch
              </button>
            </div>
          ))}

        </div>
      )}

      {game && (
        <div className="online-game round">
          <div className="online-board-column round__app">
            <div className="online-player-bar">
              <span className="online-player-piece">♟</span>
              <div><strong>{isParticipant ? (isWhite ? "Opponent" : "You") : "Black"}</strong><small>Black</small></div>
              <strong className={game.turn_color === "black" && game.status === "active" ? "clock active-clock" : "clock"}>
                {clockText(blackClock)}
              </strong>
            </div>
            <div className="online-board-frame"><div className="online-board" ref={boardElement} /></div>
            <div className="online-board-tools">
              <button type="button" onClick={() => setBoardOrientation((value) => value === "white" ? "black" : "white")}>⇅ Flip board</button>
              <label>Promotion
                <select value={promotion} onChange={(event) => setPromotion(event.target.value as "q" | "r" | "b" | "n")}>
                  <option value="q">Queen</option><option value="r">Rook</option><option value="b">Bishop</option><option value="n">Knight</option>
                </select>
              </label>
              <span className="draw-help">Right-drag to draw arrows · right-click to erase</span>
            </div>
            <div className="online-player-bar">
              <span className="online-player-piece">♙</span>
              <div><strong>{isParticipant ? (isWhite ? "You" : "Opponent") : "White"}</strong><small>White</small></div>
              <strong className={game.turn_color === "white" && game.status === "active" ? "clock active-clock" : "clock"}>
                {clockText(whiteClock)}
              </strong>
            </div>
          </div>
          <aside className="online-game-panel round__side">
            <div className="online-game-status"><i className={game.status === "active" ? "live-dot" : "idle-dot"} />{status}</div>
            {game.status === "waiting" && (
              <div className="invite-box">
                <strong>Your challenge is ready</strong>
                <p>Share this link. Your clock starts when someone joins.</p>
                <div className="invite-actions"><button className="online-primary" type="button" onClick={shareInvite}>Copy invite link</button><button className="online-secondary" type="button" onClick={cancelChallenge} disabled={busy}>Cancel challenge</button></div>
              </div>
            )}
            <div className="online-moves">
              {moves.length === 0 ? <span className="moves-placeholder">Moves will appear here.</span> :
                moves.map((move) => (
                  <div className="online-move" key={move.ply}>
                    <span>{Math.ceil(move.ply / 2)}{move.ply % 2 ? "." : "…"}</span>
                    <strong>{move.san}</strong>
                  </div>
                ))}
            </div>
            <div className="online-game-actions">
              <span>{controlLabel(game.initial_time_ms, game.increment_ms)} · {TIME_CONTROLS.find((item) => item.initialTimeMs === game.initial_time_ms && item.incrementMs === game.increment_ms)?.category ?? "Chess"}</span>
              {game.status === "active" && isParticipant && <button type="button" onClick={resign} disabled={busy}>Resign</button>}
              {game.status === "finished" && <button type="button" onClick={backToLobby}>Find another game</button>}
            </div>
          </aside>
        </div>
      )}
      {loading && <div className="online-loading">Connecting to game…</div>}
    </section>
  );
}
