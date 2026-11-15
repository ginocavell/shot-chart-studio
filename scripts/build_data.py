#!/usr/bin/env python3
"""
Turn the raw season CSVs from pull_shots.py into the small files the site loads.

    python3 scripts/build_data.py <folder with shots_*.csv> [output folder]

Writes, under public/data/ by default:
    meta.json                     seasons, shot-type names, zone names, teams
    players.json                  every player with per-season team and totals (drives search)
    league/<season>.json          league FG% by zone and by court hexagon (the baseline for colors)
    shots/<season>/<playerId>.json   one player's shots for one season, in game order
"""
import json
import math
import sys
from pathlib import Path

import pandas as pd
from nba_api.stats.static import teams as static_teams

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads" / "shot-chart-data"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "public" / "data"

ZONES = ["Restricted Area", "In The Paint (Non-RA)", "Mid-Range", "Left Corner 3", "Right Corner 3", "Above the Break 3", "Backcourt"]
HEX_R = 16  # hexagon size in the feed's units (tenths of a foot); must match the site
ABBR = {t["id"]: t["abbreviation"] for t in static_teams.get_teams()}


def move_kind(action):
    """Which body animation fits this shot type."""
    a = action.lower()
    if "dunk" in a:
        return "dunk"
    if "layup" in a or "finger roll" in a:
        return "layup"
    if "hook" in a:
        return "hook"
    if "float" in a:
        return "floater"
    if "fadeaway" in a or "turnaround" in a:
        return "fadeaway"
    if "step back" in a:
        return "stepback"
    if "pull" in a or "running" in a:
        return "pullup"
    return "jumper"


def hex_key(x, y):
    q = (math.sqrt(3) / 3 * x - y / 3) / HEX_R
    r = (2 / 3 * y) / HEX_R
    rx, rz, ry = round(q), round(r), round(-q - r)
    dx, dy, dz = abs(rx - q), abs(ry - (-q - r)), abs(rz - r)
    if dx > dy and dx > dz:
        rx = -ry - rz
    elif dy <= dz:
        rz = -rx - ry
    return f"{rx},{rz}"


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))


def main():
    files = sorted(SRC.glob("shots_*.csv"))
    if not files:
        sys.exit(f"No shots_*.csv files in {SRC}")
    frames = {f.stem.replace("shots_", ""): pd.read_csv(f, dtype={"GAME_ID": str}) for f in files}
    actions = sorted(set().union(*[set(d.ACTION_TYPE.unique()) for d in frames.values()]))
    a_idx = {a: i for i, a in enumerate(actions)}
    z_idx = {z: i for i, z in enumerate(ZONES)}
    players, total = {}, 0

    for season, d in frames.items():
        d = d.copy()
        d["GAME_ID"] = d["GAME_ID"].str.zfill(10)
        d["secs"] = d.MINUTES_REMAINING * 60 + d.SECONDS_REMAINING
        d = d.sort_values(["GAME_DATE", "GAME_ID", "PERIOD", "secs", "GAME_EVENT_ID"], ascending=[True, True, True, False, True])
        d["abbr"] = d.TEAM_ID.map(ABBR)
        d["is3"] = d.SHOT_TYPE.str.startswith("3PT")

        # league baseline: by zone and by hexagon
        zl = d.groupby("SHOT_ZONE_BASIC").SHOT_MADE_FLAG.agg(["count", "sum"])
        hexes = {}
        for x, y, m in zip(d.LOC_X.values, d.LOC_Y.values, d.SHOT_MADE_FLAG.values):
            if y > 470:
                continue  # beyond half court
            k = hex_key(x, y)
            h = hexes.setdefault(k, [0, 0])
            h[0] += 1
            h[1] += int(m)
        dump(OUT / "league" / f"{season}.json", {
            "season": season, "shots": int(len(d)), "fg": round(float(d.SHOT_MADE_FLAG.mean()), 4),
            "zones": {z: [int(zl.loc[z, "count"]), int(zl.loc[z, "sum"])] for z in ZONES if z in zl.index},
            "hexR": HEX_R, "hex": {k: v for k, v in hexes.items() if v[0] >= 20},
        })

        for pid, p in d.groupby("PLAYER_ID", sort=False):
            games = p[["GAME_ID", "GAME_DATE", "HTM", "VTM"]].drop_duplicates("GAME_ID")
            g_idx = {g: i for i, g in enumerate(games.GAME_ID)}
            tms = list(dict.fromkeys(p.abbr))
            dump(OUT / "shots" / season / f"{pid}.json", {
                "id": int(pid), "name": p.PLAYER_NAME.iloc[0], "season": season, "teams": tms, "n": int(len(p)),
                "x": p.LOC_X.astype(int).tolist(), "y": p.LOC_Y.astype(int).tolist(), "m": p.SHOT_MADE_FLAG.astype(int).tolist(),
                "a": [a_idx[a] for a in p.ACTION_TYPE], "z": [z_idx[z] for z in p.SHOT_ZONE_BASIC],
                "d": p.SHOT_DISTANCE.astype(int).tolist(), "p": p.PERIOD.astype(int).tolist(), "t": p.secs.astype(int).tolist(),
                "g": [g_idx[g] for g in p.GAME_ID], "e": p.GAME_EVENT_ID.astype(int).tolist(),
                "tm": [tms.index(t) for t in p.abbr],
                "games": [[r.GAME_ID, str(r.GAME_DATE), r.HTM, r.VTM] for r in games.itertuples()],
            })
            rec = players.setdefault(int(pid), {"id": int(pid), "name": p.PLAYER_NAME.iloc[0], "s": {}})
            rec["name"] = p.PLAYER_NAME.iloc[0]  # latest spelling wins
            rec["s"][season] = [tms, int(len(p)), int(p.SHOT_MADE_FLAG.sum()), int(p.is3.sum()), int((p.is3 & (p.SHOT_MADE_FLAG == 1)).sum())]
            total += len(p)
        print(f"{season}: {len(d):,} shots, {d.PLAYER_ID.nunique()} players")

    plist = sorted(players.values(), key=lambda r: -sum(v[1] for v in r["s"].values()))
    dump(OUT / "players.json", plist)
    dump(OUT / "meta.json", {
        "seasons": list(frames.keys()), "zones": ZONES, "actions": actions, "moves": [move_kind(a) for a in actions],
        "teams": sorted(set(ABBR.values())), "shots": int(total), "players": len(plist),
    })
    print(f"wrote {total:,} shots for {len(plist)} players to {OUT}")


if __name__ == "__main__":
    main()
