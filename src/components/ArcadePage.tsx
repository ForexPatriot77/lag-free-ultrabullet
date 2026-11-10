import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  type ArcadeMode, createBlackTiles, decayFrenzyBonus,
  frenzyPointsForBonus, isSuccessfulTap, nextFrenzyBonus, relocateBlackTile,
} from "../lib/arcade";

type RecordEntry = { id: string; user_id: string; mode: ArcadeMode; score: number; played_at: string };
type PlayerRecord = RecordEntry & { username: string; displayName: string };

const MODES: { id: ArcadeMode; label: string; description: string }[] = [
  { id: "frenzy", label: "Frenzy", description: "30 seconds. Tap the three black tiles. Each hit moves that tile to a new square; keep your combo alive." },
  { id: "endurance", label: "Endurance", description: "Start with 10 seconds. Tap the three black tiles. Every 40 successful taps adds 10 seconds." },
  { id: "cheat", label: "Cheat", description: "Frenzy scoring with no black tiles. Every square is a valid target." },
];

export function ArcadePage({ user, onOpenProfile }: {
  user: User | null;
  onOpenProfile: (username: string) => void;
}) {
  const [mode, setMode] = useState<ArcadeMode>("frenzy");
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [bonus, setBonus] = useState(0);
  const [blackTiles, setBlackTiles] = useState<number[]>(() => createBlackTiles());
  const [recordsOpen, setRecordsOpen] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [leaderboard, setLeaderboard] = useState<PlayerRecord[]>([]);
  const [personalBest, setPersonalBest] = useState(0);
  const [loadingScores, setLoadingScores] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [lastResult, setLastResult] = useState<"miss" | "timeout" | null>(null);
  const [bestFlash, setBestFlash] = useState(false);

  const runningRef = useRef(false);
  const scoreRef = useRef(0);
  const bonusRef = useRef(0);
  const modeRef = useRef<ArcadeMode>("frenzy");
  const blackTilesRef = useRef<number[]>(createBlackTiles());
  const deadlineRef = useRef(0);
  const modeInfo = MODES.find((item) => item.id === mode)!;

  const refreshScores = async (selectedMode: ArcadeMode) => {
    setLoadingScores(true);
    const [boardResult, personalResult] = await Promise.all([
      supabase.from("arcade_scores")
        .select("id,user_id,mode,score,played_at")
        .eq("mode", selectedMode)
        .order("score", { ascending: false })
        .order("played_at", { ascending: true })
        .limit(100),
      user ? supabase.from("arcade_scores")
        .select("score")
        .eq("user_id", user.id)
        .eq("mode", selectedMode)
        .order("score", { ascending: false })
        .limit(1) : Promise.resolve({ data: [], error: null }),
    ]);
    const rows = (boardResult.data ?? []) as RecordEntry[];
    const uniqueRows = rows.filter((row, index) => rows.findIndex((item) => item.user_id === row.user_id) === index).slice(0, 10);
    const ids = [...new Set(uniqueRows.map((row) => row.user_id))];
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id,username,display_name").in("id", ids)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    setLeaderboard(uniqueRows.map((row) => {
      const profile = profileMap.get(row.user_id);
      return { ...row, username: profile?.username ?? "player", displayName: profile?.display_name || profile?.username || "Player" };
    }));
    setPersonalBest(personalResult.data?.[0]?.score ?? 0);
    setLoadingScores(false);
  };

  useEffect(() => {
    void refreshScores(mode);
  }, [mode, user?.id]);

  const finish = (reason: "miss" | "timeout") => {
    if (!runningRef.current) return;
    runningRef.current = false;
    setRunning(false);
    setLastResult(reason);
    const finalScore = scoreRef.current;
    const finishedMode = modeRef.current;
    if (!user || finalScore <= 0) {
      setSaveStatus(user ? "No score to save." : "Sign in to save scores to your profile.");
      return;
    }
    setSaveStatus("Saving score…");
    void (async () => {
      const { error } = await supabase.from("arcade_scores").insert({
        user_id: user.id,
        mode: finishedMode,
        score: finalScore,
      });
      if (error) {
        setSaveStatus("Couldn't save score. Please try again.");
        return;
      }
      setSaveStatus("Score saved to your profile.");
      await refreshScores(finishedMode);
      if (finalScore > personalBest) {
        setBestFlash(true);
        window.setTimeout(() => setBestFlash(false), 1200);
      }
    })();
  };

  const start = () => {
    const selectedMode = modeRef.current;
    const initialTime = selectedMode === "endurance" ? 10 : 30;
    scoreRef.current = 0;
    bonusRef.current = 0;
    const initialTiles = selectedMode === "cheat" ? [] : createBlackTiles();
    blackTilesRef.current = initialTiles;
    setScore(0);
    setBonus(0);
    setTimeLeft(initialTime);
    setBlackTiles(initialTiles);
    setLastResult(null);
    setSaveStatus("");
    deadlineRef.current = performance.now() + initialTime * 1000;
    runningRef.current = true;
    setRunning(true);
  };

  const changeMode = (next: ArcadeMode) => {
    runningRef.current = false;
    setRunning(false);
    modeRef.current = next;
    setMode(next);
    scoreRef.current = 0;
    bonusRef.current = 0;
    const tiles = next === "cheat" ? [] : createBlackTiles();
    blackTilesRef.current = tiles;
    setScore(0);
    setBonus(0);
    setTimeLeft(next === "endurance" ? 10 : 30);
    setBlackTiles(tiles);
    setLastResult(null);
    setSaveStatus("");
  };

  const tapTile = (index: number) => {
    if (!runningRef.current) return;
    const selectedMode = modeRef.current;
    const target = blackTilesRef.current.includes(index);
    if (!isSuccessfulTap(selectedMode, target)) {
      finish("miss");
      return;
    }

    if (selectedMode === "endurance") {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      if (scoreRef.current % 40 === 0) {
        deadlineRef.current += 10000;
        setTimeLeft((current) => current + 10);
      }
    } else {
      bonusRef.current = nextFrenzyBonus(bonusRef.current);
      setBonus(bonusRef.current);
      scoreRef.current += frenzyPointsForBonus(bonusRef.current);
      setScore(scoreRef.current);
    }

    if (selectedMode !== "cheat") {
      const moved = relocateBlackTile(blackTilesRef.current, index);
      blackTilesRef.current = moved;
      setBlackTiles(moved);
    }
  };

  useEffect(() => {
    if (!running) return;
    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTick;
      lastTick = now;
      const remaining = Math.max(0, (deadlineRef.current - now) / 1000);
      setTimeLeft(remaining);
      if (modeRef.current !== "endurance") {
        bonusRef.current = decayFrenzyBonus(bonusRef.current, elapsed);
        setBonus(bonusRef.current);
      }
      if (remaining <= 0) finish("timeout");
    }, 50);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== "Space" || runningRef.current || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      start();
    };
    window.addEventListener("keydown", handleSpace);
    return () => window.removeEventListener("keydown", handleSpace);
  }, []);

  const shownTime = timeLeft.toFixed(1).replace(/\.0$/, "");
  const best = personalBest;

  return (
    <section className="arcade-page">
      <header className="arcade-heading">
        <div><span className="page-kicker">LAG-FREE ARCADE</span><h1>Don't Tap</h1><p>Tap the black tiles. Three modes, your account's records.</p></div>
        <div className="arcade-best"><span>YOUR PERSONAL BEST</span><strong className={bestFlash ? "new-best" : ""}>{best.toLocaleString()}</strong><small>{modeInfo.label}</small></div>
      </header>
      <div className="arcade-mode-tabs" role="tablist" aria-label="Game mode">
        {MODES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} className={mode === item.id ? "active" : ""} onClick={() => changeMode(item.id)}>{item.label}</button>)}
      </div>
      <div className="arcade-layout">
        <div className="arcade-game-column">
          <div className="arcade-hud"><div><span>TIME</span><strong className={timeLeft <= 5 && running ? "time-warning" : ""}>{shownTime}s</strong></div><div><span>SCORE</span><strong>{score.toLocaleString()}</strong></div><div><span>COMBO BONUS</span><strong>{mode === "endurance" ? "—" : `×${Math.max(1, frenzyPointsForBonus(bonus))}`}</strong></div></div>
          <div className="arcade-board-wrap">
            <div className={`arcade-board ${running ? "is-running" : ""}`} style={{ width: "min(76vw, 54vh, 31rem)", maxWidth: "100%", transform: `scale(${zoom / 100})` }} role="group" aria-label="Four by four tile board">
              {Array.from({ length: 16 }, (_, index) => {
                const black = mode !== "cheat" && blackTiles.includes(index);
                return <button key={index} type="button" className={`arcade-tile ${black ? "black" : "white"}`} onClick={() => tapTile(index)} disabled={!running} aria-label={black ? `Black target tile ${index + 1}` : `White tile ${index + 1}`} />;
              })}
              {!running && <div className="arcade-overlay"><strong>{lastResult === "miss" ? "Wrong tile!" : lastResult === "timeout" ? "Time's up!" : "Ready?"}</strong><span>{lastResult ? `Final score: ${score}` : mode === "cheat" ? "Tap any tile · Press Space to start" : "Tap the black tiles · Press Space to start"}</span><button type="button" className="arcade-start" onClick={start}>{lastResult ? "Play again" : "Start game"}</button></div>}
            </div>
          </div>
          <div className="arcade-controls"><button type="button" onClick={start} disabled={running}>Restart</button><button type="button" onClick={() => setRecordsOpen((open) => !open)}>{recordsOpen ? "Hide leaderboard" : "Leaderboard"}</button><label>Board size <input type="range" min="80" max="120" step="5" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label></div>
          {saveStatus && <p className="arcade-save-status" role="status">{saveStatus}</p>}
          {recordsOpen && <div className="arcade-records"><strong>{modeInfo.label} leaderboard</strong>{loadingScores ? <p>Loading scores…</p> : leaderboard.length ? leaderboard.map((record,index) => <div key={record.id}><span>#{index+1} · <button type="button" className="arcade-player-link" onClick={() => onOpenProfile(record.username)}>{record.displayName}</button></span><b>{record.score.toLocaleString()}</b></div>) : <p>No scores yet. Be the first!</p>}</div>}
        </div>
        <aside className="arcade-side">
          <div className="arcade-info-card"><span className="page-kicker">CURRENT MODE</span><h2>{modeInfo.label}</h2><p>{modeInfo.description}</p></div>
          <div className="arcade-info-card"><span className="page-kicker">HOW TO PLAY</span><ul>{mode === "cheat" ? <li>Tap any square; all 16 tiles are valid.</li> : <><li>Tap only black tiles.</li><li>Each successful hit moves that black tile to an empty square.</li><li>Tap a white tile and the run ends.</li></>}<li>Press Space to start after a run.</li></ul></div>
          <div className="arcade-info-card"><span className="page-kicker">YOUR ACCOUNT</span><div className="arcade-stat"><span>Personal best</span><b>{best.toLocaleString()}</b></div><div className="arcade-stat"><span>Record owner</span><b>{user ? "Your account" : "Guest"}</b></div>{!user && <p>Sign in to save scores and appear on the leaderboard.</p>}</div>
        </aside>
      </div>
    </section>
  );
}
