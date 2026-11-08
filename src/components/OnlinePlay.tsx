import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Chess } from "chess.js";
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Color, Key } from "@lichess-org/chessground/types";
import { supabase } from "../lib/supabase";
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

type GameRow = {
  id: string;
  white_player: string;
  black_player: string | null;
  status: "waiting" | "active" | "finished";
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
  opponent: { username: string; display_name: string | null } | null;
};

type HistoryGame = {
  id: string;
  white_player: string;
  black_player: string | null;
  result: string | null;
  termination: string | null;
  finished_at: string | null;
  opponent: { username: string; display_name: string | null } | null;
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
  return `${Math.max(0, ms / 1000).toFixed(1)}s`;
}

export function OnlinePlay({ user, initialGameId }: { user: User; initialGameId?: string | null }) {
  const [gameId, setGameId] = useState<string | null>(initialGameId ?? null);
  const [game, setGame] = useState<GameRow | null>(null);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [lobby, setLobby] = useState<LobbyGame[]>([]);
  const [history, setHistory] = useState<HistoryGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tick, setTick] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const boardElement = useRef<HTMLDivElement>(null);
  const ground = useRef<Api | null>(null);
  const gameRef = useRef<GameRow | null>(null);
  const timeoutRequested = useRef<string | null>(null);
  const userId = user.id;

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("ultrabullet", { body });
    if (error) throw new Error(error.message || "Could not reach the game server.");
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

  const loadState = useCallback(async (id: string) => {
    const data = await invoke({ action: "state", gameId: id });
    setServerOffset((data.serverTime ?? Date.now()) - Date.now());
    setGame(data.game as GameRow);
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
      const url = new URL(window.location.href);
      url.searchParams.set("game", id);
      window.history.replaceState({}, "", url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open this game.");
    } finally {
      setLoading(false);
    }
  }, [invoke, loadState]);

  useEffect(() => {
    if (initialGameId) void openGame(initialGameId);
    else {
      void loadLobby();
      void loadHistory();
    }
  }, [initialGameId, openGame, loadLobby, loadHistory]);

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
    const myColor = current.white_player === userId ? "white" : "black";
    if (current.turn_color !== myColor) return;
    setBusy(true);
    try {
      await invoke({ action: "move", gameId: current.id, from, to, promotion: "q" });
      await loadState(current.id);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Move was not accepted.");
      await loadState(current.id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }, [busy, invoke, loadState, userId]);

  const moveHandler = useRef(sendMove);
  useEffect(() => { moveHandler.current = sendMove; }, [sendMove]);

  useEffect(() => {
    if (!boardElement.current) return;
    ground.current = Chessground(boardElement.current, {
      fen: game?.fen,
      orientation: game?.white_player === userId ? "white" : "black",
      coordinates: true,
      animation: { enabled: true, duration: 100 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, color: undefined, dests: new Map(), events: {
        after: (from, to) => moveHandler.current(from, to),
      } },
      draggable: { showGhost: true },
      premovable: { enabled: false },
      drawable: { enabled: false },
    });
    return () => {
      ground.current?.destroy();
      ground.current = null;
    };
  }, [userId, Boolean(game)]);

  useEffect(() => {
    if (!game) return;
    const chess = new Chess(game.fen);
    const myColor: Color = game.white_player === userId ? "white" : "black";
    const canMove = game.status === "active" && game.turn_color === myColor && !busy;
    ground.current?.set({
      fen: game.fen,
      orientation: myColor,
      turnColor: game.turn_color,
      check: chess.isCheck() ? game.turn_color : undefined,
      movable: {
        color: canMove ? myColor : undefined,
        dests: destinations(chess),
      },
    });
  }, [game, userId, busy]);

  const createGame = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await invoke({ action: "create" });
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
    const url = new URL(window.location.href);
    url.searchParams.delete("game");
    window.history.replaceState({}, "", url);
    void loadLobby();
    void loadHistory();
  };

  const isWhite = game?.white_player === userId;
  const myColor: Color = isWhite ? "white" : "black";
  const currentRemaining = useMemo(() => {
    if (!game) return 15000;
    const base = game.turn_color === "white" ? game.white_time_ms : game.black_time_ms;
    if (game.status !== "active" || !game.last_move_at) return base;
    const elapsed = Date.now() + serverOffset - new Date(game.last_move_at).getTime();
    return Math.max(0, base - elapsed);
  }, [game, serverOffset, tick]);
  const whiteClock = game
    ? game.white_time_ms - (game.status === "active" && game.turn_color === "white" && game.last_move_at
      ? Math.max(0, Date.now() + serverOffset - new Date(game.last_move_at).getTime()) : 0)
    : 15000;
  const blackClock = game
    ? game.black_time_ms - (game.status === "active" && game.turn_color === "black" && game.last_move_at
      ? Math.max(0, Date.now() + serverOffset - new Date(game.last_move_at).getTime()) : 0)
    : 15000;

  useEffect(() => {
    if (game?.status === "active" && currentRemaining <= 0 && timeoutRequested.current !== game.id) {
      timeoutRequested.current = game.id;
      void loadState(game.id).catch(() => undefined);
    }
  }, [game?.id, game?.status, currentRemaining, loadState]);

  const status = !game ? "Choose an online game" :
    game.status === "waiting" ? "Waiting for an opponent" :
    game.status === "finished" ? `Game finished · ${game.result ?? ""} · ${game.termination ?? ""}` :
    game.turn_color === myColor ? "Your turn" : "Opponent's turn";

  return (
    <section className="online-section" id="online-play">
      <div className="online-heading">
        <div>
          <span className="online-kicker">LIVE CHESS</span>
          <h2>Online Ultrabullet</h2>
          <p>15-second games · server-validated moves · live updates</p>
        </div>
        {game && <button className="online-secondary" type="button" onClick={backToLobby}>Back to lobby</button>}
      </div>

      {message && <div className="online-message" role="status">{message}</div>}

      {!game && (
        <div className="online-lobby">
          <div className="lobby-create">
            <div>
              <strong>Challenge someone</strong>
              <span>Create a game and share its invite link.</span>
            </div>
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
                <strong>{item.opponent?.display_name || item.opponent?.username || "Player"}</strong>
                <span>15 seconds · waiting for opponent</span>
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
                <span>{item.result} · {item.termination}</span>
              </div>
              <button type="button" className="online-join" disabled={loading} onClick={() => void openGame(item.id, false)}>
                Review
              </button>
            </div>
          ))}
        </div>
      )}

      {game && (
        <div className="online-game">
          <div className="online-board-column">
            <div className="online-player-bar">
              <span className="online-player-piece">♟</span>
              <div><strong>{isWhite ? "Opponent" : "You"}</strong><small>Black</small></div>
              <strong className={game.turn_color === "black" && game.status === "active" ? "clock active-clock" : "clock"}>
                {clockText(blackClock)}
              </strong>
            </div>
            <div className="online-board-frame"><div className="online-board" ref={boardElement} /></div>
            <div className="online-player-bar">
              <span className="online-player-piece">♙</span>
              <div><strong>{isWhite ? "You" : "Opponent"}</strong><small>White</small></div>
              <strong className={game.turn_color === "white" && game.status === "active" ? "clock active-clock" : "clock"}>
                {clockText(whiteClock)}
              </strong>
            </div>
          </div>
          <aside className="online-game-panel">
            <div className="online-game-status"><i className={game.status === "active" ? "live-dot" : "idle-dot"} />{status}</div>
            {game.status === "waiting" && (
              <div className="invite-box">
                <strong>Your challenge is ready</strong>
                <p>Share this link. Your 15-second clock starts when someone joins.</p>
                <button className="online-primary" type="button" onClick={shareInvite}>Copy invite link</button>
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
              <span>15 + 0 · Ultrabullet</span>
              {game.status === "active" && <button type="button" onClick={resign} disabled={busy}>Resign</button>}
              {game.status === "finished" && <button type="button" onClick={backToLobby}>Find another game</button>}
            </div>
          </aside>
        </div>
      )}
      {loading && <div className="online-loading">Connecting to game…</div>}
    </section>
  );
}
