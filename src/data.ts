// Loading and summarizing the files written by scripts/build_data.py.

export type PlayerRec = { id: number; name: string; s: Record<string, [string[], number, number, number, number]> };
export type Meta = { seasons: string[]; zones: string[]; actions: string[]; moves: string[]; teams: string[]; shots: number; players: number };
export type ShotFile = {
  id: number; name: string; season: string; teams: string[]; n: number;
  x: number[]; y: number[]; m: number[]; a: number[]; z: number[]; d: number[]; p: number[]; t: number[]; g: number[]; e: number[]; tm: number[];
  games: [string, string, string, string][];
};
export type League = { season: string; shots: number; fg: number; zones: Record<string, [number, number]>; hexR: number; hex: Record<string, [number, number]> };

const BASE = import.meta.env.BASE_URL + "data/";
const cache = new Map<string, Promise<any>>();

export function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(path, fetch(BASE + path).then((r) => { if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`); return r.json(); }));
  }
  return cache.get(path)!;
}

export const loadMeta = () => load<Meta>("meta.json");
export const loadPlayers = () => load<PlayerRec[]>("players.json");
export const loadShots = (season: string, id: number) => load<ShotFile>(`shots/${season}/${id}.json`);
export const loadLeague = (season: string) => load<League>(`league/${season}.json`);

/** Zone indexes 3, 4, 5 and 6 are the three-point zones (corners, above the break, backcourt). */
export const isThree = (zone: number) => zone >= 3;

export type Summary = { fga: number; fgm: number; fg3a: number; fg3m: number; fg: number; fg3: number; efg: number; dist: number; zones: { a: number; m: number }[] };

export function summarize(s: ShotFile, idx: number[], zoneCount: number): Summary {
  const zones = Array.from({ length: zoneCount }, () => ({ a: 0, m: 0 }));
  let fgm = 0, fg3a = 0, fg3m = 0, dist = 0;
  for (const i of idx) {
    fgm += s.m[i]; dist += s.d[i];
    zones[s.z[i]].a++; zones[s.z[i]].m += s.m[i];
    if (isThree(s.z[i])) { fg3a++; fg3m += s.m[i]; }
  }
  const fga = idx.length;
  return { fga, fgm, fg3a, fg3m, fg: fga ? fgm / fga : 0, fg3: fg3a ? fg3m / fg3a : 0, efg: fga ? (fgm + 0.5 * fg3m) / fga : 0, dist: fga ? dist / fga : 0, zones };
}

export const pct = (v: number, digits = 1) => (v * 100).toFixed(digits);

export function clock(secs: number) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export function niceDate(yyyymmdd: string) {
  const d = new Date(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Accent-insensitive lowercase, so "doncic" finds "Dončić". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
