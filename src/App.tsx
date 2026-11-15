import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Scene, { type CamKey, type Replay } from "./scene/Scene";
import { type League, type Meta, type PlayerRec, type ShotFile, clock, fold, isThree, loadLeague, loadMeta, loadPlayers, loadShots, niceDate, pct, summarize } from "./data";
import { TEAM_NAME, teamColor } from "./teams";

const DEFAULT_PLAYER = 1628378; // Donovan Mitchell
const ZONE_LABEL = ["Restricted area", "Paint", "Mid-range", "Left corner 3", "Right corner 3", "Above the break 3"];
const CAM_LABEL: Record<CamKey, string> = { main: "Main", floor: "Courtside", sideline: "Sideline", baseline: "Baseline", overhead: "Overhead" };

function readHash() {
  const m = /^#p(\d+)-s(\d{4}-\d{2})$/.exec(location.hash);
  return m ? { id: +m[1], season: m[2] } : null;
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [players, setPlayers] = useState<PlayerRec[]>([]);
  const [error, setError] = useState("");
  const [playerId, setPlayerId] = useState(() => readHash()?.id ?? DEFAULT_PLAYER);
  const [season, setSeason] = useState(() => readHash()?.season ?? "");
  const [shots, setShots] = useState<ShotFile | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [game, setGame] = useState(-1); // -1 means the whole season
  const [kind, setKind] = useState<"all" | "2" | "3">("all");
  const [cam, setCam] = useState<CamKey>("main");
  const [camNonce, setCamNonce] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shownUI, setShownUI] = useState(0);
  const replay = useRef<Replay>({ shown: 0, flying: -1, u: 0 });
  const lite = useMemo(() => window.matchMedia("(max-width: 760px), (pointer: coarse)").matches, []);

  useEffect(() => {
    Promise.all([loadMeta(), loadPlayers()]).then(([m, p]) => { setMeta(m); setPlayers(p); }).catch((e) => setError(String(e.message || e)));
  }, []);

  const player = useMemo(() => players.find((p) => p.id === playerId) ?? null, [players, playerId]);
  const seasons = useMemo(() => (player ? Object.keys(player.s).sort().reverse() : []), [player]);

  // Settle on a season this player actually has: the one asked for, else his latest full one.
  useEffect(() => {
    if (!player || !meta) return;
    if (player.s[season]) return;
    const full = seasons.find((s) => s !== meta.seasons[meta.seasons.length - 1]);
    setSeason(full ?? seasons[0]);
  }, [player, meta, season, seasons]);

  useEffect(() => {
    if (!player || !player.s[season]) return;
    let live = true;
    setShots(null); setGame(-1);
    Promise.all([loadShots(season, player.id), loadLeague(season)])
      .then(([s, l]) => { if (live) { setShots(s); setLeague(l); } })
      .catch((e) => live && setError(String(e.message || e)));
    history.replaceState(null, "", `#p${player.id}-s${season}`);
    return () => { live = false; };
  }, [player, season]);

  useEffect(() => {
    const onHash = () => { const h = readHash(); if (h) { setPlayerId(h.id); setSeason(h.season); } };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Which shots are on the court right now.
  const idx = useMemo(() => {
    if (!shots) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < shots.n; i++) {
      if (game >= 0 && shots.g[i] !== game) continue;
      if (kind === "3" && !isThree(shots.z[i])) continue;
      if (kind === "2" && isThree(shots.z[i])) continue;
      if (shots.y[i] > 470) continue; // heaves from beyond half court don't fit on a half-court chart
      out.push(i);
    }
    return out;
  }, [shots, game, kind]);

  const sum = useMemo(() => (shots && meta ? summarize(shots, idx, meta.zones.length) : null), [shots, idx, meta]);
  const team = shots ? shots.teams[shots.teams.length - 1] : player?.s[season]?.[0]?.slice(-1)[0];
  const color = teamColor(team);
  const focus = game >= 0;

  // Replay clock. A single game plays shot by shot; a whole season sweeps through in about twelve seconds.
  useEffect(() => {
    const n = idx.length;
    if (!playing || !n) { replay.current = { shown: n, flying: -1, u: 0 }; setShownUI(n); return; }
    const per = focus ? 1.5 : Math.max(0.006, Math.min(0.12, 12 / n)), flight = focus ? 0.62 : 1;
    let p = 0, last = performance.now(), raf = 0, lastUI = -1;
    const tick = (now: number) => {
      p += Math.min(0.1, (now - last) / 1000) / per; last = now;
      if (p >= n) { setPlaying(false); return; }
      const k = Math.floor(p), u = (p - k) / flight;
      replay.current = { shown: u >= 1 ? k + 1 : k, flying: k, u };
      const ui = replay.current.shown;
      if (ui !== lastUI) { lastUI = ui; setShownUI(ui); }
      raf = requestAnimationFrame(tick);
    };
    replay.current = { shown: 0, flying: 0, u: 0 }; setShownUI(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, idx, focus]);

  useEffect(() => { setPlaying(false); }, [shots, kind]);
  useEffect(() => { setPlaying(game >= 0); }, [game]); // picking a game starts its replay

  const games = useMemo(() => {
    if (!shots) return [];
    const a = shots.games.map(() => ({ a: 0, m: 0 }));
    for (let i = 0; i < shots.n; i++) { a[shots.g[i]].a++; a[shots.g[i]].m += shots.m[i]; }
    return shots.games.map((g, i) => ({ i, date: g[1], label: `${niceDate(g[1])}  ${g[3]} at ${g[2]}  (${a[i].m}/${a[i].a})` }));
  }, [shots]);

  const liveIdx = playing && shots ? idx[Math.min(idx.length - 1, replay.current.flying >= 0 ? replay.current.flying : 0)] : -1;
  const lastIdx = !playing && focus && shots && idx.length ? idx[idx.length - 1] : -1;
  const tickerIdx = liveIdx >= 0 ? liveIdx : lastIdx;
  const madeSoFar = useMemo(() => { if (!shots) return 0; let m = 0; for (let k = 0; k < shownUI && k < idx.length; k++) m += shots.m[idx[k]]; return m; }, [shots, idx, shownUI]);

  const pick = useCallback((id: number) => { setPlayerId(id); }, []);

  if (error) return <div className="fatal"><h1>Couldn't load the shot data</h1><p>{error}</p><p>Check your connection and reload the page.</p></div>;

  return (
    <div className="app" style={{ ["--team" as any]: color }}>
      <div className="stage">
        <Scene shots={shots} idx={idx} moves={meta?.moves ?? []} color={color} focus={focus} replay={replay} cam={cam} camNonce={camNonce} lite={lite} />
      </div>

      <header className="top">
        <div className="brand"><b>Shot Chart</b> Studio</div>
        <Search players={players} onPick={pick} />
        <label className="field">
          <span>Season</span>
          <select id="season" value={season} onChange={(e) => setSeason(e.target.value)} disabled={!seasons.length}>
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field grow">
          <span>Game</span>
          <select id="game" value={game} onChange={(e) => setGame(+e.target.value)} disabled={!shots}>
            <option value={-1}>Whole season</option>
            {games.map((g) => <option key={g.i} value={g.i}>{g.label}</option>)}
          </select>
        </label>
      </header>

      {player && sum && shots && (
        <section className="l3" key={`${player.id}-${season}`} aria-label="Player summary">
          <div className="l3-name">
            <div className="l3-team">{TEAM_NAME[team ?? ""] ?? team} <i>/</i> {season}{focus ? <> <i>/</i> {niceDate(shots.games[game][1])}</> : null}</div>
            <h1>{player.name}</h1>
          </div>
          <dl className="l3-stats">
            <div><dt>{focus ? "FG" : "FGA"}</dt><dd>{focus ? `${sum.fgm}-${sum.fga}` : sum.fga.toLocaleString()}</dd></div>
            <div><dt>FG%</dt><dd>{pct(sum.fg)}</dd></div>
            <div><dt>3P%</dt><dd>{sum.fg3a ? pct(sum.fg3) : "-"}</dd></div>
            <div><dt>eFG%</dt><dd>{pct(sum.efg)}</dd></div>
            <div><dt>Avg dist</dt><dd>{sum.dist.toFixed(1)}<small> ft</small></dd></div>
          </dl>
        </section>
      )}
      {!shots && !error && <div className="loading" role="status">Loading shots…</div>}

      {sum && league && meta && (
        <aside className="rail" aria-label="Shooting by zone">
          <h2>By zone <span>vs league</span></h2>
          {ZONE_LABEL.map((label, z) => {
            const me = sum.zones[z], lg = league.zones[meta.zones[z]];
            const mine = me.a ? me.m / me.a : null, theirs = lg ? lg[1] / lg[0] : 0;
            const diff = mine === null ? 0 : mine - theirs, w = Math.min(50, Math.abs(diff) / 0.15 * 50);
            return (
              <div className="zone" key={label}>
                <div className="zone-top"><span>{label}</span><b>{mine === null ? "-" : pct(mine)}</b></div>
                <div className="zone-bar" title={mine === null ? "No shots" : `${diff >= 0 ? "+" : ""}${pct(diff)} points vs league average of ${pct(theirs)}%`}>
                  {mine !== null && <i className={diff >= 0 ? "up" : "down"} style={diff >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />}
                </div>
                <div className="zone-sub">{me.m}/{me.a} <em>{mine === null ? "" : `${diff >= 0 ? "+" : ""}${pct(diff)}`}</em></div>
              </div>
            );
          })}
          <div className="seg" role="group" aria-label="Shot type">
            {(["all", "2", "3"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "all" ? "All shots" : k === "2" ? "Twos" : "Threes"}</button>)}
          </div>
        </aside>
      )}

      <footer className="dock">
        <button type="button" className="play" onClick={() => setPlaying((p) => !p)} disabled={!idx.length}>{playing ? "Skip to end" : focus ? "Replay this game" : "Replay the season"}</button>
        <div className="ticker" aria-live="off">
          {shots && tickerIdx >= 0 && meta ? (
            <>
              <span className="tk-q">Q{shots.p[tickerIdx]} {clock(shots.t[tickerIdx])}</span>
              <span className="tk-a">{shots.d[tickerIdx]}' {meta.actions[shots.a[tickerIdx]]}</span>
              <span className={shots.m[tickerIdx] ? "tk-r made" : "tk-r miss"}>{shots.m[tickerIdx] ? "Made" : "Missed"}</span>
            </>
          ) : <span className="tk-hint">Drag to orbit, scroll to zoom. Pick a game to watch it shot by shot.</span>}
          {playing && <span className="tk-n">{madeSoFar}/{shownUI}<small> of {idx.length}</small></span>}
        </div>
        <div className="seg cams" role="group" aria-label="Camera">
          {(Object.keys(CAM_LABEL) as CamKey[]).map((k) => <button key={k} type="button" aria-pressed={cam === k} onClick={() => { setCam(k); setCamNonce((n) => n + 1); }}>{CAM_LABEL[k]}</button>)}
        </div>
        <div className="legend"><span className="lg made" />Made <span className="lg miss" />Missed</div>
      </footer>
    </div>
  );
}

function Search({ players, onPick }: { players: PlayerRec[]; onPick: (id: number) => void }) {
  const [q, setQ] = useState(""), [open, setOpen] = useState(false), [hi, setHi] = useState(0);
  const folded = useMemo(() => players.map((p) => fold(p.name)), [players]);
  const hits = useMemo(() => {
    const f = fold(q.trim()); if (!f) return players.slice(0, 8);
    const out: PlayerRec[] = [];
    for (let i = 0; i < players.length && out.length < 8; i++) if (folded[i].includes(f)) out.push(players[i]);
    return out;
  }, [q, players, folded]);
  const choose = (p: PlayerRec) => { onPick(p.id); setQ(""); setOpen(false); };
  return (
    <div className="search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <label className="field">
        <span>Player</span>
        <input id="player-search" type="search" autoComplete="off" placeholder="Search 1,000+ players" value={q} role="combobox" aria-expanded={open} aria-controls="player-results"
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(hits.length - 1, h + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === "Enter" && hits[hi]) { e.preventDefault(); choose(hits[hi]); (e.target as HTMLInputElement).blur(); }
            else if (e.key === "Escape") setOpen(false);
          }} />
      </label>
      {open && (
        <ul id="player-results" role="listbox">
          {hits.length ? hits.map((p, i) => {
            const ss = Object.keys(p.s).sort(), last = p.s[ss[ss.length - 1]];
            return (
              <li key={p.id} role="option" aria-selected={i === hi}>
                <button type="button" tabIndex={-1} className={i === hi ? "hi" : ""} onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                  <b>{p.name}</b><span>{last[0].join("/")} · {ss.length} {ss.length === 1 ? "season" : "seasons"}</span>
                </button>
              </li>
            );
          }) : <li className="none">No player matches "{q}"</li>}
        </ul>
      )}
    </div>
  );
}
