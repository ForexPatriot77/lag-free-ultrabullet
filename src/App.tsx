import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthDialog } from "./components/AuthDialog";
import { OnlinePlay } from "./components/OnlinePlay";
import { ProfileDialog } from "./components/ProfileDialog";
import { ProfilePage } from "./components/ProfilePage";
import { PasswordRecoveryDialog } from "./components/PasswordRecoveryDialog";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const LICHESS_CLIENT_ID = "lag-free-ultrabullet.github.io";
const OAUTH_STORAGE_KEY = "lagfree_lichess_pkce";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function startLichessOAuth() {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  const stateBytes = new Uint8Array(24);
  crypto.getRandomValues(stateBytes);
  const state = base64Url(stateBytes);
  const redirectUri = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  sessionStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify({ verifier, state }));
  const authorize = new URL("https://lichess.org/oauth");
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: LICHESS_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "email:read",
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  }).toString();
  window.location.assign(authorize.toString());
}


type Page = "home" | "play" | "watch" | "players" | "profile";
function App() {
  const [page, setPage] = useState<Page>(() => new URLSearchParams(window.location.search).has("game") ? "play" : "home");
  const [isInGame, setIsInGame] = useState(() => new URLSearchParams(window.location.search).has("game"));
  const handleGameOpen = useCallback(() => { setIsInGame(true); setPage("play"); }, []);
  const handleGameClose = useCallback(() => setIsInGame(false), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ username: string; display_name: string | null; bio?: string | null } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | null>(null);
  const [authError, setAuthError] = useState("");
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    // Supabase email confirmation/recovery also uses ?code=. Only handle this
    // callback when this tab has an outstanding Lichess PKCE transaction.
    const stored = sessionStorage.getItem(OAUTH_STORAGE_KEY);
    if (!stored || !url.searchParams.has("state")) return;
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error");
    if (!code && !oauthError) return;
    const cleanUrl = () => window.history.replaceState({}, document.title, url.pathname + url.hash);
    if (oauthError) {
      sessionStorage.removeItem(OAUTH_STORAGE_KEY);
      setAuthError("Lichess sign-in was cancelled or denied. You can try again.");
      setAuthMode("signin");
      cleanUrl();
      return;
    }
    if (!supabase) {
      sessionStorage.removeItem(OAUTH_STORAGE_KEY);
      setAuthError("Your sign-in session expired. Please try again.");
      setAuthMode("signin");
      cleanUrl();
      return;
    }
    void (async () => {
      try {
        const pending = JSON.parse(stored) as { verifier: string; state: string };
        if (!pending.verifier || pending.state !== url.searchParams.get("state")) {
          throw new Error("The Lichess sign-in could not be verified. Please try again.");
        }
        const redirectUri = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
        // Restore a signed-in Supabase session before the function call so an
        // existing account can be securely linked instead of creating a duplicate.
        await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke("lichess-auth", {
          body: { code, codeVerifier: pending.verifier, redirectUri },
        });
        if (error) {
          const response = (error as { context?: Response }).context;
          let serverMessage = "";
          if (response) {
            try {
              const payload = await response.clone().json() as { error?: string };
              serverMessage = typeof payload.error === "string" ? payload.error : "";
            } catch {
              // Keep the SDK message if the response body is not JSON.
            }
          }
          throw new Error(serverMessage || error.message || "Lichess sign-in failed. Please try again.");
        }
        if (data?.linked === true) {
          setAuthError("");
          setAuthMode(null);
          setProfileOpen(false);
          setPage("profile");
          return;
        }
        if (!data?.token_hash) throw new Error(data?.error || "Lichess sign-in could not be completed.");
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: "magiclink",
        });
        if (verifyError) throw verifyError;
        setAuthError("");
        setAuthMode(null);
      } catch (cause) {
        setAuthError(cause instanceof Error ? cause.message : "Lichess sign-in failed. Please try again.");
        setAuthMode("signin");
      } finally {
        sessionStorage.removeItem(OAUTH_STORAGE_KEY);
        cleanUrl();
      }
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setPasswordRecoveryOpen(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null);
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
          <span className="site-status"><i />{isSupabaseConfigured ? "Cloud" : "Local mode"}</span>
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
                    <OnlinePlay user={user} initialGameId={null} onOpenProfile={(username) => { setProfileUsername(username); setPage("profile"); }} onGameOpen={handleGameOpen} onGameClose={handleGameClose} />
                  ) : (
                    <div className="lobby-signin">
                      <div className="lobby-signin__piece">♞</div>
                      <h1>Play fast chess</h1>
                      <p>Sign in to create a challenge, join an open game, and track all eight ratings.</p>
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
                  <button className="button button-metal lobby__start__button lobby__start__button--hook" type="button" onClick={() => user ? setPage("play") : setAuthMode("signin")}>Play now</button>
                  <button className="button button-metal lobby__start__button lobby__start__button--friend" type="button" onClick={() => user ? setPage("play") : setAuthMode("signup")}>Challenge a friend</button>
                </div>
              </section>

              <section className="lobby__tv">
                <div className="lobby__box">
                  <div className="lobby__box__top"><h2 className="title text">Time controls</h2></div>
                  <div className="lobby__box__content lobby-info-card">
                    <strong>Eight speeds · all no increment</strong>
                    <p>30s Hyperbullet · 15s Ultrabullet · 7.5s Ultrazerk · five Psycho speeds down to 0.203125s. Every speed has its own rating.</p>
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
              {!isInGame && <div className="content-page-heading"><div><span className="page-kicker">FIND A GAME</span><h1>Play online</h1><p>Challenge someone, join an open game, or review a recent match.</p></div><span className="time-control-label">⚡ 8 rated time controls · no increment</span></div>}
              {user ? <OnlinePlay user={user} initialGameId={new URLSearchParams(window.location.search).get("game")} onOpenProfile={(username) => { setProfileUsername(username); setPage("profile"); }} onGameOpen={handleGameOpen} onGameClose={handleGameClose} /> : (
                <div className="signin-gate"><div className="gate-icon">♟</div><h2>Sign in to play online</h2><p>Your games, rating, and challenges are connected to your player account.</p><button className="small-green-button" onClick={() => setAuthMode("signin")}>Log in</button><button className="gate-secondary" onClick={() => setAuthMode("signup")}>Create an account</button></div>
              )}
            </section>
          )}

          {page === "profile" && (
            <section className="content-page profile-content-page">
              {profileUsername ? (
                <ProfilePage username={profileUsername} ownProfile={Boolean(user && profile?.username === profileUsername)} onEdit={() => setProfileOpen(true)} />
              ) : (
                <div className="signin-gate"><div className="gate-icon">♟</div><h2>Your player profile</h2><p>Sign in to open your player profile and view ratings across every time control.</p><button className="small-green-button" onClick={() => setAuthMode("signin")}>Log in</button></div>
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

      {authMode && <AuthDialog initialMode={authMode} onClose={() => { setAuthMode(null); setAuthError(""); }} onLichess={() => { void startLichessOAuth().catch((cause) => setAuthError(cause instanceof Error ? cause.message : "Could not start Lichess sign-in.")); }} externalError={authError} />}
      {passwordRecoveryOpen && <PasswordRecoveryDialog onClose={() => setPasswordRecoveryOpen(false)} />}
      {profileOpen && user && <ProfileDialog user={user} profile={profile} onClose={() => setProfileOpen(false)} onSaved={(nextProfile) => { setProfile(nextProfile); setProfileUsername(nextProfile.username); }} onLichess={startLichessOAuth} />}
      <footer className="site-footer">
        <span>Lag-Free Ultrabullet</span>
        <span>Independent project · Not affiliated with Lichess</span>
        <a href="https://github.com/ForexPatriot77/lag-free-ultrabullet" target="_blank" rel="noreferrer">Source code</a>
        <a href="https://github.com/ForexPatriot77/lag-free-ultrabullet/blob/main/LICENSE" target="_blank" rel="noreferrer">AGPL-3.0-or-later · No warranty</a>
      </footer>
    </div>
  );
}

export default App;
