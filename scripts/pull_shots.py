#!/usr/bin/env python3
"""
Shot Chart Studio: pull every NBA shot for a set of seasons.

Run it in Terminal on your own computer (the NBA blocks cloud servers):

    pip3 install nba_api pandas
    python3 ~/Downloads/pull_shots.py

What you get, in ~/Downloads/shot-chart-data/ :
    shots_2025-26.csv             one row per shot, every team, one file per season
    league_averages_2025-26.csv   league FG% by court zone for that season
    video_test.txt                whether the NBA's per-shot video lookup still works

It makes one request per team per season (30 per season), waits between requests
so the NBA doesn't block you, and can be stopped and re-run: finished teams are skipped.
"""
import sys
import time
from pathlib import Path

try:
    import requests
    import pandas as pd
    from nba_api.stats.endpoints import shotchartdetail, videoevents
    from nba_api.stats.static import teams
except ImportError:
    sys.exit("Missing a library. Run this first:\n    pip3 install nba_api pandas")

# Change these if you want different seasons. The current season is partial.
SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27"]
SEASON_TYPE = "Regular Season"
PAUSE_SECONDS = 2.0
OUT = Path.home() / "Downloads" / "shot-chart-data"
CACHE = OUT / "_cache"

# Browser-style headers. The NBA's stats site ignores requests that don't look like a current browser,
# and the copy of nba_api that installs on older Python versions sends outdated ones.
HEADERS = {
    "Host": "stats.nba.com",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "Sec-Ch-Ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Fetch-Dest": "empty",
}

KEEP = ["GAME_ID", "GAME_EVENT_ID", "GAME_DATE", "PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_NAME",
        "PERIOD", "MINUTES_REMAINING", "SECONDS_REMAINING", "ACTION_TYPE", "SHOT_TYPE",
        "SHOT_ZONE_BASIC", "SHOT_ZONE_AREA", "SHOT_ZONE_RANGE", "SHOT_DISTANCE",
        "LOC_X", "LOC_Y", "SHOT_MADE_FLAG", "HTM", "VTM"]


def fetch_team(team_id, season, tries=4):
    """Return (shots, league_averages) for one team and season, retrying on timeouts."""
    for attempt in range(1, tries + 1):
        try:
            resp = shotchartdetail.ShotChartDetail(
                team_id=team_id, player_id=0, context_measure_simple="FGA",
                season_nullable=season, season_type_all_star=SEASON_TYPE, headers=HEADERS, timeout=60)
            frames = resp.get_data_frames()
            # nba_api returns the shots first and the league averages second
            return frames[0], frames[1]
        except Exception as err:  # timeouts and blocks both land here
            wait = PAUSE_SECONDS * 4 * attempt
            print(f"      attempt {attempt} failed ({type(err).__name__}); waiting {wait:.0f}s")
            time.sleep(wait)
    return None, None


def pull_season(season):
    season_file = OUT / f"shots_{season}.csv"
    if season_file.exists():
        print(f"{season}: already done, skipping")
        return season_file
    print(f"{season}:")
    parts, failed, league = [], [], None
    for t in sorted(teams.get_teams(), key=lambda t: t["abbreviation"]):
        cache_file = CACHE / f"{season}_{t['abbreviation']}.csv"
        if cache_file.exists():
            parts.append(pd.read_csv(cache_file, dtype={"GAME_ID": str}))
            continue
        shots, lg = fetch_team(t["id"], season)
        if shots is None:
            failed.append(t["abbreviation"])
            print(f"   {t['abbreviation']}: FAILED")
            continue
        shots = shots[[c for c in KEEP if c in shots.columns]]
        shots.to_csv(cache_file, index=False)
        parts.append(shots)
        if league is None and lg is not None and len(lg):
            league = lg
            league.to_csv(OUT / f"league_averages_{season}.csv", index=False)
        print(f"   {t['abbreviation']}: {len(shots):,} shots")
        time.sleep(PAUSE_SECONDS)
    if failed:
        print(f"   Not finished: {', '.join(failed)} failed. Run the script again to retry just those.")
        return None
    total = sum(len(p) for p in parts)
    if total == 0:
        print("   No shots found for this season (it may not have started). Skipping.")
        return None
    pd.concat(parts, ignore_index=True).to_csv(season_file, index=False)
    print(f"   saved {total:,} shots to {season_file.name}")
    return season_file


def test_video(season_file):
    """Check whether the NBA still serves a video for one made shot. Result goes to video_test.txt."""
    df = pd.read_csv(season_file, dtype={"GAME_ID": str})
    made = df[df["SHOT_MADE_FLAG"] == 1]
    row = made.iloc[len(made) // 2]
    game_id, event_id = str(row["GAME_ID"]).zfill(10), int(row["GAME_EVENT_ID"])
    lines = [f"Shot tested: {row['PLAYER_NAME']}, game {game_id}, event {event_id}",
             f"NBA page to try in a browser: https://www.nba.com/stats/events?GameID={game_id}&GameEventID={event_id}"]
    try:
        data = videoevents.VideoEvents(game_id=game_id, game_event_id=event_id, headers=HEADERS, timeout=60).get_dict()
        urls = data.get("resultSets", {}).get("Meta", {}).get("videoUrls", [])
        lines.append(f"Video lookup answered. Clips listed: {len(urls)}")
        if urls:
            lines.append("First clip entry: " + str({k: urls[0].get(k) for k in list(urls[0])[:6]}))
    except Exception as err:
        lines.append(f"Video lookup failed: {type(err).__name__}: {err}")
    (OUT / "video_test.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


def preflight():
    """One small request to see whether the NBA's stats site answers this computer at all."""
    print("Checking the connection to the NBA's stats site...")
    try:
        r = requests.get("https://stats.nba.com/stats/commonteamyears", params={"LeagueID": "00"}, headers=HEADERS, timeout=25)
        if r.status_code == 200:
            print("   Connected.\n")
            return True
        print(f"   The NBA answered with status {r.status_code} (it is refusing this connection).")
    except Exception as err:
        print(f"   No answer ({type(err).__name__}).")
    print("\nThe NBA's stats site isn't responding to this network. Things to try, one at a time, then run this again:\n"
          "   1. Turn off any VPN.\n"
          "   2. Switch networks: a phone hotspot usually works when campus or work wifi doesn't.\n"
          "   3. Wait 15 minutes. After several failed attempts the NBA can pause an address for a while.")
    return False


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    print(f"Saving to {OUT}\n")
    if not preflight():
        return
    done = [f for f in (pull_season(s) for s in SEASONS) if f]
    if done:
        print("\nTesting the video lookup on one shot...")
        test_video(done[-1])
    print(f"\nFinished. {len(done)} of {len(SEASONS)} seasons saved in {OUT}")


if __name__ == "__main__":
    main()
