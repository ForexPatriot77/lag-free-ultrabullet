import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Color, Key } from "@lichess-org/chessground/types";
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import { isSupabaseConfigured } from "./lib/supabase";

type Snapshot = {
  fen: string;
  turn: Color;
  moves: string[];
  lastMove?: [Key, Key];
  check: boolean;
  gameOver: boolean;
};

const createGame = () => new Chess();

function legalDestinations(game: Chess): Map<Key, Key[]> {
  const destinations = new Map<Key, Key[]>();
  for (const rank of "12345678") {
    for (const file of "abcdefgh") {
      const square = `${file}${rank}`;
      const moves = game.moves({ square: square as never, verbose: true });
      if (moves.length) {
        destinations.set(square as Key, moves.map((move) => move.to as Key));
      }
    }
  }
  return destinations;
}

function getSnapshot(game: Chess, lastMove?: [Key, Key]): Snapshot {
  return {
    fen: game.fen(),
    turn: game.turn() === "w" ? "white" : "black",
    moves: game.history(),
    lastMove,
    check: game.isCheck(),
    gameOver: game.isGameOver()
  };
}

function App() {
  const boardElement = useRef<HTMLDivElement>(null);
  const ground = useRef<Api | null>(null);
  const game = useRef(createGame());
  const [orientation, setOrientation] = useState<Color>("white");
  const [snapshot, setSnapshot] = useState(() => getSnapshot(game.current));
  const [copiedFen, setCopiedFen] = useState(false);

  const movePairs = useMemo(() => {
    const pairs: { number: number; white?: string; black?: string }[] = [];
    snapshot.moves.forEach((san, index) => {
      const number = Math.floor(index / 2) + 1;
      if (!pairs[number - 1]) pairs.push({ number });
      if (index % 2 === 0) pairs[number - 1].white = san;
      else pairs[number - 1].black = san;
    });
    return pairs;
  }, [snapshot.moves]);

  const playMove = (from: string, to: string) => {
    try {
      const move = game.current.move({ from, to, promotion: "q" });
      if (!move) return;
      setSnapshot(getSnapshot(game.current, [from as Key, to as Key]));
    } catch {
      ground.current?.set({
        fen: game.current.fen(),
        turnColor: game.current.turn() === "w" ? "white" : "black",
        movable: {
          color: game.current.turn() === "w" ? "white" : "black",
          dests: legalDestinations(game.current)
        }
      });
    }
  };

  useEffect(() => {
    if (!boardElement.current) return;
    ground.current = Chessground(boardElement.current, {
      fen: snapshot.fen,
      orientation,
      turnColor: snapshot.turn,
      coordinates: true,
      animation: { enabled: true, duration: 120 },
      highlight: { lastMove: true, check: true },
      movable: {
        free: false,
        color: snapshot.turn,
        dests: legalDestinations(game.current),
        events: { after: playMove }
      },
      draggable: { showGhost: true },
      premovable: { enabled: false },
      drawable: { enabled: false }
    });
    return () => {
      ground.current?.destroy();
      ground.current = null;
    };
    // Chessground is mounted once; move callbacks read the current game ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ground.current?.set({
      fen: snapshot.fen,
      orientation,
      turnColor: snapshot.turn,
      check: snapshot.check ? (game.current.turn() === "w" ? "e1" : "e8") : undefined,
      lastMove: snapshot.lastMove,
      movable: {
        color: snapshot.turn,
        dests: legalDestinations(game.current)
      }
    });
  }, [snapshot, orientation]);

  const resetGame = () => {
    game.current = createGame();
    setSnapshot(getSnapshot(game.current));
  };

  const undoMove = () => {
    if (!game.current.undo()) return;
    const history = game.current.history({ verbose: true });
    const previous = history.at(-1);
    setSnapshot(
      getSnapshot(
        game.current,
        previous ? [previous.from as Key, previous.to as Key] : undefined
      )
    );
  };

  const copyFen = async () => {
    await navigator.clipboard.writeText(snapshot.fen);
    setCopiedFen(true);
    window.setTimeout(() => setCopiedFen(false), 1400);
  };

  const status = snapshot.gameOver
    ? game.current.isCheckmate()
      ? `Checkmate · ${snapshot.turn === "white" ? "Black" : "White"} wins`
      : "Game drawn"
    : snapshot.check
      ? `${snapshot.turn === "white" ? "White" : "Black"} to move · Check`
      : `${snapshot.turn === "white" ? "White" : "Black"} to move`;

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Lag-Free Ultrabullet home">
          <span className="brand-mark">♞</span>
          <span className="brand-name">LAG-FREE <b>ULTRABULLET</b></span>
        </a>
        <nav className="top-links" aria-label="Main navigation">
          <a className="active" href="#play">Play</a>
          <a href="#puzzles">Puzzles</a>
          <a href="#learn">Learn</a>
          <a href="#watch">Watch</a>
        </nav>
        <div className="top-actions">
          <span className="connection"><i /> Local board</span>
          <button className="login-button" type="button">Log in</button>
          <button className="signup-button" type="button">Sign up</button>
        </div>
      </header>

      <main className="page-layout" id="play">
        <aside className="left-rail">
          <div className="rail-group">
            <div className="rail-heading">PLAY</div>
            <a className="rail-link selected" href="#play"><span>♟</span> Play</a>
            <a className="rail-link" href="#puzzles"><span>◈</span> Puzzles</a>
            <a className="rail-link" href="#learn"><span>▤</span> Learn</a>
            <a className="rail-link" href="#watch"><span>◉</span> Watch</a>
          </div>
          <div className="rail-group">
            <div className="rail-heading">COMMUNITY</div>
            <a className="rail-link" href="#players"><span>♙</span> Players</a>
            <a className="rail-link" href="#teams"><span>♜</span> Teams</a>
          </div>
          <div className="rail-footer">
            <span className="rail-dot" />
            <span>Independent project</span>
          </div>
        </aside>

        <section className="play-area">
          <div className="board-column">
            <div className="player-strip opponent">
              <div className="avatar avatar-dark">♟</div>
              <div className="player-details">
                <strong>Opponent</strong>
                <span>Waiting for a game</span>
              </div>
              <div className="rating">—</div>
            </div>
            <div className="board-frame">
              <div className="board" ref={boardElement} />
            </div>
            <div className="player-strip you">
              <div className="avatar avatar-light">♙</div>
              <div className="player-details">
                <strong>You</strong>
                <span>Local practice board</span>
              </div>
              <div className="rating">—</div>
            </div>
            <div className="board-tools">
              <button type="button" onClick={() => setOrientation((value) => value === "white" ? "black" : "white")}>
                <span>⇅</span> Flip board
              </button>
              <button type="button" onClick={copyFen}>
                <span>▣</span> {copiedFen ? "Copied FEN" : "Copy FEN"}
              </button>
            </div>
          </div>

          <aside className="game-panel">
            <div className="panel-tabs">
              <button className="panel-tab active" type="button">Game</button>
              <button className="panel-tab" type="button" disabled>Chat</button>
            </div>
            <div className="game-mode">
              <div>
                <span className="eyebrow">TIME CONTROL</span>
                <strong>Ultrabullet</strong>
              </div>
              <span className="time-pill">15 seconds</span>
            </div>
            <div className="game-status">
              <span className={snapshot.gameOver ? "status-indicator ended" : "status-indicator"} />
              <strong>{status}</strong>
            </div>
            <div className="move-list" aria-label="Move history">
              {movePairs.length === 0 ? (
                <div className="empty-moves">
                  <span className="empty-board-icon">♘</span>
                  <strong>Your game starts here</strong>
                  <span>Make a move on the board to begin.</span>
                </div>
              ) : (
                <table>
                  <tbody>
                    {movePairs.map((pair) => (
                      <tr key={pair.number}>
                        <th>{pair.number}.</th>
                        <td>{pair.white ?? ""}</td>
                        <td>{pair.black ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="panel-controls">
              <button type="button" onClick={undoMove} disabled={snapshot.moves.length === 0} aria-label="Undo move">↶</button>
              <button type="button" onClick={resetGame} aria-label="New game">＋ New game</button>
              <button type="button" onClick={copyFen} aria-label="Copy position">⧉</button>
            </div>
            <div className="panel-note">
              <strong>Prototype mode</strong>
              <p>This board is running locally. Online matchmaking, accounts, clocks, and saved games will be connected in later stages.</p>
              <span className={isSupabaseConfigured ? "backend-ready" : "backend-pending"}>
                <i /> {isSupabaseConfigured ? "Supabase configured" : "Supabase connection pending"}
              </span>
            </div>
          </aside>
        </section>
      </main>
      <footer className="site-footer">
        <span>Lag-Free Ultrabullet</span>
        <span>Independent chess project · Not affiliated with Lichess</span>
        <span>GPL-3.0-or-later</span>
      </footer>
    </div>
  );
}

export default App;