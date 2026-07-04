# World Cup 2026 Live Tournament Stats

This folder contains **World Cup 2026 tournament-only** statistics exported from real completed matches via API-Football.

## Files

| File | Contents |
|------|----------|
| `worldcup-live-match-results.json` | Completed match results, referee data, and card market signals |
| `worldcup-live-team-stats.json` | Per-match team stats + aggregated tournament totals per team |
| `worldcup-live-player-stats.json` | Per-match player stats + aggregated tournament totals per player |
| `worldcup-live-referee-stats.json` | Aggregated referee tournament totals |
| `worldcup-live-power-rankings.json` | Overall power rankings for all 48 nations |
| `worldcup-live-team-strength.json` | Detailed attack/defence/form strength profiles per nation |
| `worldcup-live-summary.json` | Export metadata, run counts, and referee summary |
| `export-lib.js` | Live stats export logic used by the manual update script |
| `power-rankings-lib.js` | Power ranking calculations (club + live blend) |

## How it updates

These files are **not** updated automatically. Run manually when you want fresh tournament data:

```bash
npm run update-worldcup-live-stats
```

Requires `API_FOOTBALL_KEY` in `.env.local` at the project root.

## Data rules

- **Completed matches only** — fixtures with status `FT`, `AET`, `PEN`, `AWD`, or `WO`
- **No upcoming or live matches** — unplayed games are excluded entirely
- **No placeholder or demo data** — if the API has no value, the export uses `null`
- **Separate from club-season data** — this does not modify `data/homepage-rankings.json`, `video-data/wc2026-full-player-data.json`, or any website datasets

## Referee stats

- Referee stats are **tournament-only** and come from completed World Cup 2026 matches.
- Referee name is read from the API fixture record; nationality is parsed only when the API includes it (otherwise `null`).
- Card timing (`firstYellowMinute`, `firstRedMinute`) comes from `/fixtures/events` when available.
- **Referee style** is calculated from completed match card and foul totals only:
  - `low-card` — total yellow cards ≤ 2, or fouls per yellow card ≥ 8
  - `balanced` — total yellow cards between 3 and 5
  - `strict` — total yellow cards ≥ 6, or fouls per yellow card ≤ 4
  - `null` — not enough data to classify
- **No referee predictions from fake data** — missing referee or card data stays `null`.
- Card market signals apply referee style adjustments to a player-foul baseline for future card prediction work.

## Power rankings

- **All 48 nations ranked** on every update — including teams yet to play a World Cup match.
- Uses only EdgeStats data:
  - Club-season player dataset (`video-data/wc2026-full-player-data.json`)
  - Live team, player, and referee exports from completed World Cup matches
- Dimensions scored 0–100: attack, defence, corners, cards, saves, chance creation, current form, overall power.
- Teams without completed World Cup matches use club baseline only (`currentForm: null`).
- **No FIFA rankings or bookmaker odds** are used.

## Intended use

These exports are designed to be combined later with the existing club-season player dataset to improve Round 2 predictions — including card market modelling with referee context. They are **not connected to the website** yet.
