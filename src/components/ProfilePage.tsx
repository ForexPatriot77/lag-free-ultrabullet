import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type ProfileData = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
};

type RatingData = {
  ultrabullet_rating: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
};

export function ProfilePage({ username, ownProfile, onEdit }: {
  username: string;
  ownProfile: boolean;
  onEdit: () => void;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [rating, setRating] = useState<RatingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setProfile(null);
    setRating(null);
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
        .select("ultrabullet_rating, games_played, wins, draws, losses")
        .eq("user_id", person.id)
        .maybeSingle();
      if (!active) return;
      setRating(stats as RatingData | null);
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

  return (
    <section className="lichess-profile-page">
      {loading ? <div className="profile-loading">Loading player profile…</div> :
        error ? <div className="profile-error">{error}</div> : profile && (
          <>
            <aside className="profile-ratings-rail">
              <div className="profile-variant-title">♞ <span>ULTRABULLET</span></div>
              <div className="profile-rating-block">
                <strong>{rating?.ultrabullet_rating ?? "?"}</strong>
                <span>{rating?.games_played ?? 0} games</span>
              </div>
              <div className="profile-variant-title muted">♟ <span>BULLET</span></div>
              <div className="profile-rating-block muted"><strong>—</strong><span>Not rated</span></div>
              <div className="profile-variant-title muted">♞ <span>BLITZ</span></div>
              <div className="profile-rating-block muted"><strong>—</strong><span>Not rated</span></div>
              <div className="profile-variant-title muted">♘ <span>RAPID</span></div>
              <div className="profile-rating-block muted"><strong>—</strong><span>Not rated</span></div>
              <div className="profile-variant-title muted">♙ <span>CLASSICAL</span></div>
              <div className="profile-rating-block muted"><strong>—</strong><span>0 games</span></div>
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
                  <div className="profile-card-tabs"><span className="active">Rating</span><span>Activity</span></div>
                  <div className="profile-rating-summary">
                    <strong>{rating?.ultrabullet_rating ?? "Unrated"}</strong>
                    <span>Ultrabullet rating</span>
                  </div>
                  <div className="rating-chart-empty">
                    <div className="rating-chart-grid"><span>2200</span><span>2000</span><span>1800</span><span>1600</span><span>1400</span></div>
                    <div className="rating-chart-message">Your rating history will appear here as you play more games.</div>
                  </div>
                  <div className="rating-range-labels"><span>1M</span><span>3M</span><span>6M</span><span>YTD</span><span>1Y</span><span>ALL</span></div>
                </section>
                <aside className="profile-info-card">
                  <div className="profile-info-name">{profile.display_name || profile.username}</div>
                  {profile.bio && <p>{profile.bio}</p>}
                  {joined && <div className="profile-info-line">Member since {joined}</div>}
                  <div className="profile-info-line">Ultrabullet player</div>
                  <div className="profile-info-line">Games played: {rating?.games_played ?? 0}</div>
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
