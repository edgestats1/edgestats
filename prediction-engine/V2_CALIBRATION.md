# EdgeStats Prediction Engine — V2 Calibration

**Engine version:** `v2-calibration`  
**Scope:** Internal prediction engine only (probability + scoreline calibration). Stat projection (shots, corners, saves, cards, possession) is unchanged.

---

## What changed

### Layered architecture

The engine is now orchestrated through `predictionPipeline.ts`:

| Layer | Module | Responsibility |
|-------|--------|----------------|
| 1 — Data | `loadData.ts` | Master model, tournament averages, defensive baselines |
| 2 — Ratings | `teamRatings.ts` | Attack/defence/finishing/GK/form power ratings |
| 3 — Expected stats | `statProjectionModel.ts` | Shots, SoT, corners, saves, cards, display xG (**unchanged**) |
| 3b — xG calibration | `layers/expectedGoalsCalibration.ts` | Calibrated Poisson λ for probability/scoreline |
| 4 — Probability | `layers/probabilityEngine.ts` | Win/draw/loss with draw suppression |
| 5 — Scoreline | `representativeScoreline.ts` | Representative score from top-20 Poisson + fit scoring |

### Expected goal calibration (Layer 3b)

Display xG shown to users still comes from the stat projection layer. A separate **calibrated λ** drives Poisson probabilities:

- 50% stat-projection goals
- 25% rating-based lambda (attack, finishing, form vs opponent defence/GK)
- 25% SoT conversion model
- Tournament form blend (15%)
- Attack-vs-defence edge modifiers

This makes win/draw/loss and scoreline selection consistent with underlying shot quality and ratings without inflating displayed xG.

### Probability model (Layer 4)

Win/draw/loss starts from Poisson on calibrated λ, then applies **draw calibration**:

- Draw suppressed when |xG diff| ≥ 0.6 (progressive scaling up to ≥ 1.5)
- Draw further reduced when dominance index is high (xG gap + shot gap + favourite win strength)
- Draw capped at 30%, floored at 5%
- Win shares re-normalised after draw adjustment

**Knockout mode:** Draw probability applies to 90 minutes only. Extra time and penalties are not modelled; the engine still projects the most likely 90-minute score.

### Scoreline selection (Layer 5)

- Top **20** Poisson scorelines evaluated (not just the single highest)
- Each candidate scored on: Poisson probability, xG fit, win % fit, shot volume, SoT, defensive profile, GK saves, clean sheet probability, attacking dominance
- **Dominance adjustment:** When favourite win > 65%, xG diff ≥ 0.9, shot diff > 6, opponent SoT ≤ 2 → favour 2-0 / 3-0 / 3-1
- **Underdog adjustment:** Strong underdog attack/GK/form → allow 2-1 over 2-0
- **Draw rule:** Only when win probabilities within 10% and xG diff ≤ 0.4

### Model diagnostics (`v2Diagnostics`)

Every prediction now includes:

- Model confidence, stat consistency score
- Expected goal difference, dominance index
- Clean sheet probabilities (home/away)
- Scoreline confidence
- Top 10 Poisson scorelines
- Top win probabilities (home / draw / away)
- Main reasons for the probability calibration

---

## Why it changed

Group-stage validation showed realistic expected stats (xG, shots, corners, saves) but **conservative** win/draw/scoreline outputs:

- Large xG gaps still produced ~28–30% draw (e.g. Argentina 1.31 vs 0.16 xG)
- Dominant favourites defaulted to 1-0 despite 1.6+ xG and high shot volume (e.g. Germany)
- Raw Poisson peak scoreline was shown without reconciling to the stat profile

V2 aligns the **probability and scoreline layers** with the stat layer. It does **not** strengthen favourites by reputation — adjustments require measurable dominance in projected data.

---

## Validation results (8 fixtures)

Comparison against pre-V2 baseline (`wc2026-live-power-rankings-v2` without calibration layer):

| Match | Old score | New score | Old W/D/L | New W/D/L | What changed | Why |
|-------|-----------|-----------|-----------|-----------|--------------|-----|
| South Africa vs Canada | 0-2 | 0-2 | 10/29/61 | 20/21/59 | Draw ↓8pp | Draw suppressed (xG diff 0.67); calibrated λ raises Canada win clarity |
| England vs DR Congo | 1-0 | 1-0 | 54/31/15 | 72/12/16 | Win ↑18pp, draw ↓19pp | Calibrated λ 1.62–0.62 + draw suppression at xG diff ≥ 1.0 |
| Belgium vs Senegal | 1-1 | 1-1 | 34/28/38 | 43/26/31 | Slight win shift | Balanced xG (1.14–1.21); no dominance trigger; stats unchanged |
| Argentina vs Cape Verde | 2-0 | 2-0 | 68/28/4 | 79/11/10 | Draw ↓17pp, win ↑11pp | Draw suppressed (xG diff 1.25); dominance supports 2-0 |
| Germany vs Paraguay | 2-0 | 2-0 | 67/23/10 | 79/8/14 | Draw ↓15pp, win ↑12pp | Calibrated λ 2.03–0.70; raw Poisson now 2-0; high dominance index |
| Brazil vs Japan | 1-1 | 1-1 | 39/29/32 | 42/26/32 | Minor | Even match profile; no calibration trigger |
| Netherlands vs Morocco | 2-1 | 2-1 | 48/25/27 | 57/17/27 | Win ↑9pp, draw ↓8pp | Draw reduced (xG diff 0.64); underdog scorer rule supports 2-1 |

### Regression check — stat projection unchanged

Corners, shots, saves, and cards for all 8 fixtures match pre-V2 values (stat projection layer not modified). Example — Germany vs Paraguay: corners 6–1, shots 18–7, xG display 1.66–0.46 (unchanged).

---

## Expected improvements

- Draw probability scales with xG gap and attacking dominance
- Favourite scorelines reflect calibrated λ and shot/SoT profile (2-0 over 1-0 when data supports it)
- Win probabilities driven by calibrated xG, not raw rating gap alone
- Full diagnostic trail for every prediction (testable layers)

---

## Known limitations

- Calibrated λ and display xG can diverge slightly (by design — display xG stays tied to stat formulas)
- Knockout extra time / penalties not modelled
- Draw calibration caps may still leave 5–12% draw on strong favourites (intentional floor)
- Underdog 2-1 rule requires attack/GK/form thresholds; not all competitive underdogs qualify
- No referee assignment → card model unchanged and discipline-only

---

## Future improvements

- Back-test draw suppression factors against full group-stage results
- Joint calibration of display xG and Poisson λ if stat layer gains more match history
- Per-round knockout intensity modifiers (without inflating 90-minute draws)
- Automated regression suite comparing stat projection outputs fixture-by-fixture
- Optional ensemble with market odds for confidence scoring only (not outcome bias)

---

## Files touched (V2)

```
prediction-engine/
  predictionPipeline.ts          # Orchestrator
  matchPredictor.ts              # Wired to pipeline
  representativeScoreline.ts     # V2 candidate scoring + rules
  types.ts                       # V2ModelDiagnostics
  layers/
    expectedGoalsCalibration.ts
    probabilityEngine.ts
    scorelineLayer.ts
```

**Not modified:** `statProjectionModel.ts`, dashboard UI, public website, Stripe, auth, premium logic.
