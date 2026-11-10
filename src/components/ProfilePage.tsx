import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { supabase } from "../lib/supabase";
import { TIME_CONTROLS, controlLabel, ratingColumnForTime } from "../lib/timeControls";
import { CursorMark } from "./CursorMark";

type ProfileData = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
};

type RatingData = {
  hyperbullet_rating: number | null;
  ultrabullet_rating: number;
  ultrazerk_rating: number;
  psycho_3250_rating: number;
  psycho_1625_rating: number;
  psycho_812_5_rating: number;
  psycho_406_25_rating: number;
  psycho_203_125_rating: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
};

function RatingChart({ rating, history, label }: { rating: number | null; history: RatingHistoryPoint[]; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rating === null) return;

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: history.length ? history.map((point) => new Date(point.recorded_at).toLocaleDateString()) : ["Current"],
        datasets: [{
          label,
          data: history.length ? history.map((point) => point.rating) : [rating],
          borderColor: "#91b85b",
          backgroundColor: "rgba(145, 184, 91, .14)",
          pointBackgroundColor: "#a8cf70",
          pointBorderColor: "#262522",
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2,
          tension: 0.25,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              label: (context) => `Rating: ${context.parsed.y}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#999", font: { size: 11 } },
            border: { color: "#484640" },
          },
          y: {
            suggestedMin: Math.max(0, rating - 200),
            suggestedMax: rating + 200,
            grid: { color: "rgba(160, 160, 160, .12)" },
            ticks: { color: "#999", precision: 0 },
            border: { display: false },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [rating, history, label]);

  return (
    <div className="rating-chart-visual">
      {rating === null ? (
        <div className="rating-chart-message">No rated games yet. Your rating chart will appear after your first rated game.</div>
      ) : (
        <>
          <canvas ref={canvasRef} aria-label={`Current ${label} rating: ${rating}`} role="img" />
          <div className="rating-chart-note">{history.length ? `Rating history · ${history.length} recorded games` : "History begins with your first rated game after this release."}</div>
        </>
      )}
    </div>
  );
}

type RatingHistoryPoint = { rating: number; rating_pool: string; recorded_at: string };

function profileHref(username: string) { return new URL(import.meta.env.BASE_URL + "@/" + encodeURIComponent(username.toLowerCase()), window.location.origin).toString(); }

type ProfileGame = {
  id: string;
  opponent: string;
  opponentUsername: string | null;
  outcome: "Win" | "Loss" | "Draw";
  control: string;
  finishedAt: string;
  ratingChange: number | null;
};

export function ProfilePage({ username, ownProfile, onEdit, onOpenProfile }: {
  username: string;
  ownProfile: boolean;
  onEdit: () => void;
  onOpenProfile: (username: string) => void;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [rating, setRating] = useState<RatingData | null>(null);
  const [ratingHistory, setRatingHistory] = useState<RatingHistoryPoint[]>([]);
  const [recentGames, setRecentGames] = useState<ProfileGame[]>([]);
  const [selectedTimeMs, setSelectedTimeMs] = useState(15000);
  const [range, setRange] = useState<"1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL">("ALL");
  const [tab, setTab] = useState<"activity" | "games">("activity");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setProfile(null);
    setRating(null);
    setRatingHistory([]);
    setRecentGames([]);
    void (async () => {
      const { data: person, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, created_at")
        .eq("username", username.toLowerCase())
        .maybeSingle();
      if (!active) return;
      if (profileError || !person) {
        setError("We couldn't find that player profile.");
        setLoading(false);
        return;
      }
      setProfile(person as ProfileData);
      const [statsResult, historyResult, gamesResult] = await Promise.all([
        supabase.from("player_ratings")
          .select("hyperbullet_rating, ultrabullet_rating, ultrazerk_rating, psycho_3250_rating, psycho_1625_rating, psycho_812_5_rating, psycho_406_25_rating, psycho_203_125_rating, games_played, wins, draws, losses")
          .eq("user_id", person.id)
          .maybeSingle(),
        supabase.from("player_rating_history")
          .select("rating, rating_pool, recorded_at")
          .eq("user_id", person.id)
          .order("recorded_at", { ascending: false })
          .limit(800),
        supabase.from("games")
          .select("id, white_player, black_player, initial_time_ms, increment_ms, result, white_rating_change, black_rating_change, finished_at")
          .eq("status", "finished")
          .or(`white_player.eq.${person.id},black_player.eq.${person.id}`)
          .order("finished_at", { ascending: false })
          .limit(50),
      ]);
      if (!active) return;
      setRating(statsResult.data as RatingData | null);
      setRatingHistory(((historyResult.data ?? []) as RatingHistoryPoint[]).reverse());
      const gameRows = gamesResult.data ?? [];
      const opponentIds = [...new Set(gameRows
        .map((game) => game.white_player === person.id ? game.black_player : game.white_player)
        .filter((id): id is string => Boolean(id)))];
      const { data: opponentProfiles } = opponentIds.length
        ? await supabase.from("profiles").select("id, username, display_name").in("id", opponentIds)
        : { data: [] };
      if (!active) return;
      const opponentById = new Map((opponentProfiles ?? []).map((opponent) => [
        opponent.id,
        { displayName: opponent.display_name || opponent.username, username: opponent.username },
      ]));
      setRecentGames(gameRows.map((game) => {
        const isWhite = game.white_player === person.id;
        const opponentId = isWhite ? game.black_player : game.white_player;
        const won = (isWhite && game.result === "1-0") || (!isWhite && game.result === "0-1");
        const outcome = game.result === "1/2-1/2" ? "Draw" : won ? "Win" : "Loss";
        return {
          id: game.id,
          opponent: opponentId ? opponentById.get(opponentId)?.displayName ?? "Former player" : "Opponent unavailable",
          opponentUsername: opponentId ? opponentById.get(opponentId)?.username ?? null : null,
          outcome,
          control: controlLabel(game.initial_time_ms, game.increment_ms),
          finishedAt: game.finished_at,
          ratingChange: isWhite ? game.white_rating_change : game.black_rating_change,
        };
      }));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [username]);

  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const gamesPlayed = rating?.games_played ?? 0;
  const wins = rating?.wins ?? 0;
  const draws = rating?.draws ?? 0;
  const losses = rating?.losses ?? 0;
  const winRate = gamesPlayed ? Math.round((wins / gamesPlayed) * 100) : 0;
  const selectedControl = TIME_CONTROLS.find((control) => control.initialTimeMs === selectedTimeMs) ?? TIME_CONTROLS[1];
  const selectedRating = rating?.[ratingColumnForTime(selectedTimeMs)] ?? null;
  const selectedHistory = ratingHistory.filter((point) => {
    if (point.rating_pool !== selectedControl.ratingPool) return false;
    if (range === "ALL") return true;
    const now = new Date();
    const cutoff = new Date(now);
    if (range === "YTD") cutoff.setMonth(0, 1);
    else cutoff.setMonth(cutoff.getMonth() - (range === "1M" ? 1 : range === "3M" ? 3 : range === "6M" ? 6 : 12));
    return new Date(point.recorded_at) >= cutoff;
  });
  const ratingIcon = (index: number) => ["➤", "➤", "♟", "⚡", "⚡", "⚡", "⚡", "⚡"][index];

  return (
    <section className="lichess-profile-page">
      {loading ? <div className="profile-loading">Loading player profile…</div> :
        error ? <div className="profile-error">{error}</div> : profile && (
          <>
            <aside className="profile-ratings-rail">
              <div className="profile-rail-heading">RATINGS</div>
              {TIME_CONTROLS.map((control, index) => {
                const value = rating?.[control.ratingColumn] ?? null;
                const active = selectedTimeMs === control.initialTimeMs;
                return (
                  <button type="button" key={control.initialTimeMs}
                    className={`profile-rating-entry ${active ? "active" : ""}`}
                    onClick={() => setSelectedTimeMs(control.initialTimeMs)}
                    aria-pressed={active}>
                    <span className={`profile-rating-symbol symbol-${index}`}>{ratingIcon(index)}</span>
                    <span className="profile-rating-copy">
                      <span className="profile-rating-name">{control.category.toUpperCase()}</span>
                      <strong>{value ?? "?"}</strong>
                      <small>{control.label.split(" · ")[0]} · no increment</small>
                    </span>
                    <span className="profile-rating-chevron">›</span>
                  </button>
                );
              })}
              <div className="profile-rail-total">{gamesPlayed.toLocaleString()} rated games</div>
            </aside>

            <div className="profile-main-column">
              <header className="profile-hero">
                <div className="profile-identity">
                  <div className="profile-large-avatar">
                    {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <CursorMark />}
                  </div>
                  <div>
                    <h1>{profile.display_name || profile.username}</h1>
                    <span className="profile-handle">@{profile.username}</span>
                  </div>
                </div>
                <div className="profile-hero-actions">
                  {ownProfile && <button className="profile-action-button" type="button" onClick={onEdit}>⚙ Edit profile</button>}
                  <button className="profile-action-button" type="button" onClick={() => void navigator.clipboard?.writeText(window.location.href)}>↗ Copy profile URL</button>
                </div>
              </header>

              <div className="profile-overview-grid">
                <section className="profile-chart-card">
                  <div className="profile-chart-topline">
                    <div className="profile-chart-current">
                      <span>{selectedControl.category.toUpperCase()}</span>
                      <strong>{selectedRating ?? "—"}</strong>
                      <small>{selectedControl.label} rating</small>
                    </div>
                    <div className="profile-range-controls" aria-label="Rating chart date range">
                      {(["1M", "3M", "6M", "YTD", "1Y", "ALL"] as const).map((item) =>
                        <button type="button" key={item} className={range === item ? "active" : ""}
                          aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>
                      )}
                    </div>
                  </div>
                  <RatingChart rating={selectedRating} history={selectedHistory} label={selectedControl.label} />
                  <div className="profile-chart-footer"><span>{selectedHistory.length ? `${selectedHistory.length} recorded rating updates` : "Rating history"}</span><span>Independent rating pool</span></div>
                </section>
                <aside className="profile-info-card">
                  <strong className="profile-info-name">{profile.display_name || profile.username}</strong>
                  {profile.bio && <p className="profile-bio">{profile.bio}</p>}
                  <div className="profile-info-line">Member since {joined ?? "—"}</div>
                  <div className="profile-info-line">Active rating: {selectedRating ?? "Unrated"} · {selectedControl.category}</div>
                  <div className="profile-info-line">Games played: {gamesPlayed.toLocaleString()}</div>
                  <div className="profile-info-line">Win rate: {winRate}%</div>
                  <div className="profile-info-links">
                    <button type="button" onClick={() => setTab("games")}>View games <span>→</span></button>
                    {ownProfile && <button type="button" onClick={onEdit}>Edit profile <span>→</span></button>}
                  </div>
                </aside>
              </div>

              <div className="profile-stats-strip">
                <div><strong>{gamesPlayed.toLocaleString()}</strong><span>Games</span></div>
                <div><strong>{wins.toLocaleString()}</strong><span>Wins</span></div>
                <div><strong>{draws.toLocaleString()}</strong><span>Draws</span></div>
                <div><strong>{losses.toLocaleString()}</strong><span>Losses</span></div>
                <div><strong>{winRate}%</strong><span>Win rate</span></div>
              </div>

              <div className="profile-activity-panel">
                <div className="profile-activity-tabs">
                  <button type="button" className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity</button>
                  <button type="button" className={tab === "games" ? "active" : ""} onClick={() => setTab("games")}>Games <span>{gamesPlayed.toLocaleString()}</span></button>
                </div>
                {tab === "activity" && (
                  <div className="profile-activity-summary">
                    <div className="profile-activity-date">{recentGames[0] ? new Date(recentGames[0].finishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).toUpperCase() : "ACTIVITY"}</div>
                    <div className="profile-activity-callout">
                      <span className="profile-activity-medallion"><CursorMark /></span>
                      <div><strong>{recentGames.length ? `Played ${recentGames.length} recent games` : "No activity yet"}</strong><small>{recentGames.length ? "Recent completed games are listed in the Games tab." : "Completed rated games will appear here."}</small></div>
                    </div>
                  </div>
                )}
                {tab === "games" && (recentGames.length === 0 ? (
                  <div className="profile-activity-empty"><CursorMark className="profile-empty-mark" /><strong>No completed games yet</strong><p>Finished games will appear here.</p></div>
                ) : (
                  <div className="profile-game-list">
                    {recentGames.map((game) => (
                      <div className="profile-game-row" key={game.id}>
                        <div className={`profile-game-outcome ${game.outcome.toLowerCase()}`}>{game.outcome}</div>
                        <div className="profile-game-details">
                          <strong>vs {game.opponentUsername ? <a className="profile-player-link" href={profileHref(game.opponentUsername)} onClick={(event) => { event.preventDefault(); onOpenProfile(game.opponentUsername!); }}>{game.opponent}</a> : game.opponent}</strong>
                          <span>{game.control} · {new Date(game.finishedAt).toLocaleDateString()}</span>
                        </div>
                        <span className={`profile-game-rating ${game.ratingChange == null ? "" : game.ratingChange >= 0 ? "positive" : "negative"}`}>
                          {game.ratingChange == null ? "—" : `${game.ratingChange > 0 ? "+" : ""}${game.ratingChange}`}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
    </section>
  );
}
