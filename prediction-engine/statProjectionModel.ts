/**
 * Match stat projections using (team FOR + opponent AGAINST) / 2 base formulas.
 */

import type {
  ExpectedGoals,
  ExpectedMatchStats,
  LoadedMasterModel,
  ModelDiagnostics,
  StatDiagnosticEntry,
  TeamMatchProfile,
} from './types.js';
import { round } from './teamRatings.js';
import { projectCards } from './scorelineModel.js';

export interface ProjectedTeamStats {
  shots: number | null;
  shotsOnTarget: number | null;
  goals: number | null;
  corners: number | null;
  saves: number | null;
}

export interface MatchStatProjection {
  home: ProjectedTeamStats;
  away: ProjectedTeamStats;
  expectedGoals: ExpectedGoals;
  expectedStats: ExpectedMatchStats;
  modelDiagnostics: ModelDiagnostics;
  statConsistencyScore: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundInt(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function ratingDelta(a: number | null, b: number | null): number {
  return ((a ?? 50) - (b ?? 50)) / 50;
}

function avgCornersFor(profile: TeamMatchProfile): number | null {
  return profile.cornerTrends.averageCornersFor ?? profile.tournamentAverages.cornersFor;
}

function avgCornersAgainst(profile: TeamMatchProfile): number | null {
  return profile.cornerTrends.averageCornersAgainst ?? profile.tournamentAverages.cornersAgainst;
}

function avgShotsFor(profile: TeamMatchProfile): number | null {
  return profile.tournamentAverages.shots;
}

function avgShotsAgainst(profile: TeamMatchProfile): number | null {
  return profile.tournamentAverages.shotsAgainst;
}

function baseAverage(
  teamValue: number | null,
  opponentAgainst: number | null,
  statLabel: 'corners' | 'shots' | 'goals',
): { base: number | null; formula: string } {
  const formulas = {
    corners: '(team.avgCornersFor + opponent.avgCornersAgainst) / 2',
    shots: '(team.avgShotsFor + opponent.avgShotsAgainst) / 2',
    goals: '(team.avgGoalsFor + opponent.avgGoalsAgainst) / 2',
  };

  if (teamValue != null && opponentAgainst != null) {
    return {
      base: (teamValue + opponentAgainst) / 2,
      formula: formulas[statLabel],
    };
  }
  if (teamValue != null) {
    return { base: teamValue, formula: `${statLabel} team-for only (opponent against unavailable)` };
  }
  if (opponentAgainst != null) {
    return { base: opponentAgainst, formula: `${statLabel} opponent-against only (team for unavailable)` };
  }
  return { base: null, formula: 'unavailable' };
}

function shotAccuracy(profile: TeamMatchProfile, model: LoadedMasterModel): number | null {
  const shots = profile.tournamentAverages.shots;
  const sot = profile.tournamentAverages.shotsOnTarget;
  if (shots != null && shots > 0 && sot != null) {
    return sot / shots;
  }
  if (model.tournamentAverageShots != null
    && model.tournamentAverageShots > 0
    && model.tournamentAverageShotsOnTarget != null) {
    return model.tournamentAverageShotsOnTarget / model.tournamentAverageShots;
  }
  return null;
}

function projectCornersForTeam(
  team: TeamMatchProfile,
  opponent: TeamMatchProfile,
  expectedShots: number | null,
  sanityChecks: string[],
): StatDiagnosticEntry {
  const teamBase = avgCornersFor(team);
  const opponentAgainst = avgCornersAgainst(opponent);
  const { base, formula } = baseAverage(teamBase, opponentAgainst, 'corners');

  if (base == null) {
    return {
      teamBase,
      opponentAgainst,
      baseFormula: formula,
      modifiers: [],
      final: null,
    };
  }

  const modifiers: string[] = [];
  let adjusted = base;

  const attackPressure = clamp(ratingDelta(team.power.attackRating, opponent.power.defenceRating) * 0.5, -1, 1);
  adjusted += attackPressure;
  modifiers.push(`attack pressure ${attackPressure >= 0 ? '+' : ''}${attackPressure.toFixed(2)}`);

  const possession = team.tournamentAverages.possessionAverage;
  const oppPossession = opponent.tournamentAverages.possessionAverage;
  const territory = possession != null && oppPossession != null
    ? clamp(((possession - oppPossession) / 100) * 1.5, -0.5, 0.5)
    : clamp(ratingDelta(team.power.chanceCreationRating, opponent.power.chanceCreationRating) * 0.2, -0.5, 0.5);
  adjusted += territory;
  modifiers.push(`possession/territory ${territory >= 0 ? '+' : ''}${territory.toFixed(2)}`);

  const knockoutCaution = -0.25;
  adjusted += knockoutCaution;
  modifiers.push(`knockout caution ${knockoutCaution.toFixed(2)}`);

  const oppDefHigh = (opponent.power.defenceRating ?? 50) >= 58;
  const oppAttLow = (opponent.power.attackRating ?? 50) <= 48;
  const lowBlock = oppDefHigh && oppAttLow ? clamp(0.35 + ratingDelta(opponent.power.defenceRating, team.power.attackRating) * 0.2, 0, 0.75) : 0;
  if (lowBlock > 0) {
    adjusted += lowBlock;
    modifiers.push(`opponent low block +${lowBlock.toFixed(2)}`);
  }

  let final = roundInt(adjusted) ?? 0;

  const allow13Plus = (teamBase ?? 0) >= 8
    && (opponentAgainst ?? 0) >= 7
    && (expectedShots ?? 0) >= 18;

  if (final >= 13 && !allow13Plus) {
    sanityChecks.push(
      `${team.team} corners capped from ${final} to 12 — 13+ requires avgCornersFor>=8, oppCornersAgainst>=7, expectedShots>=18`,
    );
    final = 12;
  }

  if (final > 10 && final <= 12) {
    const strongEvidence = (teamBase ?? 0) >= 7 || (opponentAgainst ?? 0) >= 6;
    if (!strongEvidence) {
      sanityChecks.push(`${team.team} corners capped from ${final} to 10 — insufficient evidence for extreme range`);
      final = 10;
    }
  }

  if (final > 12 && allow13Plus) {
    sanityChecks.push(
      `${team.team} corners ${final} allowed — strong evidence: cornersFor=${teamBase}, oppCornersAgainst=${opponentAgainst}, expectedShots=${expectedShots}`,
    );
  }

  final = clamp(final, 0, allow13Plus ? 15 : 12);

  return {
    teamBase,
    opponentAgainst,
    baseFormula: formula,
    modifiers,
    final,
  };
}

function projectShotsForTeam(
  team: TeamMatchProfile,
  opponent: TeamMatchProfile,
): StatDiagnosticEntry {
  const teamBase = avgShotsFor(team);
  const opponentAgainst = avgShotsAgainst(opponent);
  const { base, formula } = baseAverage(teamBase, opponentAgainst, 'shots');

  if (base == null) {
    return {
      teamBase,
      opponentAgainst,
      baseFormula: formula,
      modifiers: [],
      final: null,
    };
  }

  const modifiers: string[] = [];
  let adjusted = base;

  const attackMod = clamp(ratingDelta(team.power.attackRating, opponent.power.attackRating) * 0.8, -1.2, 1.2);
  adjusted += attackMod;
  modifiers.push(`attack rating diff ${attackMod >= 0 ? '+' : ''}${attackMod.toFixed(2)}`);

  const defenceMod = clamp(ratingDelta(team.power.attackRating, opponent.power.defenceRating) * 0.5, -1, 1);
  adjusted += defenceMod * 0.4;
  modifiers.push(`defence matchup ${(defenceMod * 0.4) >= 0 ? '+' : ''}${(defenceMod * 0.4).toFixed(2)}`);

  const possession = team.tournamentAverages.possessionAverage;
  const oppPossession = opponent.tournamentAverages.possessionAverage;
  if (possession != null && oppPossession != null) {
    const possMod = clamp(((possession - oppPossession) / 100) * 2, -0.8, 0.8);
    adjusted += possMod;
    modifiers.push(`possession expectation ${possMod >= 0 ? '+' : ''}${possMod.toFixed(2)}`);
  }

  const formMod = clamp(ratingDelta(team.power.currentFormRating, opponent.power.currentFormRating) * 0.35, -0.6, 0.6);
  adjusted += formMod;
  modifiers.push(`form ${formMod >= 0 ? '+' : ''}${formMod.toFixed(2)}`);

  let final = roundInt(adjusted) ?? 0;
  if (final > 18) {
    modifiers.push(`soft cap applied at 18 (raw ${final})`);
    final = 18;
  }

  final = clamp(final, 0, 22);

  return {
    teamBase,
    opponentAgainst,
    baseFormula: formula,
    modifiers,
    final,
  };
}

function projectShotsOnTargetForTeam(
  team: TeamMatchProfile,
  expectedShots: number | null,
  accuracy: number | null,
  model: LoadedMasterModel,
): StatDiagnosticEntry {
  const teamBase = profileShotAccuracyBase(team, model);
  const usedAccuracy = accuracy ?? teamBase;

  if (expectedShots == null || usedAccuracy == null) {
    return {
      teamBase: team.tournamentAverages.shotsOnTarget,
      opponentAgainst: null,
      baseFormula: 'expectedShots * shotAccuracy',
      modifiers: ['insufficient data'],
      final: null,
    };
  }

  const final = roundInt(expectedShots * usedAccuracy);
  return {
    teamBase: team.tournamentAverages.shotsOnTarget,
    opponentAgainst: usedAccuracy,
    baseFormula: 'expectedShots * shotAccuracy',
    modifiers: [`accuracy ${(usedAccuracy * 100).toFixed(1)}%`],
    final,
  };
}

function profileShotAccuracyBase(profile: TeamMatchProfile, model: LoadedMasterModel): number | null {
  return shotAccuracy(profile, model);
}

function projectGoalsForTeam(
  team: TeamMatchProfile,
  opponent: TeamMatchProfile,
  expectedSoT: number | null,
  model: LoadedMasterModel,
): StatDiagnosticEntry {
  const leagueAvg = model.tournamentGoalsPerTeam ?? 1.49;
  const teamBase = team.tournamentAverages.goalsFor;
  const opponentAgainst = opponent.tournamentAverages.goalsAgainst;

  const modifiers: string[] = [];
  let adjusted: number | null = null;

  if (expectedSoT != null) {
    const finishing = (team.power.finishingRating ?? 50) / 100;
    const oppGk = (opponent.power.goalkeeperRating ?? 50) / 100;
    const oppDef = (opponent.power.defenceRating ?? 50) / 100;
    const conversion = clamp(0.1 + finishing * 0.08, 0.08, 0.22);
    const suppression = clamp(0.75 + (oppGk + oppDef) / 2 * 0.35, 0.7, 1.25);

    adjusted = expectedSoT * conversion / suppression;
    modifiers.push(`SoT ${expectedSoT} × conversion ${conversion.toFixed(3)} ÷ suppression ${suppression.toFixed(3)}`);
  }

  const avgBlend = baseAverage(teamBase, opponentAgainst, 'goals');
  if (avgBlend.base != null) {
    const blended = avgBlend.base * 0.35 + (adjusted ?? avgBlend.base) * 0.65;
    modifiers.push(`blended 35% tournament avg (${avgBlend.base.toFixed(2)}) + 65% SoT model`);
    adjusted = blended;
  } else if (adjusted == null) {
    adjusted = leagueAvg;
    modifiers.push(`fallback league average ${leagueAvg}`);
  }

  const tournamentMod = clamp((teamBase ?? leagueAvg) - leagueAvg, -0.4, 0.6);
  adjusted += tournamentMod * 0.25;
  modifiers.push(`tournament goals/match adj ${(tournamentMod * 0.25) >= 0 ? '+' : ''}${(tournamentMod * 0.25).toFixed(2)}`);

  let final = round(adjusted, 2);
  if (final != null) {
    final = clamp(final, 0.15, 3.8);
  }

  return {
    teamBase,
    opponentAgainst,
    baseFormula: avgBlend.formula,
    modifiers,
    final,
  };
}

function projectSavesForKeeper(
  keeperTeam: TeamMatchProfile,
  opponentSoT: number | null,
  opponentGoals: number | null,
): StatDiagnosticEntry {
  if (opponentSoT == null && opponentGoals == null) {
    return {
      teamBase: keeperTeam.primaryGoalkeeper?.savesPerMatch ?? null,
      opponentAgainst: null,
      baseFormula: 'opponentExpectedShotsOnTarget - opponentExpectedGoals',
      modifiers: [],
      final: null,
    };
  }

  const sot = opponentSoT ?? (opponentGoals != null ? opponentGoals * 2.5 : null);
  const goals = opponentGoals ?? 0;
  const raw = sot != null ? sot - goals : null;
  const final = raw != null ? clamp(roundInt(raw) ?? 0, 0, 15) : null;

  return {
    teamBase: keeperTeam.primaryGoalkeeper?.savesPerMatch ?? null,
    opponentAgainst: opponentSoT,
    baseFormula: 'opponentExpectedShotsOnTarget - opponentExpectedGoals',
    modifiers: [`SoT ${sot ?? '—'} − goals ${goals}`],
    final,
  };
}

function computeConsistencyScore(
  home: TeamMatchProfile,
  away: TeamMatchProfile,
  projection: {
    home: ProjectedTeamStats;
    away: ProjectedTeamStats;
    scorelineGoals: { home: number; away: number };
  },
  diagnostics: ModelDiagnostics,
): number {
  let score = 100;
  const penalties: string[] = [];

  for (const [teamName, entry] of Object.entries(diagnostics.corners)) {
    const corners = entry.final;
    const teamBase = entry.teamBase;
    const oppAgainst = entry.opponentAgainst;
    if (corners != null && corners > 10) {
      const strong = (teamBase ?? 0) >= 7 || (oppAgainst ?? 0) >= 6;
      if (!strong) {
        score -= 12;
        penalties.push(`${teamName} corners ${corners} > 10 without strong evidence`);
      } else if (corners > 12) {
        score -= 8;
        penalties.push(`${teamName} corners ${corners} in extreme range`);
      }
    }
  }

  for (const [teamName, entry] of Object.entries(diagnostics.shots)) {
    const shots = entry.final;
    const goalsEntry = diagnostics.goals[teamName];
    const sotEntry = diagnostics.shotsOnTarget[teamName];
    if (shots != null && shots > 18) {
      score -= 10;
      penalties.push(`${teamName} shots ${shots} > 18`);
    }
    if (shots != null && shots > 14 && (goalsEntry?.final ?? 0) < 1 && (sotEntry?.final ?? 0) < 4) {
      score -= 8;
      penalties.push(`${teamName} high shots but low goals/SoT mismatch`);
    }
  }

  for (const teamName of [home.team, away.team]) {
    const savesKey = `${teamName}GK`;
    const saves = diagnostics.saves[savesKey]?.final;
    const oppTeam = teamName === home.team ? away.team : home.team;
    const oppSot = diagnostics.shotsOnTarget[oppTeam]?.final;
    const oppGoals = diagnostics.goals[oppTeam]?.final;
    if (saves != null && oppSot != null && oppGoals != null) {
      const expectedSaves = oppSot - oppGoals;
      if (Math.abs(saves - expectedSaves) > 2) {
        score -= 10;
        penalties.push(`${savesKey} saves ${saves} vs expected ${expectedSaves.toFixed(1)} from opp SoT−goals`);
      }
    }
  }

  const xgHome = diagnostics.goals[home.team]?.final ?? 0;
  const xgAway = diagnostics.goals[away.team]?.final ?? 0;
  const scoreHome = projection.scorelineGoals.home;
  const scoreAway = projection.scorelineGoals.away;
  if (Math.abs(scoreHome - xgHome) > 1.2 || Math.abs(scoreAway - xgAway) > 1.2) {
    score -= 8;
    penalties.push(`scoreline ${scoreHome}-${scoreAway} diverges from expected goals ${xgHome}-${xgAway}`);
  }

  if (projection.home.corners != null && projection.home.shots != null && projection.home.goals != null) {
    const highVolume = (projection.home.corners > 10 && projection.home.shots > 16);
    const lowOutput = projection.home.goals < 1 && (projection.home.saves ?? 0) < 2;
    if (highVolume && lowOutput) {
      score -= 6;
      penalties.push(`${home.team} high corners/shots but low goals/saves without accuracy note`);
    }
  }

  diagnostics.sanityChecksApplied.push(...penalties);
  return clamp(Math.round(score), 0, 100);
}

export function projectMatchStats(
  model: LoadedMasterModel,
  home: TeamMatchProfile,
  away: TeamMatchProfile,
): MatchStatProjection {
  const sanityChecks: string[] = [];

  const homeShotsDiag = projectShotsForTeam(home, away);
  const awayShotsDiag = projectShotsForTeam(away, home);

  const homeAccuracy = shotAccuracy(home, model);
  const awayAccuracy = shotAccuracy(away, model);

  const homeSoTDiag = projectShotsOnTargetForTeam(home, homeShotsDiag.final, homeAccuracy, model);
  const awaySoTDiag = projectShotsOnTargetForTeam(away, awayShotsDiag.final, awayAccuracy, model);

  const homeGoalsDiag = projectGoalsForTeam(home, away, homeSoTDiag.final, model);
  const awayGoalsDiag = projectGoalsForTeam(away, home, awaySoTDiag.final, model);

  const homeCornersDiag = projectCornersForTeam(home, away, homeShotsDiag.final, sanityChecks);
  const awayCornersDiag = projectCornersForTeam(away, home, awayShotsDiag.final, sanityChecks);

  const homeSavesDiag = projectSavesForKeeper(home, awaySoTDiag.final, awayGoalsDiag.final);
  const awaySavesDiag = projectSavesForKeeper(away, homeSoTDiag.final, homeGoalsDiag.final);

  const expectedGoals: ExpectedGoals = {
    home: homeGoalsDiag.final,
    away: awayGoalsDiag.final,
    homeLambda: homeGoalsDiag.final,
    awayLambda: awayGoalsDiag.final,
    leagueAveragePerTeam: model.tournamentGoalsPerTeam,
    method: 'SoT-linked goals: conversion from finishing vs opponent GK/defence, blended with tournament averages',
  };

  const modelDiagnostics: ModelDiagnostics = {
    corners: {
      [home.team]: homeCornersDiag,
      [away.team]: awayCornersDiag,
    },
    shots: {
      [home.team]: homeShotsDiag,
      [away.team]: awayShotsDiag,
    },
    shotsOnTarget: {
      [home.team]: homeSoTDiag,
      [away.team]: awaySoTDiag,
    },
    goals: {
      [home.team]: homeGoalsDiag,
      [away.team]: awayGoalsDiag,
    },
    saves: {
      [`${home.team}GK`]: homeSavesDiag,
      [`${away.team}GK`]: awaySavesDiag,
    },
    sanityChecksApplied: [...sanityChecks],
  };

  const homeStats: ProjectedTeamStats = {
    shots: homeShotsDiag.final,
    shotsOnTarget: homeSoTDiag.final,
    goals: homeGoalsDiag.final,
    corners: homeCornersDiag.final,
    saves: homeSavesDiag.final,
  };

  const awayStats: ProjectedTeamStats = {
    shots: awayShotsDiag.final,
    shotsOnTarget: awaySoTDiag.final,
    goals: awayGoalsDiag.final,
    corners: awayCornersDiag.final,
    saves: awaySavesDiag.final,
  };

  const expectedStats: ExpectedMatchStats = {
    expectedGoals,
    shots: {
      [home.team]: { total: homeStats.shots, onTarget: homeStats.shotsOnTarget },
      [away.team]: { total: awayStats.shots, onTarget: awayStats.shotsOnTarget },
    },
    corners: {
      [home.team]: homeStats.corners,
      [away.team]: awayStats.corners,
    },
    cards: projectCards(model, home, away),
    saves: {
      [`${home.team}GK`]: homeStats.saves,
      [`${away.team}GK`]: awayStats.saves,
    },
  };

  return {
    home: homeStats,
    away: awayStats,
    expectedGoals,
    expectedStats,
    modelDiagnostics,
    statConsistencyScore: null,
  };
}

export function finalizeConsistencyScore(
  projection: MatchStatProjection,
  home: TeamMatchProfile,
  away: TeamMatchProfile,
  scorelineGoals: { home: number; away: number },
): number {
  const score = computeConsistencyScore(home, away, {
    home: projection.home,
    away: projection.away,
    scorelineGoals,
  }, projection.modelDiagnostics);
  projection.statConsistencyScore = score;
  return score;
}
