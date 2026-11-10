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
          .limit(20),
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
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : null;
  const winRate = rating && rating.games_played
    ? Math.round((rating.wins / rating.games_played) * 100)
    : 0;
  const selectedControl = TIME_CONTROLS.find((control) => control.initialTimeMs === selectedTimeMs) ?? TIME_CONTROLS[1];
  const selectedRating = rating?.[ratingColumnForTime(selectedTimeMs)] ?? null;
  const selectedHistory = ratingHistory.filter((point) => point.rating_pool === selectedControl.ratingPool);

  return (
    <section className="lichess-profile-page">
      {loading ? <div className="profile-loading">Loading player profile…</div> :
        error ? <div className="profile-error">{error}</div> : profile && (
          <>
            <aside className="profile-ratings-rail">
              <h2 className="profile-ratings-heading">Ratings by time control</h2>
              <div className="profile-variant-title"><span>30s · Hyperbullet</span></div>
              <div className="profile-rating-block"><strong>{rating?.hyperbullet_rating ?? "?"}</strong><span>{rating?.hyperbullet_rating != null ? "Rated pool" : "Not rated yet"}</span></div>
              <div className="profile-variant-title"><span>15s · Ultrabullet</span></div>
              <div className="profile-rating-block"><strong>{rating?.ultrabullet_rating ?? "?"}</strong><span>Independent rating pool</span></div>
              <div className="profile-variant-title"><span>7.5s · Ultrazerk</span></div>
              <div className="profile-rating-block"><strong>{rating?.ultrazerk_rating ?? "?"}</strong><span>Independent rating pool</span></div>
              <div className="profile-variant-title"><span>3.25s · Psycho</span></div>
              <div className="profile-rating-block"><strong>{rating?.psycho_3250_rating ?? "?"}</strong><span>Independent rating pool</span></div>
              <div className="profile-variant-title"><span>1.625s · Psycho</span></div>
              <div className="profile-rating-block"><strong>{rating?.psycho_1625_rating ?? "?"}</strong><span>Independent rating pool</span></div>
              <div className="profile-variant-title"><span>0.8125s · Psycho</span></div>
              <div className="profile-rating-block"><strong>{rating?.psycho_812_5_rating ?? "?"}</strong><span>Independent rating pool</span></div>
              <div className="profile-variant-title"><span>0.40625s · Psycho</span></div>
              <div className="profile-rating-block"><strong>{rating?.psycho_406_25_rating ?? "?"}</strong><span>Independent rating pool</span></div>
              <div className="profile-variant-title"><span>0.203125s · Psycho</span></div>
              <div className="profile-rating-block"><strong>{rating?.psycho_203_125_rating ?? "?"}</strong><span>Independent rating pool</span></div>
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
                {ownProfile && <div className="profile-hero-actions"><button className="profile-edit-action" type="button" onClick={onEdit}>Preferences</button><button className="profile-edit-action" type="button" onClick={() => void navigator.clipboard?.writeText(window.location.href)}>Copy profile URL</button></div>}
              </header>

              <div className="profile-overview-grid">
                <section className="profile-chart-card">
                  <div className="profile-chart-controls">
                    <strong>Rating history</strong>
                    <label>Time control
                      <select value={selectedTimeMs} onChange={(event) => setSelectedTimeMs(Number(event.target.value))}>
                        {TIME_CONTROLS.map((control) => <option key={control.initialTimeMs} value={control.initialTimeMs}>{control.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="profile-rating-summary">
                    <strong>{selectedRating ?? "Unrated"}</strong>
                    <span>{selectedControl.label} · no increment</span>
                  </div>
                  <RatingChart rating={selectedRating} history={selectedHistory} label={selectedControl.label} />
                </section>
                <aside className="profile-info-card">
                  <div className="profile-info-name">{profile.display_name || profile.username}</div>
                  {profile.bio && <p>{profile.bio}</p>}
                  {joined && <div className="profile-info-line">Member since {joined}</div>}
                  <div className="profile-info-line">Lichess Bullet imports as the initial 30s Hyperbullet rating</div>
                  <div className="profile-info-line">Lichess Ultrabullet imports as the initial 15s rating</div>
                  <div className="profile-info-line">Rated games: {rating?.games_played ?? 0}</div>
                </aside>
              </div>

              <div className="profile-stats-strip">
                <div><strong>{rating?.games_played ?? 0}</strong><span>Games</span></div>
                <div><strong>{rating?.wins ?? 0}</strong><span>Wins</span></div>
                <div><strong>{rating?.draws ?? 0}</strong><span>Draws</span></div>
                <div><strong>{rating?.losses ?? 0}</strong><span>Losses</span></div>
                <div><strong>{winRate}%</strong><span>Win rate</span></div>
              </div>

              <div className="profile-activity-panel">
                <div className="profile-activity-tabs"><span className="active">Recent games</span></div>
                {recentGames.length === 0 ? (
                  <div className="profile-activity-empty">
                    <CursorMark className="profile-empty-mark" />
                    <strong>No completed games yet</strong>
                    <p>Finished rated games will appear here.</p>
                  </div>
                ) : (
                  <div className="profile-game-list">
                    {recentGames.map((game) => (
                      <div className="profile-game-row" key={game.id}>
                        <div className={`profile-game-outcome ${game.outcome.toLowerCase()}`}>{game.outcome}</div>
                        <div className="profile-game-details">
                          <strong>vs {game.opponentUsername ? <button type="button" className="profile-player-link" onClick={() => onOpenProfile(game.opponentUsername!)}>{game.opponent}</button> : game.opponent}</strong>
                          <span>{game.control} · {new Date(game.finishedAt).toLocaleDateString()}</span>
                        </div>
                        <span className={`profile-game-rating ${game.ratingChange == null ? "" : game.ratingChange >= 0 ? "positive" : "negative"}`}>
                          {game.ratingChange == null ? "—" : `${game.ratingChange > 0 ? "+" : ""}${game.ratingChange}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
    </section>
  );
}
