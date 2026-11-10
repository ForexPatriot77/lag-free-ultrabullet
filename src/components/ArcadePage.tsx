import { useEffect, useMemo, useState } from "react";

type ArcadeMode = "frenzy" | "endurance" | "cheat";
type RecordEntry = { score: number; date: string };
const MODES: { id: ArcadeMode; label: string; description: string }[] = [
  { id: "frenzy", label: "Frenzy", description: "30 seconds. Tap the white tiles, build your combo, and keep moving." },
  { id: "endurance", label: "Endurance", description: "Start with 10 seconds. Every 40 correct taps adds 10 seconds." },
  { id: "cheat", label: "Cheat", description: "Frenzy scoring with no black tiles. Every square is safe." },
];
const RECORD_KEYS: Record<ArcadeMode, string> = {
  frenzy: "records",
  endurance: "recordsEndurance",
  cheat: "recordsCheat",
};
function loadRecords(mode: ArcadeMode): RecordEntry[] {
  try {
    const raw = localStorage.getItem(RECORD_KEYS[mode]);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => Number.isFinite(item.score ?? item.record)).map((item) => ({ score: Number(item.score ?? item.record), date: item.date ?? "" })).sort((a,b) => b.score-a.score).slice(0,10) : [];
  } catch { return []; }
}
function randomBlackTiles() {
  const tiles = new Set<number>();
  while (tiles.size < 3) tiles.add(Math.floor(Math.random() * 16));
  return [...tiles];
}

export function ArcadePage() {
  const [mode, setMode] = useState<ArcadeMode>("frenzy");
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [bonus, setBonus] = useState(0);
  const [blackTiles, setBlackTiles] = useState<number[]>(randomBlackTiles);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [records, setRecords] = useState<Record<ArcadeMode, RecordEntry[]>>(() => ({
    frenzy: loadRecords("frenzy"), endurance: loadRecords("endurance"), cheat: loadRecords("cheat"),
  }));
  const [lastResult, setLastResult] = useState<"miss" | "timeout" | null>(null);
  const [bestFlash, setBestFlash] = useState(false);
  const best = records[mode][0]?.score ?? 0;
  const modeInfo = useMemo(() => MODES.find((item) => item.id === mode)!, [mode]);

  const finish = (reason: "miss" | "timeout") => {
    setRunning(false);
    setLastResult(reason);
    if (score <= 0) return;
    const next = [...records[mode], { score, date: new Date().toLocaleDateString() }]
      .sort((a,b) => b.score-a.score).slice(0,10);
    const isNewBest = score > (records[mode][0]?.score ?? 0);
    setRecords((current) => ({ ...current, [mode]: next }));
    try {
      localStorage.setItem(RECORD_KEYS[mode], JSON.stringify(next.map((item) => ({ record: item.score, date: item.date }))));
    } catch { /* Private browsing may block local storage. */ }
    if (isNewBest) {
      setBestFlash(true);
      window.setTimeout(() => setBestFlash(false), 1200);
    }
  };

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 0.1) {
          window.clearInterval(timer);
          return 0;
        }
        return Math.max(0, Math.round((current - 0.1) * 10) / 10);
      });
      if (mode !== "endurance") setBonus((current) => Math.max(0.1, Math.round((current - 3) * 10) / 10));
    }, 100);
    return () => window.clearInterval(timer);
  }, [running, mode]);

  useEffect(() => {
    if (running && timeLeft <= 0) finish("timeout");
  }, [timeLeft, running]);

  useEffect(() => {
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== "Space" || running) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "BUTTON" || target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      event.preventDefault();
      start();
    };
    window.addEventListener("keydown", handleSpace);
    return () => window.removeEventListener("keydown", handleSpace);
  }, [running, mode]);

  const start = () => {
    setScore(0);
    setBonus(0);
    setTimeLeft(mode === "endurance" ? 10 : 30);
    setBlackTiles(mode === "cheat" ? [] : randomBlackTiles());
    setLastResult(null);
    setRunning(true);
  };

  const changeMode = (next: ArcadeMode) => {
    setRunning(false);
    setMode(next);
    setScore(0);
    setBonus(0);
    setTimeLeft(next === "endurance" ? 10 : 30);
    setBlackTiles(next === "cheat" ? [] : randomBlackTiles());
    setLastResult(null);
  };

  const tapTile = (index: number) => {
    if (!running) return;
    if (mode !== "cheat" && blackTiles.includes(index)) {
      finish("miss");
      return;
    }
    if (mode === "endurance") {
      setScore((current) => {
        const next = current + 1;
        if (next % 40 === 0) setTimeLeft((time) => time + 10);
        return next;
      });
    } else {
      setBonus((current) => {
        const nextBonus = Math.min(100, current + 8);
        setScore((currentScore) => currentScore + Math.ceil(nextBonus / 20));
        return nextBonus;
      });
    }
    if (mode !== "cheat") {
      setBlackTiles((current) => {
        const next = [...current];
        const slot = next.indexOf(index);
        if (slot >= 0) {
          let replacement = Math.floor(Math.random() * 16);
          while (next.includes(replacement) || replacement === index) replacement = Math.floor(Math.random() * 16);
          next[slot] = replacement;
        }
        return next;
      });
    }
  };

  const shownTime = timeLeft.toFixed(1).replace(/\.0$/, "");
  const boardSize = `min( min(76vw, 54vh), 31rem )`;

  return (
    <section className="arcade-page">
      <header className="arcade-heading">
        <div><span className="page-kicker">LAG-FREE ARCADE</span><h1>Don't Tap</h1><p>A quick reflex challenge. Three modes, one board.</p></div>
        <div className="arcade-best"><span>PERSONAL BEST</span><strong className={bestFlash ? "new-best" : ""}>{best.toLocaleString()}</strong><small>{modeInfo.label}</small></div>
      </header>
      <div className="arcade-mode-tabs" role="tablist" aria-label="Game mode">
        {MODES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} className={mode === item.id ? "active" : ""} onClick={() => changeMode(item.id)}>{item.label}</button>)}
      </div>
      <div className="arcade-layout">
        <div className="arcade-game-column">
          <div className="arcade-hud"><div><span>TIME</span><strong className={timeLeft <= 5 && running ? "time-warning" : ""}>{shownTime}s</strong></div><div><span>SCORE</span><strong>{score.toLocaleString()}</strong></div><div><span>COMBO BONUS</span><strong>{mode === "endurance" ? "—" : `×${Math.max(1, Math.ceil(bonus / 20))}`}</strong></div></div>
          <div className="arcade-board-wrap">
            <div className={`arcade-board ${running ? "is-running" : ""}`} style={{ width: boardSize, maxWidth: "100%", transform: `scale(${zoom / 100})` }} role="group" aria-label="Four by four tile board">
              {Array.from({ length: 16 }, (_, index) => {
                const black = mode !== "cheat" && blackTiles.includes(index);
                return <button key={index} type="button" className={`arcade-tile ${black ? "black" : "white"}`} onClick={() => tapTile(index)} disabled={!running} aria-label={black ? `Black tile ${index + 1}` : `White tile ${index + 1}`} />;
              })}
              {!running && <div className="arcade-overlay"><strong>{lastResult === "miss" ? "Wrong tile!" : lastResult === "timeout" ? "Time's up!" : "Ready?"}</strong><span>{lastResult ? `Final score: ${score}` : "Press start or Space to begin"}</span><button type="button" className="arcade-start" onClick={start}>{lastResult ? "Play again" : "Start game"}</button></div>}
            </div>
          </div>
          <div className="arcade-controls"><button type="button" onClick={start} disabled={running}>Restart</button><button type="button" onClick={() => setRecordsOpen((open) => !open)}>{recordsOpen ? "Hide records" : "Records"}</button><label>Board size <input type="range" min="80" max="120" step="5" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label></div>
          {recordsOpen && <div className="arcade-records"><strong>{modeInfo.label} records</strong>{records[mode].length ? records[mode].map((record,index) => <div key={index}><span>#{index+1} · {record.date}</span><b>{record.score.toLocaleString()}</b></div>) : <p>No records yet. Set one!</p>}</div>}
        </div>
        <aside className="arcade-side">
          <div className="arcade-info-card"><span className="page-kicker">CURRENT MODE</span><h2>{modeInfo.label}</h2><p>{modeInfo.description}</p></div>
          <div className="arcade-info-card"><span className="page-kicker">HOW TO PLAY</span><ul><li>Tap only white tiles.</li><li>A black tile ends the run in Frenzy and Endurance.</li><li>Cheat mode removes all black tiles.</li><li>Press Space to start after a run.</li></ul></div>
          <div className="arcade-info-card"><span className="page-kicker">YOUR STATS</span><div className="arcade-stat"><span>Best score</span><b>{best.toLocaleString()}</b></div><div className="arcade-stat"><span>Records saved</span><b>{records[mode].length}</b></div></div>
        </aside>
      </div>
    </section>
  );
}
