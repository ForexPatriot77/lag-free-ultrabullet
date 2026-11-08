import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthDialog } from "./components/AuthDialog";
import { OnlinePlay } from "./components/OnlinePlay";
import { ProfileDialog } from "./components/ProfileDialog";
import { ProfilePage } from "./components/ProfilePage";
import { Chess } from "chess.js";
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Color, Key } from "@lichess-org/chessground/types";
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

type Page = "home" | "play" | "analysis" | "watch" | "players" | "puzzles" | "learn" | "profile";
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
      if (moves.length) destinations.set(square as Key, moves.map((move) => move.to as Key));
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

const navItems: { id: Page; label: string; icon: string; group: string }[] = [
  { id: "home", label: "Home", icon: "⌂", group: "MAIN" },
  { id: "play", label: "Play", icon: "♟", group: "MAIN" },
  { id: "analysis", label: "Analysis board", icon: "⌗", group: "TOOLS" },
  { id: "watch", label: "Watch", icon: "◉", group: "COMMUNITY" },
  { id: "players", label: "Players", icon: "♙", group: "COMMUNITY" },
  { id: "puzzles", label: "Puzzles", icon: "◇", group: "TRAINING" },
  { id: "learn", label: "Learn", icon: "▤", group: "TRAINING" }
];

function App() {
  const [page, setPage] = useState<Page>("home");
  const boardElement = useRef<HTMLDivElement>(null);
  const ground = useRef<Api | null>(null);
  const game = useRef(createGame());
  const [orientation, setOrientation] = useState<Color>("white");
  const [snapshot, setSnapshot] = useState(() => getSnapshot(game.current));
  const [copiedFen, setCopiedFen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ username: string; display_name: string | null; bio?: string | null } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    let active = true;
    supabase.from("profiles").select("username, display_name, bio").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (active && data) setProfile(data); });
    return () => { active = false; };
  }, [user]);

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setPage("home");
  };

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
      if (move) setSnapshot(getSnapshot(game.current, [from as Key, to as Key]));
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
    if (page !== "analysis" || !boardElement.current) return;
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
    // The analysis board is mounted only on its own page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    ground.current?.set({
      fen: snapshot.fen,
      orientation,
      turnColor: snapshot.turn,
      check: snapshot.check,
      lastMove: snapshot.lastMove,
      movable: { color: snapshot.turn, dests: legalDestinations(game.current) }
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
    setSnapshot(getSnapshot(game.current, previous ? [previous.from as Key, previous.to as Key] : undefined));
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

  const displayName = profile?.display_name || profile?.username || "Player";
  const go = (next: Page) => setPage(next);
  const openPlay = () => {
    setPage("play");
    if (!user) setAuthMode("signin");
  };

  return (
    <div className="site-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => go("home")} aria-label="Lag-Free Ultrabullet home">
          <span className="brand-mark">♞</span>
          <span className="brand-name">LAG-FREE <b>ULTRABULLET</b></span>
        </button>
        <nav className="top-links" aria-label="Main navigation">
          <button className={page === "play" ? "active" : ""} onClick={openPlay}>Play</button>
          <button className={page === "puzzles" ? "active" : ""} onClick={() => go("puzzles")}>Puzzles</button>
          <button className={page === "learn" ? "active" : ""} onClick={() => go("learn")}>Learn</button>
          <button className={page === "watch" ? "active" : ""} onClick={() => go("watch")}>Watch</button>
        </nav>
        <div className="top-actions">
          <span className="connection"><i /> {isSupabaseConfigured ? "Services online" : "Local mode"}</span>
          {user ? (
            <>
              <button className="account-name" type="button" onClick={() => { setProfileUsername(profile?.username ?? null); setPage("profile"); }}>{displayName}</button>
              <button className="login-button" type="button" onClick={signOut}>Log out</button>
            </>
          ) : (
            <>
              <button className="login-button" type="button" onClick={() => setAuthMode("signin")}>Log in</button>
              <button className="signup-button" type="button" onClick={() => setAuthMode("signup")}>Sign up</button>
            </>
          )}
        </div>
      </header>

      <div className="app-body">
        <aside className="left-rail">
          {["MAIN", "TOOLS", "COMMUNITY", "TRAINING"].map((group) => (
            <div className="rail-group" key={group}>
              <div className="rail-heading">{group}</div>
              {navItems.filter((item) => item.group === group).map((item) => (
                <button key={item.id} className={`rail-link ${page === item.id ? "selected" : ""}`} onClick={() => item.id === "play" ? openPlay() : go(item.id)}>
                  <span>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
          ))}
          <div className="rail-footer"><span className="rail-dot" /><span>Independent chess project</span></div>
        </aside>

        <main className="main-content">
          {page === "home" && (
            <section className="home-dashboard">
              <div className="welcome-row">
                <div>
                  <span className="page-kicker">LAG-FREE ULTRABULLET</span>
                  <h1>Chess, without the lag.</h1>
                  <p>A focused home for fast games, analysis, and the chess community.</p>
                </div>
                <div className="welcome-mark">♞</div>
              </div>
              <div className="home-grid">
                <button className="home-action primary-action" onClick={openPlay}>
                  <span className="action-icon">⚡</span>
                  <span className="action-copy"><strong>Play online</strong><small>Challenge another player in 15-second chess</small></span>
                  <span className="action-arrow">→</span>
                </button>
                <button className="home-action" onClick={() => go("analysis")}>
                  <span className="action-icon">⌗</span>
                  <span className="action-copy"><strong>Analysis board</strong><small>Explore positions and test moves</small></span>
                  <span className="action-arrow">→</span>
                </button>
                <button className="home-action" onClick={() => go("watch")}>
                  <span className="action-icon">◉</span>
                  <span className="action-copy"><strong>Watch games</strong><small>Follow games in progress</small></span>
                  <span className="action-arrow">→</span>
                </button>
              </div>
              <div className="dashboard-lower">
                <section className="dashboard-card">
                  <div className="section-heading"><div><span className="page-kicker">YOUR CHESS</span><h2>Player dashboard</h2></div><span className="subtle-tag">{user ? "SIGNED IN" : "GUEST"}</span></div>
                  {user ? (
                    <div className="player-welcome"><div className="profile-avatar">♟</div><div><strong>{displayName}</strong><span>{profile?.username ? `@${profile.username}` : "Your player account"}</span></div><button onClick={() => setProfileOpen(true)}>Edit profile</button></div>
                  ) : (
                    <div className="guest-prompt"><div><strong>Your chess profile starts here.</strong><span>Sign in to keep your rating and game history connected to your account.</span></div><button className="small-green-button" onClick={() => setAuthMode("signup")}>Create account</button></div>
                  )}
                  <div className="dashboard-stats"><div><strong>15s</strong><span>Time control</span></div><div><strong>1500</strong><span>Starting rating</span></div><div><strong>∞</strong><span>Room to improve</span></div></div>
                </section>
                <section className="dashboard-card project-card">
                  <span className="page-kicker">BUILT FOR SPEED</span>
                  <h2>Ultrabullet is the focus.</h2>
                  <p>Quick games, a clean board, and a simple interface. The live game service validates moves and clocks on the server.</p>
                  <button className="text-link" onClick={openPlay}>Enter the lobby <span>→</span></button>
                </section>
              </div>
              <div className="home-footnote"><span>♞</span> An independent chess project. Not affiliated with Lichess.</div>
            </section>
          )}

          {page === "play" && (
            <section className="content-page">
              <div className="content-page-heading"><div><span className="page-kicker">FIND A GAME</span><h1>Play online</h1><p>Challenge someone, join an open game, or review a recent match.</p></div><span className="time-control-label">⚡ 15 + 0 · Ultrabullet</span></div>
              {user ? <OnlinePlay user={user} initialGameId={new URLSearchParams(window.location.search).get("game")} /> : (
                <div className="signin-gate"><div className="gate-icon">♟</div><h2>Sign in to play online</h2><p>Your games, rating, and challenges are connected to your player account.</p><button className="small-green-button" onClick={() => setAuthMode("signin")}>Log in</button><button className="gate-secondary" onClick={() => setAuthMode("signup")}>Create an account</button></div>
              )}
            </section>
          )}

          {page === "profile" && (
            <section className="content-page profile-content-page">
              {profileUsername ? (
                <ProfilePage username={profileUsername} ownProfile={Boolean(user && profile?.username === profileUsername)} onEdit={() => setProfileOpen(true)} />
              ) : (
                <div className="signin-gate"><div className="gate-icon">♟</div><h2>Your player profile</h2><p>Sign in to open your profile and view your ultrabullet rating.</p><button className="small-green-button" onClick={() => setAuthMode("signin")}>Log in</button></div>
              )}
            </section>
          )}

          {page === "analysis" && (
            <section className="content-page">
              <div className="content-page-heading"><div><span className="page-kicker">TOOLS</span><h1>Analysis board</h1><p>A private local board for trying moves and exploring positions.</p></div><span className="time-control-label">LOCAL POSITION</span></div>
              <section className="play-area analysis-area">
                <div className="board-column">
                  <div className="player-strip opponent"><div className="avatar avatar-dark">♟</div><div className="player-details"><strong>Black</strong><span>Analysis position</span></div><div className="rating">—</div></div>
                  <div className="board-frame"><div className="board" ref={boardElement} /></div>
                  <div className="player-strip you"><div className="avatar avatar-light">♙</div><div className="player-details"><strong>White</strong><span>Local analysis</span></div><div className="rating">—</div></div>
                  <div className="board-tools">
                    <button type="button" onClick={() => setOrientation((value) => value === "white" ? "black" : "white")}><span>⇅</span> Flip board</button>
                    <button type="button" onClick={copyFen}><span>▣</span> {copiedFen ? "Copied FEN" : "Copy FEN"}</button>
                  </div>
                </div>
                <aside className="game-panel">
                  <div className="panel-tabs"><button className="panel-tab active" type="button">Moves</button><button className="panel-tab" type="button" disabled>Chat</button></div>
                  <div className="game-status"><span className={snapshot.gameOver ? "status-indicator ended" : "status-indicator"} /><strong>{status}</strong></div>
                  <div className="move-list" aria-label="Move history">
                    {movePairs.length === 0 ? <div className="empty-moves"><span className="empty-board-icon">♘</span><strong>Ready to analyze</strong><span>Make moves on the board to explore.</span></div> : (
                      <table><tbody>{movePairs.map((pair) => <tr key={pair.number}><th>{pair.number}.</th><td>{pair.white ?? ""}</td><td>{pair.black ?? ""}</td></tr>)}</tbody></table>
                    )}
                  </div>
                  <div className="panel-controls"><button type="button" onClick={undoMove} disabled={snapshot.moves.length === 0} aria-label="Undo move">↶</button><button type="button" onClick={resetGame}>＋ Reset position</button><button type="button" onClick={copyFen} aria-label="Copy FEN">⧉</button></div>
                  <div className="panel-note"><strong>Local analysis</strong><p>This board runs in your browser. Moves here are not submitted as online games.</p><span className={isSupabaseConfigured ? "backend-ready" : "backend-pending"}><i /> {isSupabaseConfigured ? "Account services configured" : "Account services unavailable"}</span></div>
                </aside>
              </section>
            </section>
          )}

          {(page === "watch" || page === "players") && (
            <section className="content-page">
              <div className="content-page-heading"><div><span className="page-kicker">COMMUNITY</span><h1>{page === "watch" ? "Watch games" : "Players"}</h1><p>{page === "watch" ? "See live games and follow the action." : "Find the players climbing the ultrabullet ladder."}</p></div></div>
              {user ? <OnlinePlay user={user} initialGameId={null} /> : <div className="signin-gate compact-gate"><div className="gate-icon">{page === "watch" ? "◉" : "♙"}</div><h2>Join the community</h2><p>Sign in to view live games, recent results, and the player leaderboard.</p><button className="small-green-button" onClick={() => setAuthMode("signin")}>Log in</button></div>}
            </section>
          )}

          {(page === "puzzles" || page === "learn") && (
            <section className="content-page">
              <div className="content-page-heading"><div><span className="page-kicker">TRAINING</span><h1>{page === "puzzles" ? "Puzzles" : "Learn chess"}</h1><p>{page === "puzzles" ? "Tactical training is on the roadmap." : "Guides and lessons are on the roadmap."}</p></div></div>
              <div className="roadmap-card"><div className="roadmap-icon">{page === "puzzles" ? "◇" : "▤"}</div><h2>{page === "puzzles" ? "Puzzle training is coming." : "A learning library is coming."}</h2><p>We're building the core playing experience first. These sections will become part of the same account and rating system as the rest of the site.</p><button className="text-link" onClick={openPlay}>Back to playing <span>→</span></button></div>
            </section>
          )}
        </main>
      </div>

      {authMode && <AuthDialog initialMode={authMode} onClose={() => setAuthMode(null)} />}
      {profileOpen && user && <ProfileDialog user={user} profile={profile} onClose={() => setProfileOpen(false)} onSaved={setProfile} />}
      <footer className="site-footer"><span>Lag-Free Ultrabullet</span><span>Independent chess project · Not affiliated with Lichess</span><span>GPL-3.0-or-later</span></footer>
    </div>
  );
}

export default App;
