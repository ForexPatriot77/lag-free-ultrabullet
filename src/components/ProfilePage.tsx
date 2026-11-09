import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { supabase } from "../lib/supabase";
import { TIME_CONTROLS, ratingColumnForTime } from "../lib/timeControls";

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

export function ProfilePage({ username, ownProfile, onEdit }: {
  username: string;
  ownProfile: boolean;
  onEdit: () => void;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [rating, setRating] = useState<RatingData | null>(null);
  const [ratingHistory, setRatingHistory] = useState<RatingHistoryPoint[]>([]);
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
      const { data: stats } = await supabase
        .from("player_ratings")
        .select("hyperbullet_rating, ultrabullet_rating, ultrazerk_rating, psycho_3250_rating, psycho_1625_rating, psycho_812_5_rating, psycho_406_25_rating, psycho_203_125_rating, games_played, wins, draws, losses")
        .eq("user_id", person.id)
        .maybeSingle();
      if (!active) return;
      setRating(stats as RatingData | null);
      const { data: historyRows } = await supabase
        .from("player_rating_history")
        .select("rating, rating_pool, recorded_at")
        .eq("user_id", person.id)
         .order("recorded_at", { ascending: false })
        .limit(800);
      if (!active) return;
      setRatingHistory(((historyRows ?? []) as RatingHistoryPoint[]).reverse());
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
              <div className="profile-rating-block"><strong>{rating?.hyperbullet_rating ?? "?"}</strong><span>{rating?.hyperbullet_rating != null ? "Imported from Lichess Bullet" : "Not rated yet"}</span></div>
              <div className="profile-variant-title"><span>15s · Ultrabullet</span></div>
              <div className="profile-rating-block"><strong>{rating?.ultrabullet_rating ?? "?" }</strong><span>Rated pool</span></div>
              <div className="profile-variant-title muted"><span>7.5s · Ultrazerk</span></div>
              <div className="profile-rating-block muted"><strong>{"—" }</strong><span>Not rated yet</span></div>
              <div className="profile-variant-title muted"><span>3.25s · Psycho</span></div>
              <div className="profile-rating-block muted"><strong>{"—" }</strong><span>Not rated yet</span></div>
              <div className="profile-variant-title muted"><span>1.625s · Psycho</span></div>
              <div className="profile-rating-block muted"><strong>{"—" }</strong><span>Not rated yet</span></div>
              <div className="profile-variant-title muted"><span>0.8125s · Psycho</span></div>
              <div className="profile-rating-block muted"><strong>{"—" }</strong><span>Not rated yet</span></div>
              <div className="profile-variant-title muted"><span>0.40625s · Psycho</span></div>
              <div className="profile-rating-block muted"><strong>{"—" }</strong><span>Not rated yet</span></div>
              <div className="profile-variant-title muted"><span>0.203125s · Psycho</span></div>
              <div className="profile-rating-block muted"><strong>{"—" }</strong><span>Not rated yet</span></div>
            </aside>

            <div className="profile-main-column">
              <header className="profile-hero">
                <div className="profile-identity">
                  <div className="profile-large-avatar">
                    {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : "♟"}
                  </div>
                  <div>
                    <div className="profile-online-dot" />
                    <h1>{profile.display_name || profile.username}</h1>
                    <span className="profile-handle">@{profile.username}</span>
                  </div>
                </div>
                {ownProfile && <button className="profile-edit-action" onClick={onEdit}>⚙ Edit profile</button>}
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
                  <div className="profile-info-line">Lichess Bullet → 30s Hyperbullet</div>
                  <div className="profile-info-line">Lichess Ultrabullet → 15s Ultrabullet</div>
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
                <div className="profile-activity-tabs"><span className="active">Activity</span><span>Games</span></div>
                <div className="profile-activity-empty">
                  <span>♞</span>
                  <strong>No public activity yet</strong>
                  <p>Completed games and rating history will be shown here as the profile system grows.</p>
                </div>
              </div>
            </div>
          </>
        )}
    </section>
  );
}
