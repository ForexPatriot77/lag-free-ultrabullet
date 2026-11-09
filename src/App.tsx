import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthDialog } from "./components/AuthDialog";
import { OnlinePlay } from "./components/OnlinePlay";
import { ProfileDialog } from "./components/ProfileDialog";
import { ProfilePage } from "./components/ProfilePage";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

type Page = "home" | "play" | "watch" | "players" | "profile";
function App() {
  const [page, setPage] = useState<Page>("home");
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

  const displayName = profile?.display_name || profile?.username || "Player";
  const go = (next: Page) => setPage(next);
  const openPlay = () => {
    setPage("play");
    if (!user) setAuthMode("signin");
  };

  return (
    <div className="site-shell">
      <header id="top">
        <button className="site-title" type="button" onClick={() => go("home")} aria-label="Lag-Free Ultrabullet home">
          <span className="site-icon">♞</span>
          <span className="site-name">Lag-Free <span>Ultrabullet</span></span>
        </button>
        <nav id="topnav" className="hover" aria-label="Main navigation">
          <section className={page === "play" ? "active" : ""}><a href="#play" onClick={(event) => { event.preventDefault(); openPlay(); }}>Play</a></section>
          <section className={page === "watch" ? "active" : ""}><a href="#watch" onClick={(event) => { event.preventDefault(); go("watch"); }}>Watch</a></section>
          <section className={page === "players" ? "active" : ""}><a href="#players" onClick={(event) => { event.preventDefault(); go("players"); }}>Players</a></section>
        </nav>
        <div className="site-buttons">
          <span className="site-status"><i />{isSupabaseConfigured ? "Online" : "Local mode"}</span>
          {user ? (
            <>
              <button id="user_tag" className="link" type="button" onClick={() => { setProfileUsername(profile?.username ?? null); setPage("profile"); }}>{displayName}</button>
              <button className="link" type="button" onClick={signOut}>Log out</button>
            </>
          ) : (
            <div className="signin-or-signup">
              <button className="link" type="button" onClick={() => setAuthMode("signin")}>Log in</button>
              <button className="button button-green button-no-upper" type="button" onClick={() => setAuthMode("signup")}>Sign up</button>
            </div>
          )}
        </div>
      </header>

      <div id="main-wrap">
        <main className={page === "home" ? "lobby" : "main-content page-small"}>

          {page === "home" && (
            <>
              <aside className="lobby__side">
                <div className="lobby__box">
                  <div className="lobby__box__top"><h2 className="title text">Player</h2></div>
                  <div className="lobby__box__content lobby-player-card">
                    {user ? (
                      <>
                        <strong>{displayName}</strong>
                        <span>@{profile?.username ?? "player"}</span>
                        <button className="button button-empty button-no-upper" type="button" onClick={() => { setProfileUsername(profile?.username ?? null); setPage("profile"); }}>View profile</button>
                      </>
                    ) : (
                      <>
                        <strong>Welcome to Lag-Free Ultrabullet</strong>
                        <span>Sign in to keep your rating, games, and challenges together.</span>
                        <button className="button button-green button-no-upper" type="button" onClick={() => setAuthMode("signup")}>Create account</button>
                      </>
                    )}
                  </div>
                </div>
                <div className="about-side">
                  <h2>About</h2>
                  <p>An independent chess platform focused on fast, low-latency games.</p>
                  <a href="https://github.com/ForexPatriot77/lag-free-ultrabullet" target="_blank" rel="noreferrer">Source code</a>
                </div>
              </aside>

              <section className="lobby__app">
                <div className="tabs-horiz"><span>Lobby</span></div>
                <div className="lobby__app__content">
                  {user ? (
                    <OnlinePlay user={user} initialGameId={null} onOpenProfile={(username) => { setProfileUsername(username); setPage("profile"); }} />
                  ) : (
                    <div className="lobby-signin">
                      <div className="lobby-signin__piece">♞</div>
                      <h1>Play ultrabullet</h1>
                      <p>Sign in to create a challenge, join an open game, and track your rating.</p>
                      <div className="button-set">
                        <button className="button button-green button-no-upper" type="button" onClick={() => setAuthMode("signin")}>Log in</button>
                        <button className="button button-metal button-no-upper" type="button" onClick={() => setAuthMode("signup")}>Create account</button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="lobby__table">
                <div className="lobby__start">
                  <button className="button button-metal lobby__start__button lobby__start__button--hook" type="button" onClick={() => user ? setPage("play") : setAuthMode("signin")}>Play Ultrabullet</button>
                  <button className="button button-metal lobby__start__button lobby__start__button--friend" type="button" onClick={() => user ? setPage("play") : setAuthMode("signup")}>Challenge a friend</button>
                </div>
              </section>

              <section className="lobby__tv">
                <div className="lobby__box">
                  <div className="lobby__box__top"><h2 className="title text">Ultrabullet</h2></div>
                  <div className="lobby__box__content lobby-info-card">
                    <strong>15 seconds · no increment</strong>
                    <p>Fast games with server-validated moves and live clocks.</p>
                    <button className="button button-empty button-no-upper" type="button" onClick={() => go("play")}>Open play page</button>
                  </div>
                </div>
              </section>

              <section className="lobby__about lobby-about-links">
                <a href="https://github.com/ForexPatriot77/lag-free-ultrabullet" target="_blank" rel="noreferrer">Source code</a>
                <span>Independent project · Not affiliated with Lichess</span>
              </section>
            </>
          )}

          {page === "play" && (
            <section className="content-page">
              <div className="content-page-heading"><div><span className="page-kicker">FIND A GAME</span><h1>Play online</h1><p>Challenge someone, join an open game, or review a recent match.</p></div><span className="time-control-label">⚡ 15 + 0 · Ultrabullet</span></div>
              {user ? <OnlinePlay user={user} initialGameId={new URLSearchParams(window.location.search).get("game")} onOpenProfile={(username) => { setProfileUsername(username); setPage("profile"); }} /> : (
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

          {(page === "watch" || page === "players") && (
            <section className="content-page">
              <div className="content-page-heading"><div><span className="page-kicker">COMMUNITY</span><h1>{page === "watch" ? "Watch games" : "Players"}</h1><p>{page === "watch" ? "See live games and follow the action." : "Find the players climbing the ultrabullet ladder."}</p></div></div>
              {user ? <OnlinePlay user={user} initialGameId={null} /> : <div className="signin-gate compact-gate"><div className="gate-icon">{page === "watch" ? "◉" : "♙"}</div><h2>Join the community</h2><p>Sign in to view live games, recent results, and the player leaderboard.</p><button className="small-green-button" onClick={() => setAuthMode("signin")}>Log in</button></div>}
            </section>
          )}


        </main>
      </div>

      {authMode && <AuthDialog initialMode={authMode} onClose={() => setAuthMode(null)} />}
      {profileOpen && user && <ProfileDialog user={user} profile={profile} onClose={() => setProfileOpen(false)} onSaved={setProfile} />}
      <footer className="site-footer"><span>Lag-Free Ultrabullet</span><span>Independent project · Not affiliated with Lichess</span><span>AGPL-3.0-or-later</span></footer>
    </div>
  );
}

export default App;
