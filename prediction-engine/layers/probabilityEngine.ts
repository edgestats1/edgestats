/**
 * Layer 4 — Probability engine (V2).
 * Win/draw/loss from calibrated lambdas + draw suppression when xG gap / dominance is high.
 */

import type { OutcomeProbabilities, TeamMatchProfile } from '../types.js';
import { round } from '../teamRatings.js';
import { computeOutcomeProbabilities, poissonProbability } from '../scorelineModel.js';
import type { CalibratedExpectedGoals } from './expectedGoalsCalibration.js';

export interface ProbabilityEngineInput {
  home: TeamMatchProfile;
  away: TeamMatchProfile;
  calibratedGoals: CalibratedExpectedGoals;
  homeShots: number | null;
  awayShots: number | null;
  homeSoT: number | null;
  awaySoT: number | null;
  knockoutMatch?: boolean;
}

export interface ProbabilityEngineOutput {
  probabilities: OutcomeProbabilities;
  rawPoissonProbabilities: OutcomeProbabilities;
  homeLambda: number;
  awayLambda: number;
  expectedGoalDifference: number;
  dominanceIndex: number;
  cleanSheetProbabilityHome: number;
  cleanSheetProbabilityAway: number;
  drawCalibrationApplied: boolean;
  knockoutMode: boolean;
  topWinProbabilities: Array<{ outcome: string; probability: number }>;
  mainReasons: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeDominanceIndex(
  homeXG: number,
  awayXG: number,
  homeWin: number,
  awayWin: number,
  homeShots: number | null,
  awayShots: number | null,
): number {
  const xgDiff = Math.abs(homeXG - awayXG);
  const shotDiff = Math.abs((homeShots ?? 0) - (awayShots ?? 0));
  const favWin = Math.max(homeWin, awayWin);
  return clamp(
    xgDiff * 0.32 + shotDiff * 0.035 + Math.max(0, favWin - 0.5) * 0.75,
    0,
    1,
  );
}

function cleanSheetProb(oppLambda: number): number {
  return round(poissonProbability(oppLambda, 0), 4) ?? Math.exp(-oppLambda);
}

function calibrateDrawProbability(
  raw: OutcomeProbabilities,
  xgDiff: number,
  dominanceIndex: number,
): { probabilities: OutcomeProbabilities; applied: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let draw = raw.draw;
  const absDiff = Math.abs(xgDiff);
  const before = draw;

  if (absDiff >= 1.5) {
    draw *= 0.42;
    reasons.push(`Draw suppressed: xG difference ${absDiff.toFixed(2)} ≥ 1.5`);
  } else if (absDiff >= 1.0) {
    draw *= 0.58;
    reasons.push(`Draw suppressed: xG difference ${absDiff.toFixed(2)} ≥ 1.0`);
  } else if (absDiff >= 0.6) {
    draw *= 0.72;
    reasons.push(`Draw reduced: xG difference ${absDiff.toFixed(2)} ≥ 0.6`);
  } else if (absDiff >= 0.35) {
    draw *= 0.88;
  }

  if (dominanceIndex >= 0.75) {
    draw *= 0.68;
    reasons.push('Draw suppressed: high dominance index');
  } else if (dominanceIndex >= 0.55) {
    draw *= 0.82;
    reasons.push('Draw reduced: moderate dominance');
  }

  draw = clamp(draw, 0.05, 0.30);
  const applied = Math.abs(draw - before) > 0.005;

  const remaining = 1 - draw;
  const winTotal = raw.homeWin + raw.awayWin || 1;
  const homeWin = remaining * (raw.homeWin / winTotal);
  const awayWin = remaining * (raw.awayWin / winTotal);

  return {
    probabilities: {
      homeWin: round(homeWin, 4) ?? homeWin,
      draw: round(draw, 4) ?? draw,
      awayWin: round(awayWin, 4) ?? awayWin,
    },
    applied,
    reasons,
  };
}

export function runProbabilityEngine(input: ProbabilityEngineInput): ProbabilityEngineOutput {
  const homeLambda = input.calibratedGoals.homeLambda ?? input.calibratedGoals.home ?? 1.2;
  const awayLambda = input.calibratedGoals.awayLambda ?? input.calibratedGoals.away ?? 1.0;
  const xgDiff = input.calibratedGoals.expectedGoalDifference
    ?? (homeLambda - awayLambda);

  const rawPoisson = computeOutcomeProbabilities(homeLambda, awayLambda);
  const dominanceIndex = computeDominanceIndex(
    homeLambda,
    awayLambda,
    rawPoisson.homeWin,
    rawPoisson.awayWin,
    input.homeShots,
    input.awayShots,
  );

  const { probabilities, applied, reasons } = calibrateDrawProbability(
    rawPoisson,
    xgDiff,
    dominanceIndex,
  );

  const mainReasons: string[] = [
    `Poisson λ ${round(homeLambda, 2)} vs ${round(awayLambda, 2)} from calibrated xG layer`,
    `Raw Poisson: ${round(rawPoisson.homeWin * 100, 1)}% / ${round(rawPoisson.draw * 100, 1)}% / ${round(rawPoisson.awayWin * 100, 1)}%`,
    ...reasons,
  ];

  if (input.knockoutMatch) {
    mainReasons.push('Knockout mode: 90-minute projection only (no ET/penalties)');
  }

  const csHome = cleanSheetProb(awayLambda);
  const csAway = cleanSheetProb(homeLambda);

  const topWinProbabilities = [
    { outcome: input.home.team, probability: probabilities.homeWin },
    { outcome: 'Draw', probability: probabilities.draw },
    { outcome: input.away.team, probability: probabilities.awayWin },
  ].sort((a, b) => b.probability - a.probability);

  return {
    probabilities,
    rawPoissonProbabilities: rawPoisson,
    homeLambda,
    awayLambda,
    expectedGoalDifference: xgDiff,
    dominanceIndex: round(dominanceIndex, 3) ?? dominanceIndex,
    cleanSheetProbabilityHome: csHome,
    cleanSheetProbabilityAway: csAway,
    drawCalibrationApplied: applied,
    knockoutMode: input.knockoutMatch ?? true,
    topWinProbabilities,
    mainReasons,
  };
}
