# EdgeStats Prediction Dashboard (Local Only)

Private local dashboard for World Cup knockout predictions.

## Run

```bash
npm run prediction-dashboard
```

Open **http://localhost:3333**

## Data

- Official fixtures: `data/worldcup-live/worldcup-knockout-fixtures.json` (from API-Football)
- Predictions: `/prediction-engine/` (no duplicated model logic)

## Update fixtures

```bash
npm run update-knockout-fixtures
npm run refresh-prediction-dashboard   # live stats + knockout fixtures
```

## Notes

- Dashboard prefers **official API-Football knockout fixtures** with kickoff times.
- Synthetic seeding is used **only** if the knockout JSON export file is missing.
- Not deployed to the public EdgeStats website.
