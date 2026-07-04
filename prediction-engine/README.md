# EdgeStats Prediction Engine

Local, reusable sports prediction engine for EdgeStats. **World Cup 2026** is the first supported sport module.

This engine reads real exported model data only — it does **not** invent stats. Missing inputs surface as `null` with explicit limitations in the output.

## Data source

Primary file:

`data/worldcup-live/EdgeStats_AI_Master_Model.json`

Inputs used per team:

- EdgeStats power rankings (attack, defence, finishing, chance creation, form, corners, discipline, GK)
- World Cup group-stage team totals (goals, xG, corners, cards, shots on target)
- Club-season player data (for threat depth when WC player stats exist)
- Goalkeeper rankings
- Corner and card trend projections
- Model weighting metadata (`EdgeStats_Model_Metadata.json` embedded in master export)

## Commands

```bash
npm run predict-match -- "France" "Sweden"
npm run predict-knockout-round
```

## Output

Each match prediction includes:

- Win / draw / loss probabilities (Poisson outcome matrix)
- Most likely scoreline
- Confidence `/10` (engine heuristic — no legacy confidence model existed in the main codebase)
- Expected goals, corners, cards, goalkeeper saves
- Key player threats
- Short written breakdown
- Limitations array

Probabilities are from the **first team’s perspective** in `predict-match` (team A win / draw / team B win).

## Knockout round note

Official knockout bracket pairings are **not stored** in the master model export. `predict-knockout-round` seeds the 32 qualified teams by `overallPowerScore` and pairs `#1 vs #32`, `#2 vs #31`, etc.

This is clearly labelled in output `limitations` and `pairingNote`.

## Architecture

| File | Role |
|------|------|
| `types.ts` | Shared interfaces (sport-agnostic core) |
| `loadData.ts` | Load + index master model JSON |
| `teamRatings.ts` | Build team profiles and rating indices |
| `scorelineModel.ts` | xG, Poisson scoreline, corners/cards/saves |
| `confidenceModel.ts` | `/10` confidence from data completeness + rating gap |
| `matchPredictor.ts` | Orchestration + knockout seeding |
| `index.ts` | CLI + public exports |

## Future sports

The types and loader pattern are designed so new adapters can be added (NFL, NRL, EPL, Champions League) without changing the core probability/scoreline modules.

## Website

This engine is **local-only** for now. It does not modify the EdgeStats website, Stripe, auth, or premium flows.
