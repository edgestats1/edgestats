import type {
  LoadedMasterModel,
  MatchPredictionResult,
  PredictMatchOptions,
  ScorelineOutput,
  TeamMatchProfile,
} from './types.js';
import { requireTeam } from './loadData.js';
import {
  buildTeamMatchProfile,
  ratingGap,
  round,
} from './teamRatings.js';
import { determineWinner } from './scorelineModel.js';
import { computeConfidence } from './confidenceModel.js';
import { finalizeConsistencyScore } from './statProjectionModel.js';
import { runPredictionPipeline, ENGINE_VERSION } from './predictionPipeline.js';

function collectLimitations(home: TeamMatchProfile, away: TeamMatchProfile): string[] {
  const notes: string[] = [];

  if (!home.dataCompleteness.hasTournamentTotals) {
    notes.push(`${home.team}: tournament team totals missing from master model.`);
  }
  if (!away.dataCompleteness.hasTournamentTotals) {
    notes.push(`${away.team}: tournament team totals missing from master model.`);
  }
  if (!home.dataCompleteness.hasPowerRating || !away.dataCompleteness.hasPowerRating) {
    notes.push('One or both teams lack EdgeStats power ratings.');
  }
  if (home.dataCompleteness.worldCupMatchesPlayed != null && home.dataCompleteness.worldCupMatchesPlayed < 3) {
    notes.push(`${home.team}: fewer than 3 completed World Cup matches in export.`);
  }
  if (away.dataCompleteness.worldCupMatchesPlayed != null && away.dataCompleteness.worldCupMatchesPlayed < 3) {
    notes.push(`${away.team}: fewer than 3 completed World Cup matches in export.`);
  }

  notes.push('No assigned referee for this fixture; card projection uses team discipline trends only.');
  notes.push('Knockout extra-time/penalties are not modelled; output reflects 90-minute projection.');

  return notes;
}

function formatThreatLine(threats: TeamMatchProfile['keyThreats']): string {
  if (!threats.length) return 'none identified from available data';
  return threats
    .map((t) => {
      const wc = t.worldCupGoals != null || t.worldCupAssists != null
        ? `${t.worldCupGoals ?? 0} WC goals, ${t.worldCupAssists ?? 0} WC assists`
        : 'club form only';
      return `${t.name} (${wc})`;
    })
    .join('; ');
}

function buildBreakdown(
  home: TeamMatchProfile,
  away: TeamMatchProfile,
  expectedGoals: { home: number | null; away: number | null },
  scoreline: ScorelineOutput,
  rawPoissonLabel: string,
  probabilities: { homeWin: number; draw: number; awayWin: number },
  winner: string | 'Draw',
  v2Reasons: string[],
): string {
  const gap = ratingGap(home, away);
  const parts: string[] = [];

  parts.push(
    `${home.team} (${home.power.overallPowerScore ?? '—'} power) face ${away.team} (${away.power.overallPowerScore ?? '—'} power).`,
  );

  if (gap != null) {
    parts.push(
      gap > 0
        ? `${home.team} hold a ${round(Math.abs(gap), 1)}-point EdgeStats power edge.`
        : `${away.team} hold a ${round(Math.abs(gap), 1)}-point EdgeStats power edge.`,
    );
  }

  parts.push(
    `Expected goals: ${expectedGoals.home ?? '—'}–${expectedGoals.away ?? '—'} from stat projection; V2 probability layer uses calibrated λ for win/draw/loss.`,
  );

  parts.push(
    `Projected scoreline ${scoreline.selectedScoreline} (raw Poisson most likely: ${rawPoissonLabel}). ${scoreline.selectionReason}`,
  );

  if (v2Reasons.length) {
    parts.push(`V2 calibration: ${v2Reasons.slice(0, 3).join('; ')}.`);
  }

  parts.push(
    `Outcome split: ${round(probabilities.homeWin * 100, 1)}% ${home.team} win, ${round(probabilities.draw * 100, 1)}% draw, ${round(probabilities.awayWin * 100, 1)}% ${away.team} win.`,
  );

  parts.push(`Projected winner: ${winner}.`);
  parts.push(`Key threats — ${home.team}: ${formatThreatLine(home.keyThreats)}. ${away.team}: ${formatThreatLine(away.keyThreats)}.`);

  return parts.join(' ');
}

export function predictMatchFromProfiles(
  model: LoadedMasterModel,
  home: TeamMatchProfile,
  away: TeamMatchProfile,
  options: PredictMatchOptions = {},
): MatchPredictionResult {
  const pipeline = runPredictionPipeline({ model, home, away, options });
  const {
    statProjection,
    calibratedGoals,
    probabilityOutput,
    scoreline,
    scorelineDiagnostics,
    rawPoisson,
  } = pipeline;

  const expectedGoals = {
    home: calibratedGoals.displayHome ?? calibratedGoals.home,
    away: calibratedGoals.displayAway ?? calibratedGoals.away,
  };
  const probabilities = probabilityOutput.probabilities;

  const selectedScoreline = {
    home: scoreline.home,
    away: scoreline.away,
    label: scoreline.selectedScoreline,
    probability: rawPoisson.probability,
  };

  const winner = determineWinner(home.team, away.team, selectedScoreline, probabilities);
  const statConsistencyScore = finalizeConsistencyScore(
    statProjection,
    home,
    away,
    { home: scoreline.home, away: scoreline.away },
  );

  const confidenceResult = computeConfidence({
    home,
    away,
    model,
    probabilities,
    pairingNote: options.pairingNote,
  });

  const v2Diagnostics = {
    ...pipeline.v2Diagnostics,
    modelConfidence: confidenceResult.score,
    statConsistencyScore,
    scorelineConfidence: scorelineDiagnostics.scorelineConfidence,
  };

  const limitations = [
    ...collectLimitations(home, away),
    ...confidenceResult.limitations,
  ];

  const isHomePerspective = options.designateHome !== false;
  const winProbability = isHomePerspective ? probabilities.homeWin : probabilities.awayWin;
  const drawProbability = probabilities.draw;
  const lossProbability = isHomePerspective ? probabilities.awayWin : probabilities.homeWin;

  return {
    match: `${home.team} vs ${away.team}`,
    homeTeam: home.team,
    awayTeam: away.team,
    sport: model.sport,
    modelVersion: `${model.modelVersion ?? 'unknown'}+${ENGINE_VERSION}`,
    exportedAt: model.exportedAt,
    prediction: {
      winner,
      score: scoreline.selectedScoreline,
      winProbability: round(winProbability, 2) ?? winProbability,
      drawProbability: round(drawProbability, 2) ?? drawProbability,
      lossProbability: round(lossProbability, 2) ?? lossProbability,
      confidence: confidenceResult.score,
    },
    scoreline,
    scorelineDiagnostics,
    v2Diagnostics,
    expectedStats: statProjection.expectedStats,
    modelDiagnostics: statProjection.modelDiagnostics,
    statConsistencyScore,
    keyPlayerThreats: {
      home: home.keyThreats,
      away: away.keyThreats,
    },
    breakdown: buildBreakdown(
      home,
      away,
      expectedGoals,
      scoreline,
      rawPoisson.label,
      probabilities,
      winner,
      v2Diagnostics.mainReasons,
    ),
    limitations,
    pairingNote: options.pairingNote ?? null,
  };
}

export function predictMatch(
  model: LoadedMasterModel,
  teamA: string,
  teamB: string,
  options: PredictMatchOptions = {},
): MatchPredictionResult {
  const homeTeam = requireTeam(model, teamA);
  const awayTeam = requireTeam(model, teamB);

  const homeProfile = buildTeamMatchProfile(model, homeTeam);
  const awayProfile = buildTeamMatchProfile(model, awayTeam);

  return predictMatchFromProfiles(model, homeProfile, awayProfile, {
    ...options,
    designateHome: options.designateHome ?? true,
  });
}

export function buildKnockoutPairings(model: LoadedMasterModel): Array<{ home: string; away: string; seedHome: number; seedAway: number }> {
  const qualified = model.qualifiedTeams
    .map((name) => {
      const team = model.teamsByName.get(name);
      return {
        team: name,
        power: team?.powerRanking?.overallPowerScore ?? null,
        rank: team?.powerRanking?.rank ?? null,
      };
    })
    .filter((row) => row.team);

  qualified.sort((a, b) => {
    if ((b.power ?? -1) !== (a.power ?? -1)) return (b.power ?? -1) - (a.power ?? -1);
    return (a.rank ?? 999) - (b.rank ?? 999);
  });

  const pairings: Array<{ home: string; away: string; seedHome: number; seedAway: number }> = [];
  const n = qualified.length;
  for (let i = 0; i < Math.floor(n / 2); i += 1) {
    const top = qualified[i];
    const bottom = qualified[n - 1 - i];
    if (!top || !bottom) continue;
    pairings.push({
      home: top.team,
      away: bottom.team,
      seedHome: i + 1,
      seedAway: n - i,
    });
  }

  return pairings;
}

export function predictKnockoutRound(model: LoadedMasterModel): import('./types.js').KnockoutRoundResult {
  const pairings = buildKnockoutPairings(model);
  const pairingNote = model.knockoutBracketNote
    ?? 'Knockout bracket pairings are not stored in the master model; seeds are derived from qualified teams ranked by EdgeStats power score (1 vs 32, 2 vs 31, …).';

  const matches = pairings.map(({ home, away, seedHome, seedAway }) => {
    const homeProfile = buildTeamMatchProfile(model, model.teamsByName.get(home)!);
    const awayProfile = buildTeamMatchProfile(model, model.teamsByName.get(away)!);
    return predictMatchFromProfiles(model, homeProfile, awayProfile, {
      pairingNote: `${pairingNote} This match uses synthetic seeding #${seedHome} vs #${seedAway}.`,
    });
  });

  return {
    sport: model.sport,
    modelVersion: model.modelVersion,
    exportedAt: model.exportedAt,
    round: 'Round of 32 (synthetic seeding)',
    pairingMethod: 'Qualified teams sorted by overallPowerScore; highest vs lowest pairing.',
    limitations: [
      pairingNote,
      'Official FIFA knockout bracket/fixture list is not in EdgeStats_AI_Master_Model.json.',
      '14 upcoming API fixtures were excluded from live exports (completed matches only policy).',
    ],
    matches,
  };
}
