/**
 * Round 1 derived exports — goalkeeper rankings, corner/card trends, analysis.
 */

import { getOfficialTeamNames } from '../../api/_lib/wc2026-official-teams.js';
import { resolveOfficialTeamName } from './power-rankings-lib.js';

export const ROUND1_EXPORT_VERSION = 'wc2026-live-round1-v1';

function sum(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(Number(v)));
  if (!nums.length) return null;
  return nums.reduce((t, v) => t + Number(v), 0);
}

function avg(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(Number(v)));
  if (!nums.length) return null;
  return nums.reduce((t, v) => t + Number(v), 0) / nums.length;
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function normalizeScore(values, value) {
  if (value == null || !Number.isFinite(value)) return null;
  const nums = values.filter((v) => v != null && Number.isFinite(v));
  if (!nums.length) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max === min) return 50;
  return round(((value - min) / (max - min)) * 100, 1);
}

export function parseGoalEvents(eventsData, fixture) {
  const home = [];
  const away = [];

  for (const event of eventsData?.response || []) {
    if (event.type !== 'Goal') continue;

    const entry = {
      player: event.player?.name ?? null,
      minute: event.time?.elapsed != null
        ? Number(event.time.elapsed) + (Number(event.time.extra) || 0)
        : null,
      assist: event.assist?.name ?? null,
      detail: event.detail ?? null,
    };

    if (event.team?.id === fixture.homeTeamId) home.push(entry);
    else if (event.team?.id === fixture.awayTeamId) away.push(entry);
  }

  return { home, away };
}

export function enrichTeamTotals(teamMatchStats) {
  const byMatch = new Map();
  for (const row of teamMatchStats) {
    if (!byMatch.has(row.matchId)) byMatch.set(row.matchId, []);
    byMatch.get(row.matchId).push(row);
  }

  const enrichedRows = teamMatchStats.map((row) => {
    const peers = byMatch.get(row.matchId) || [];
    const opponent = peers.find((p) => p.team !== row.team);
    return {
      ...row,
      cornersAgainst: opponent?.corners ?? null,
      savesAgainst: opponent?.saves ?? null,
      xGAgainst: opponent?.xG ?? null,
      foulsDrawn: null,
      passAccuracy: row.passAccuracy ?? null,
      cleanSheet: row.goalsAgainst === 0,
    };
  });

  const byTeam = new Map();
  for (const row of enrichedRows) {
    if (!byTeam.has(row.team)) byTeam.set(row.team, []);
    byTeam.get(row.team).push(row);
  }

  return Array.from(byTeam.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([team, rows]) => {
      const matchesPlayed = rows.length;
      const wins = rows.filter((r) => r.result === 'win').length;
      const draws = rows.filter((r) => r.result === 'draw').length;
      const losses = rows.filter((r) => r.result === 'loss').length;
      const goalsFor = sum(rows.map((r) => r.goalsFor));
      const goalsAgainst = sum(rows.map((r) => r.goalsAgainst));
      const shots = sum(rows.map((r) => r.shots));
      const shotsOnTarget = sum(rows.map((r) => r.shotsOnTarget));
      const xGFor = sum(rows.map((r) => r.xG));
      const xGAgainst = sum(rows.map((r) => r.xGAgainst));
      const cornersFor = sum(rows.map((r) => r.corners));
      const cornersAgainst = sum(rows.map((r) => r.cornersAgainst));
      const foulsCommitted = sum(rows.map((r) => r.foulsCommitted));
      const yellowCards = sum(rows.map((r) => r.yellowCards));
      const redCards = sum(rows.map((r) => r.redCards));
      const savesFor = sum(rows.map((r) => r.saves));
      const savesAgainst = sum(rows.map((r) => r.savesAgainst));
      const cleanSheets = rows.filter((r) => r.cleanSheet).length;
      const possessionValues = rows.map((r) => r.possession).filter((v) => v != null);

      const shotAccuracy = shots != null && shots > 0 && shotsOnTarget != null
        ? round((shotsOnTarget / shots) * 100, 1)
        : null;

      const finishingEfficiency = xGFor != null && xGFor > 0 && goalsFor != null
        ? round(goalsFor / xGFor, 2)
        : null;

      const goalkeeperSaveRate = savesFor != null && shotsOnTarget != null && (savesFor + (goalsAgainst ?? 0)) > 0
        ? round(savesFor / (savesFor + (goalsAgainst ?? 0)), 2)
        : null;

      return {
        team,
        matchesPlayed,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalDifference: goalsFor != null && goalsAgainst != null ? goalsFor - goalsAgainst : null,
        shots,
        shotsOnTarget,
        shotAccuracy,
        xG: xGFor,
        xGFor,
        xGAgainst,
        finishingEfficiency,
        possessionAverage: possessionValues.length ? round(avg(possessionValues), 1) : null,
        cornersFor,
        cornersAgainst,
        foulsCommitted,
        foulsDrawn: null,
        yellowCards,
        redCards,
        savesFor,
        savesAgainst,
        goalkeeperSaveRate,
        cleanSheets,
        averages: {
          goalsFor: round(goalsFor != null ? goalsFor / matchesPlayed : null, 2),
          goalsAgainst: round(goalsAgainst != null ? goalsAgainst / matchesPlayed : null, 2),
          shots: round(shots != null ? shots / matchesPlayed : null, 2),
          shotsOnTarget: round(shotsOnTarget != null ? shotsOnTarget / matchesPlayed : null, 2),
          xG: round(xGFor != null ? xGFor / matchesPlayed : null, 2),
          cornersFor: round(cornersFor != null ? cornersFor / matchesPlayed : null, 2),
          cornersAgainst: round(cornersAgainst != null ? cornersAgainst / matchesPlayed : null, 2),
          yellowCards: round(yellowCards != null ? yellowCards / matchesPlayed : null, 2),
          savesFor: round(savesFor != null ? savesFor / matchesPlayed : null, 2),
        },
      };
    });
}

function buildSideStats(row) {
  if (!row) return null;
  return {
    goals: row.goalsFor,
    shots: row.shots,
    shotsOnTarget: row.shotsOnTarget,
    xG: row.xG,
    possession: row.possession,
    passes: row.passes,
    passAccuracy: row.passAccuracy,
    corners: row.corners,
    fouls: row.foulsCommitted,
    yellowCards: row.yellowCards,
    redCards: row.redCards,
    saves: row.saves,
  };
}

export function buildEnhancedMatchResult(fixture, teamRows, eventsData, referee, cardMarketSignal) {
  const homeRow = teamRows.find((r) => r.team === fixture.homeTeam);
  const awayRow = teamRows.find((r) => r.team === fixture.awayTeam);
  const scorers = parseGoalEvents(eventsData, fixture);

  return {
    matchId: fixture.matchId,
    date: fixture.date,
    group: fixture.group,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    statusShort: fixture.statusShort,
    venue: fixture.venue,
    city: fixture.city,
    result: {
      home: homeRow?.result ?? null,
      away: awayRow?.result ?? null,
    },
    goals: {
      home: fixture.homeScore,
      away: fixture.awayScore,
    },
    scorers,
    homeStats: buildSideStats(homeRow),
    awayStats: buildSideStats(awayRow),
    referee: {
      name: referee?.name ?? null,
      nationality: referee?.nationality ?? null,
      refereeStyle: referee?.refereeStyle ?? null,
      totalFouls: referee?.totalFouls ?? null,
      totalYellowCards: referee?.totalYellowCards ?? null,
      totalRedCards: referee?.totalRedCards ?? null,
      firstYellowMinute: referee?.firstYellowMinute ?? null,
      firstRedMinute: referee?.firstRedMinute ?? null,
      foulsPerYellowCard: referee?.foulsPerYellowCard ?? null,
    },
    cardMarketSignal,
  };
}

export function buildGoalkeeperRankings({ playerTotals, teamTotals, matchStats, powerByTeam }) {
  const gks = (playerTotals || [])
    .filter((p) => (p.position || '').toUpperCase() === 'G' || (p.position || '').toLowerCase().includes('goal'))
    .map((gk) => {
      const officialTeam = resolveOfficialTeamName(gk.team);
      const teamTotal = (teamTotals || []).find((t) => resolveOfficialTeamName(t.team) === officialTeam);
      const teamMatches = (matchStats || []).filter((r) => resolveOfficialTeamName(r.team) === officialTeam);
      const goalsConceded = teamTotal?.goalsAgainst ?? null;
      const saves = gk.saves ?? teamTotal?.savesFor ?? null;
      const matchesPlayed = gk.matchesPlayed ?? teamTotal?.matchesPlayed ?? 0;
      const sotAgainst = sum(teamMatches.map((r) => {
        const opp = matchStats.find((m) => m.matchId === r.matchId && m.team !== r.team);
        return opp?.shotsOnTarget;
      }));

      const savesPerMatch = saves != null && matchesPlayed > 0 ? round(saves / matchesPlayed, 2) : null;
      const saveRate = saves != null && sotAgainst != null && sotAgainst > 0
        ? round(saves / sotAgainst, 2)
        : (saves != null && goalsConceded != null && (saves + goalsConceded) > 0
          ? round(saves / (saves + goalsConceded), 2)
          : null);

      const cleanSheet = teamTotal?.cleanSheets > 0;
      const gkPower = powerByTeam?.get(officialTeam)?.goalkeeperRating ?? null;

      return {
        playerId: gk.playerId,
        playerName: gk.playerName,
        team: officialTeam || gk.team,
        matchesPlayed,
        minutes: gk.minutes,
        saves,
        savesPerMatch,
        shotsOnTargetFaced: sotAgainst,
        goalsConceded,
        cleanSheet,
        saveRate,
        projectedRound2SaveStrength: gkPower,
      };
    })
    .sort((a, b) => (b.saves ?? 0) - (a.saves ?? 0));

  const saveStrengths = gks.map((g) => g.projectedRound2SaveStrength).filter((v) => v != null);
  gks.forEach((gk) => {
    if (gk.projectedRound2SaveStrength == null && gk.saveRate != null) {
      gk.projectedRound2SaveStrength = normalizeScore(
        gks.map((g) => g.saveRate).filter(Boolean),
        gk.saveRate,
      );
    }
  });

  return {
    version: ROUND1_EXPORT_VERSION,
    goalkeepers: gks,
  };
}

export function buildCornerTrends({ teamTotals, powerByTeam }) {
  const teams = (teamTotals || []).map((team) => {
    const official = resolveOfficialTeamName(team.team);
    const avgFor = team.averages?.cornersFor ?? (team.cornersFor != null && team.matchesPlayed
      ? round(team.cornersFor / team.matchesPlayed, 2)
      : null);
    const avgAgainst = team.averages?.cornersAgainst ?? (team.cornersAgainst != null && team.matchesPlayed
      ? round(team.cornersAgainst / team.matchesPlayed, 2)
      : null);
    const dominance = avgFor != null && avgAgainst != null ? round(avgFor - avgAgainst, 2) : avgFor;

    return {
      team: official || team.team,
      matchesPlayed: team.matchesPlayed,
      cornersFor: team.cornersFor,
      cornersAgainst: team.cornersAgainst,
      averageCornersFor: avgFor,
      averageCornersAgainst: avgAgainst,
      cornerDominanceScore: dominance,
      projectedRound2CornerStrength: powerByTeam?.get(official)?.cornerRating ?? null,
    };
  });

  const domValues = teams.map((t) => t.cornerDominanceScore).filter((v) => v != null);
  teams.forEach((team) => {
    if (team.projectedRound2CornerStrength == null && team.cornerDominanceScore != null) {
      team.projectedRound2CornerStrength = normalizeScore(domValues, team.cornerDominanceScore);
    }
  });

  return {
    version: ROUND1_EXPORT_VERSION,
    teams: teams.sort((a, b) => (b.cornerDominanceScore ?? -999) - (a.cornerDominanceScore ?? -999)),
  };
}

export function buildCardTrends({ teamTotals, refereeStats, refereeSummary, powerByTeam }) {
  const tournamentLowCardFactor = refereeSummary?.tournamentAverageYellowCards != null
    && refereeSummary.tournamentAverageYellowCards < 3.5
    ? 0.82
    : 1;

  const teams = (teamTotals || []).map((team) => {
    const official = resolveOfficialTeamName(team.team);
    const fouls = team.foulsCommitted;
    const cards = (team.yellowCards ?? 0) + (team.redCards ?? 0);
    const foulsPerCard = fouls != null && cards > 0 ? round(fouls / cards, 2) : null;

    let refereeAdjustment = 'neutral';
    if (tournamentLowCardFactor < 1) refereeAdjustment = 'down';
    if (refereeSummary?.lowCardRefs > refereeSummary?.strictRefs) refereeAdjustment = 'down';

    const baseRisk = team.averages?.yellowCards ?? (team.yellowCards != null && team.matchesPlayed
      ? team.yellowCards / team.matchesPlayed
      : null);

    const projectedRound2CardRisk = baseRisk != null
      ? round(baseRisk * tournamentLowCardFactor, 2)
      : null;

    return {
      team: official || team.team,
      matchesPlayed: team.matchesPlayed,
      yellowCards: team.yellowCards,
      redCards: team.redCards,
      foulsPerCard,
      refereeAdjustment,
      projectedRound2CardRisk,
      disciplineRating: powerByTeam?.get(official)?.disciplineRating ?? null,
    };
  });

  return {
    version: ROUND1_EXPORT_VERSION,
    tournamentLowCardFactor,
    tournamentAverageYellowCards: refereeSummary?.tournamentAverageYellowCards ?? null,
    notes: tournamentLowCardFactor < 1
      ? 'Round 1 card counts ran lower than typical — projections adjusted down using referee/tournament trend.'
      : null,
    teams: teams.sort((a, b) => (a.projectedRound2CardRisk ?? 999) - (b.projectedRound2CardRisk ?? 999)),
  };
}

export function buildRound1Analysis({
  teamTotals,
  matchResults,
  goalkeeperRankings,
  cornerTrends,
  cardTrends,
  powerRankings,
}) {
  const played = (teamTotals || []).filter((t) => t.matchesPlayed > 0);
  const rankings = powerRankings?.rankings || [];

  const byAttack = played.slice().sort((a, b) => (b.goalsFor ?? 0) - (a.goalsFor ?? 0));
  const byDefence = played.slice().sort((a, b) => {
    const aGa = a.goalsAgainst ?? 999;
    const bGa = b.goalsAgainst ?? 999;
    if (aGa !== bGa) return aGa - bGa;
    return (b.cleanSheets ?? 0) - (a.cleanSheets ?? 0);
  });

  const dominantNonWinners = played
    .filter((t) => t.wins === 0 && ((t.shots ?? 0) > 10 || (t.xGFor ?? 0) > 1.2))
    .map((t) => ({
      team: resolveOfficialTeamName(t.team),
      result: `${t.wins}W-${t.draws}D-${t.losses}L`,
      goalsFor: t.goalsFor,
      xGFor: t.xGFor,
      shots: t.shots,
      note: 'Strong underlying numbers without a Round 1 win.',
    }));

  const overperformers = played
    .filter((t) => t.finishingEfficiency != null && t.finishingEfficiency > 1.15)
    .map((t) => ({
      team: resolveOfficialTeamName(t.team),
      goalsFor: t.goalsFor,
      xGFor: t.xGFor,
      finishingEfficiency: t.finishingEfficiency,
    }))
    .sort((a, b) => (b.finishingEfficiency ?? 0) - (a.finishingEfficiency ?? 0));

  const underperformers = played
    .filter((t) => t.finishingEfficiency != null && t.finishingEfficiency < 0.75 && (t.xGFor ?? 0) >= 0.8)
    .map((t) => ({
      team: resolveOfficialTeamName(t.team),
      goalsFor: t.goalsFor,
      xGFor: t.xGFor,
      finishingEfficiency: t.finishingEfficiency,
    }))
    .sort((a, b) => (a.finishingEfficiency ?? 999) - (b.finishingEfficiency ?? 999));

  const scorelineMismatch = played
    .filter((t) => {
      if (t.xGFor == null || t.goalsFor == null) return false;
      const diff = Math.abs(t.goalsFor - t.xGFor);
      return diff >= 1;
    })
    .map((t) => ({
      team: resolveOfficialTeamName(t.team),
      goalsFor: t.goalsFor,
      xGFor: t.xGFor,
      delta: round((t.goalsFor ?? 0) - (t.xGFor ?? 0), 2),
      type: (t.goalsFor ?? 0) > (t.xGFor ?? 0) ? 'overperformed' : 'underperformed',
    }))
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));

  const topGK = (goalkeeperRankings?.goalkeepers || []).slice(0, 5);
  const topCorners = (cornerTrends?.teams || []).slice(0, 5);

  return {
    version: ROUND1_EXPORT_VERSION,
    round: 'Round 1',
    completedMatches: matchResults?.matches?.length ?? 0,
    teamsWithRound1Data: played.length,
    bestAttackingTeams: byAttack.slice(0, 5).map((t) => ({
      team: resolveOfficialTeamName(t.team),
      goalsFor: t.goalsFor,
      xGFor: t.xGFor,
      shotsOnTarget: t.shotsOnTarget,
    })),
    bestDefensiveTeams: byDefence.slice(0, 5).map((t) => ({
      team: resolveOfficialTeamName(t.team),
      goalsAgainst: t.goalsAgainst,
      cleanSheets: t.cleanSheets,
      savesFor: t.savesFor,
    })),
    mostDominantTeamsThatFailedToWin: dominantNonWinners,
    biggestOverperformers: overperformers.slice(0, 5),
    biggestUnderperformers: underperformers.slice(0, 5),
    bestGoalkeeperPerformances: topGK.map((g) => ({
      playerName: g.playerName,
      team: g.team,
      saves: g.saves,
      saveRate: g.saveRate,
      cleanSheet: g.cleanSheet,
    })),
    strongestSaveTrends: topGK.map((g) => ({
      team: g.team,
      projectedRound2SaveStrength: g.projectedRound2SaveStrength,
      savesPerMatch: g.savesPerMatch,
    })),
    strongestCornerTrends: topCorners.map((t) => ({
      team: t.team,
      averageCornersFor: t.averageCornersFor,
      cornerDominanceScore: t.cornerDominanceScore,
      projectedRound2CornerStrength: t.projectedRound2CornerStrength,
    })),
    lowestCardTrendNotes: {
      factor: cardTrends?.tournamentLowCardFactor ?? null,
      note: cardTrends?.notes ?? null,
      lowestRiskTeams: (cardTrends?.teams || []).slice(0, 5).map((t) => ({
        team: t.team,
        projectedRound2CardRisk: t.projectedRound2CardRisk,
      })),
    },
    teamsWhoseScorelineDidNotMatchPerformance: scorelineMismatch.slice(0, 8),
    topOverallPower: rankings.slice(0, 5).map((r) => ({
      rank: r.rank,
      team: r.team,
      overallPowerScore: r.overallPowerScore,
    })),
  };
}

export function buildPowerLookup(powerRankings) {
  const map = new Map();
  for (const row of powerRankings?.rankings || []) {
    map.set(row.team, row);
  }
  return map;
}
