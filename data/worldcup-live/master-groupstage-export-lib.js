/**
 * Assemble EdgeStats_Master_GroupStage_Complete.json from stored project data only.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OFFICIAL_WC2026_GROUPS } from '../../api/_lib/wc2026-official-teams.js';
import { resolveOfficialTeamName, POWER_RANKINGS_VERSION } from './power-rankings-lib.js';

const CLUB_WEIGHT_DEFAULT = 0.65;
const LIVE_WEIGHT_DEFAULT = 0.35;
const CLUB_WEIGHT_GK_CORNERS = 0.50;
const LIVE_WEIGHT_GK_CORNERS = 0.50;
const CLUB_WEIGHT_CARDS = 0.55;
const LIVE_WEIGHT_CARDS = 0.45;
const TOURNAMENT_LOW_CARD_FACTOR = 0.82;

const DIMENSION_WEIGHTS = {
  attackRating: 0.18,
  defenceRating: 0.16,
  chanceCreationRating: 0.14,
  finishingRating: 0.12,
  cornerRating: 0.08,
  disciplineRating: 0.06,
  goalkeeperRating: 0.12,
  currentFormRating: 0.14,
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const LIVE_DIR = join(__dirname);

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

function readLiveJson(filename) {
  return JSON.parse(readFileSync(join(LIVE_DIR, filename), 'utf8'));
}

function sum(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(Number(v)));
  if (!nums.length) return null;
  return nums.reduce((t, v) => t + Number(v), 0);
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function getOfficialGroup(teamName) {
  const official = resolveOfficialTeamName(teamName);
  for (const entry of OFFICIAL_WC2026_GROUPS) {
    if (entry.teams.includes(official)) return entry.group;
  }
  return null;
}

function buildTeamIndex(teamTotals) {
  const map = new Map();
  for (const row of teamTotals || []) {
    map.set(resolveOfficialTeamName(row.team), row);
  }
  return map;
}

function buildPlayerTournamentIndex(playerTotals) {
  const byId = new Map();
  const byNameTeam = new Map();
  for (const row of playerTotals || []) {
    if (row.playerId != null) byId.set(row.playerId, row);
    const key = `${(row.playerName || '').toLowerCase()}::${resolveOfficialTeamName(row.team)}`;
    byNameTeam.set(key, row);
  }
  return { byId, byNameTeam };
}

function computeGroupStandings(teamTotals) {
  const teamIndex = buildTeamIndex(teamTotals);
  const groups = [];

  for (const { group, teams } of OFFICIAL_WC2026_GROUPS) {
    const table = teams.map((team) => {
      const stats = teamIndex.get(team) || {};
      const points = (stats.wins ?? 0) * 3 + (stats.draws ?? 0);
      return {
        team,
        group,
        played: stats.matchesPlayed ?? null,
        wins: stats.wins ?? null,
        draws: stats.draws ?? null,
        losses: stats.losses ?? null,
        goalsFor: stats.goalsFor ?? null,
        goalsAgainst: stats.goalsAgainst ?? null,
        goalDifference: stats.goalDifference ?? null,
        points,
      };
    }).sort((a, b) => {
      if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
      if ((b.goalDifference ?? 0) !== (a.goalDifference ?? 0)) {
        return (b.goalDifference ?? 0) - (a.goalDifference ?? 0);
      }
      return (b.goalsFor ?? 0) - (a.goalsFor ?? 0);
    });

    table.forEach((row, index) => {
      row.groupFinish = index + 1;
    });

    groups.push({ group, standings: table });
  }

  const thirdPlaceTeams = groups
    .map((g) => g.standings.find((row) => row.groupFinish === 3))
    .filter(Boolean)
    .sort((a, b) => {
      if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
      if ((b.goalDifference ?? 0) !== (a.goalDifference ?? 0)) {
        return (b.goalDifference ?? 0) - (a.goalDifference ?? 0);
      }
      return (b.goalsFor ?? 0) - (a.goalsFor ?? 0);
    });

  const qualifiedThirdPlace = new Set(thirdPlaceTeams.slice(0, 8).map((row) => row.team));

  return { groups, qualifiedThirdPlace };
}

function buildTournamentInfo(summary, matches, teamTotals, standingsResult) {
  const totalGoals = sum(matches.map((m) => (m.homeScore ?? 0) + (m.awayScore ?? 0)));
  const totalYellowCards = sum(matches.map((m) => m.referee?.totalYellowCards));
  const totalRedCards = sum(matches.map((m) => m.referee?.totalRedCards));
  const totalCards = (totalYellowCards ?? 0) + (totalRedCards ?? 0);

  return {
    tournamentName: 'FIFA World Cup 2026',
    exportTimestamp: new Date().toISOString(),
    currentStage: 'Knockout Stage',
    totalMatchesPlayed: summary.completedMatchesProcessed ?? matches.length,
    totalGoals,
    totalCards: totalCards || null,
    totalYellowCards,
    totalRedCards,
    totalPenalties: null,
    completedGroupStandings: standingsResult.groups,
    dataSources: {
      liveExportVersion: summary.version ?? null,
      liveExportTimestamp: summary.exportedAt ?? null,
      apiSource: summary.source ?? null,
    },
  };
}

function buildMatchEntry(match, teamStatsByMatch) {
  const rows = teamStatsByMatch.get(match.matchId) || [];
  const homeRow = rows.find((r) => r.team === match.homeTeam);
  const awayRow = rows.find((r) => r.team === match.awayTeam);

  const side = (row) => ({
    goals: row?.goalsFor ?? null,
    possession: row?.possession ?? null,
    shots: row?.shots ?? null,
    shotsOnTarget: row?.shotsOnTarget ?? null,
    shotsOffTarget: null,
    blockedShots: null,
    xG: row?.xG ?? null,
    corners: row?.corners ?? null,
    offsides: null,
    fouls: row?.foulsCommitted ?? null,
    yellowCards: row?.yellowCards ?? null,
    redCards: row?.redCards ?? null,
    saves: row?.saves ?? null,
    passes: row?.passes ?? null,
    passAccuracy: row?.passAccuracy ?? null,
    tackles: null,
    interceptions: null,
    clearances: null,
  });

  return {
    matchId: match.matchId,
    date: match.date,
    group: match.group,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    score: {
      home: match.homeScore,
      away: match.awayScore,
    },
    halftimeScore: null,
    goalscorers: match.scorers ?? null,
    assists: match.scorers
      ? {
        home: (match.scorers.home || []).map((g) => ({
          player: g.player,
          minute: g.minute,
          assist: g.assist,
        })),
        away: (match.scorers.away || []).map((g) => ({
          player: g.player,
          minute: g.minute,
          assist: g.assist,
        })),
      }
      : null,
    home: side(homeRow),
    away: side(awayRow),
    referee: match.referee?.name ?? null,
    refereeDetails: match.referee ?? null,
    venue: match.venue,
    city: match.city,
    motm: null,
    statusShort: match.statusShort,
  };
}

function buildTeamDatabase(teamTotals, powerRankings, teamStrength, standingsResult) {
  const powerByTeam = new Map((powerRankings.rankings || []).map((r) => [r.team, r]));
  const strengthByTeam = new Map((teamStrength.teams || []).map((t) => [t.team, t]));
  const finishByTeam = new Map();

  for (const group of standingsResult.groups) {
    for (const row of group.standings) {
      finishByTeam.set(row.team, {
        group: group.group,
        groupFinish: row.groupFinish,
        points: row.points,
      });
    }
  }

  return getOfficialTeamNamesFromGroups().map((team) => {
    const totals = buildTeamIndex(teamTotals).get(team) || {};
    const power = powerByTeam.get(team) || {};
    const strength = strengthByTeam.get(team) || {};
    const finish = finishByTeam.get(team) || {};

    let qualified = null;
    if (finish.groupFinish != null) {
      if (finish.groupFinish <= 2) qualified = true;
      else if (finish.groupFinish === 3) {
        qualified = standingsResult.qualifiedThirdPlace.has(team);
      } else if (finish.groupFinish === 4) qualified = false;
    }

    return {
      team,
      group: finish.group ?? power.group ?? getOfficialGroup(team),
      fifaWorldCupRanking: null,
      groupFinish: finish.groupFinish ?? null,
      groupPoints: finish.points ?? null,
      qualified,
      eliminated: qualified === false ? true : (qualified === true ? false : null),
      matches: totals.matchesPlayed ?? null,
      wins: totals.wins ?? null,
      draws: totals.draws ?? null,
      losses: totals.losses ?? null,
      goalsFor: totals.goalsFor ?? null,
      goalsAgainst: totals.goalsAgainst ?? null,
      goalDifference: totals.goalDifference ?? null,
      cleanSheets: totals.cleanSheets ?? null,
      possessionAverage: totals.possessionAverage ?? null,
      shotsAverage: totals.averages?.shots ?? null,
      shotsOnTargetAverage: totals.averages?.shotsOnTarget ?? null,
      cornersAverage: totals.averages?.cornersFor ?? null,
      foulsAverage: totals.foulsCommitted != null && totals.matchesPlayed
        ? round(totals.foulsCommitted / totals.matchesPlayed, 2)
        : null,
      cardsAverage: totals.averages?.yellowCards ?? null,
      keeperSavesAverage: totals.averages?.savesFor ?? null,
      edgeStatsRatings: {
        overallPower: power.overallPowerScore ?? null,
        attack: power.attackRating ?? null,
        defence: power.defenceRating ?? null,
        finishing: power.finishingRating ?? null,
        chanceCreation: power.chanceCreationRating ?? null,
        goalkeeper: power.goalkeeperRating ?? null,
        discipline: power.disciplineRating ?? null,
        currentForm: power.currentFormRating ?? null,
        corner: power.cornerRating ?? null,
      },
      edgeStatsRanks: power.categoryRanks ?? null,
      overallRank: power.rank ?? null,
      ratingsBreakdown: strength.ratings ?? null,
      clubBaseline: strength.clubBaseline ?? null,
      tournamentTotals: strength.round1Tournament ?? null,
    };
  });
}

function getOfficialTeamNamesFromGroups() {
  return OFFICIAL_WC2026_GROUPS.flatMap((g) => g.teams);
}

function buildClubSeasonProfile(player) {
  return {
    minutes: player.minutes ?? null,
    starts: null,
    appearances: player.appearances ?? null,
    goals: player.goals ?? null,
    assists: player.assists ?? null,
    xG: null,
    xA: null,
    shots: null,
    shotsOnTarget: null,
    keyPasses: player.chancesCreated ?? null,
    dribbles: null,
    tackles: null,
    interceptions: null,
    clearances: null,
    blocks: null,
    foulsCommitted: player.foulsCommitted ?? player.fouls ?? null,
    foulsWon: player.foulsDrawn ?? null,
    yellowCards: player.yellowCards ?? player.cards ?? null,
    redCards: player.redCards ?? null,
    keeperSaves: null,
    cleanSheets: null,
    rating: null,
    club: player.club ?? null,
    position: player.position ?? null,
    statSource: player.statSource ?? null,
    statMeta: player.statMeta ?? null,
    clubStatsVerified: player.clubStatsVerified ?? null,
  };
}

function buildTournamentProfile(tournament) {
  if (!tournament) {
    return {
      minutes: null,
      starts: null,
      appearances: null,
      goals: null,
      assists: null,
      xG: null,
      xA: null,
      shots: null,
      shotsOnTarget: null,
      keyPasses: null,
      dribbles: null,
      tackles: null,
      interceptions: null,
      clearances: null,
      blocks: null,
      foulsCommitted: null,
      foulsWon: null,
      yellowCards: null,
      redCards: null,
      keeperSaves: null,
      cleanSheets: null,
      rating: null,
      currentTournamentForm: null,
    };
  }

  return {
    minutes: tournament.minutes ?? null,
    starts: null,
    appearances: tournament.matchesPlayed ?? null,
    goals: tournament.goals ?? null,
    assists: tournament.assists ?? null,
    xG: null,
    xA: null,
    shots: tournament.shots ?? null,
    shotsOnTarget: tournament.shotsOnTarget ?? null,
    keyPasses: tournament.chancesCreated ?? null,
    dribbles: null,
    tackles: null,
    interceptions: null,
    clearances: null,
    blocks: null,
    foulsCommitted: tournament.foulsCommitted ?? null,
    foulsWon: tournament.foulsDrawn ?? null,
    yellowCards: tournament.yellowCards ?? null,
    redCards: tournament.redCards ?? null,
    keeperSaves: tournament.saves ?? null,
    cleanSheets: null,
    rating: null,
    currentTournamentForm: null,
  };
}

function buildPlayerDatabase(clubDataset, playerTotals) {
  const { byId, byNameTeam } = buildPlayerTournamentIndex(playerTotals);

  return (clubDataset.players || []).map((player) => {
    let tournament = byId.get(player.id);
    if (!tournament) {
      const key = `${(player.name || '').toLowerCase()}::${resolveOfficialTeamName(player.country || player.team)}`;
      tournament = byNameTeam.get(key) ?? null;
    }

    return {
      playerId: player.id ?? null,
      playerName: player.name ?? null,
      team: resolveOfficialTeamName(player.country || player.team),
      group: player.group ?? getOfficialGroup(player.country || player.team),
      position: player.position ?? null,
      photo: player.photo ?? null,
      clubSeasonProfile: buildClubSeasonProfile(player),
      tournamentProfile: buildTournamentProfile(tournament),
    };
  });
}

function buildRefereeDatabase(refereeStats) {
  return (refereeStats.referees || []).map((ref) => ({
    name: ref.name,
    nationality: ref.nationality,
    matches: ref.matchesOfficiated ?? null,
    yellowsPerGame: ref.averageYellowCards ?? null,
    reds: ref.totalRedCards ?? null,
    redsPerGame: ref.averageRedCards ?? null,
    foulsPerGame: ref.averageFouls ?? null,
    penalties: null,
    averageCards: ref.averageYellowCards != null || ref.averageRedCards != null
      ? round((ref.averageYellowCards ?? 0) + (ref.averageRedCards ?? 0), 2)
      : null,
    averageFouls: ref.averageFouls ?? null,
    foulsPerYellowCard: ref.foulsPerYellowCard ?? null,
    averageFirstYellowMinute: ref.averageFirstYellowMinute ?? null,
    refereeStyle: ref.refereeStyle ?? null,
    totals: {
      totalFouls: ref.totalFouls ?? null,
      totalYellowCards: ref.totalYellowCards ?? null,
      totalRedCards: ref.totalRedCards ?? null,
    },
  }));
}

function buildPowerModel(powerRankings, teamStrength, goalkeeperRankings) {
  const rankings = powerRankings.rankings || [];

  const byCategory = (key) => rankings
    .slice()
    .sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1))
    .map((row, index) => ({
      rank: index + 1,
      team: row.team,
      score: row[key],
    }));

  return {
    version: powerRankings.version ?? POWER_RANKINGS_VERSION,
    exportedAt: powerRankings.exportedAt ?? null,
    teamsRanked: powerRankings.teamsRanked ?? null,
    completedMatchesInPool: powerRankings.completedMatchesInPool ?? null,
    overallRankings: rankings.map((row) => ({
      rank: row.rank,
      team: row.team,
      group: row.group,
      overallPowerScore: row.overallPowerScore,
      worldCupMatchesPlayed: row.worldCupMatchesPlayed,
      dataSource: row.dataSource,
    })),
    attackRankings: byCategory('attackRating'),
    defenceRankings: byCategory('defenceRating'),
    goalkeeperRankings: byCategory('goalkeeperRating'),
    formRankings: byCategory('currentFormRating'),
    finishingRankings: byCategory('finishingRating'),
    chanceCreationRankings: byCategory('chanceCreationRating'),
    disciplineRankings: byCategory('disciplineRating'),
    cornerRankings: byCategory('cornerRating'),
    fullRankings: rankings,
    teamStrengthDetail: teamStrength,
    goalkeeperRankingsDetail: goalkeeperRankings,
  };
}

function buildLeaderboard(playerTotals, label, field, higherIsBetter = true) {
  const rows = (playerTotals || [])
    .filter((p) => p[field] != null && Number.isFinite(Number(p[field])))
    .slice()
    .sort((a, b) => (higherIsBetter ? 1 : -1) * ((b[field] ?? 0) - (a[field] ?? 0)));

  return rows.map((row, index) => ({
    rank: index + 1,
    playerId: row.playerId,
    playerName: row.playerName,
    team: resolveOfficialTeamName(row.team),
    value: row[field],
  }));
}

function buildTournamentLeaders(playerTotals, teamTotals) {
  const gkTotals = (playerTotals || []).filter((p) => (p.saves ?? 0) > 0);

  return {
    goals: buildLeaderboard(playerTotals, 'goals', 'goals'),
    assists: buildLeaderboard(playerTotals, 'assists', 'assists'),
    saves: buildLeaderboard(gkTotals, 'saves', 'saves'),
    cleanSheets: null,
    tackles: null,
    interceptions: null,
    foulsWon: buildLeaderboard(playerTotals, 'foulsDrawn', 'foulsDrawn'),
    foulsCommitted: buildLeaderboard(playerTotals, 'foulsCommitted', 'foulsCommitted'),
    cards: (playerTotals || [])
      .map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        team: resolveOfficialTeamName(p.team),
        value: (p.yellowCards ?? 0) + (p.redCards ?? 0),
      }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((row, index) => ({ rank: index + 1, ...row })),
    passAccuracy: null,
    shots: buildLeaderboard(playerTotals, 'shots', 'shots'),
    shotsOnTarget: buildLeaderboard(playerTotals, 'shotsOnTarget', 'shotsOnTarget'),
    chancesCreated: buildLeaderboard(playerTotals, 'chancesCreated', 'chancesCreated'),
    minutes: buildLeaderboard(playerTotals, 'minutes', 'minutes'),
    teamGoals: buildLeaderboard(
      teamTotals.map((t) => ({ ...t, playerName: t.team, playerId: null, team: t.team })),
      'goalsFor',
      'goalsFor',
    ),
  };
}

function buildMethodology(teamStrength, summary) {
  return {
    powerRankingsVersion: POWER_RANKINGS_VERSION,
    description: teamStrength.methodology?.description ?? null,
    clubSeasonWeighting: {
      default: CLUB_WEIGHT_DEFAULT,
      goalkeeperAndCorners: CLUB_WEIGHT_GK_CORNERS,
      discipline: CLUB_WEIGHT_CARDS,
    },
    groupStageWeighting: {
      default: LIVE_WEIGHT_DEFAULT,
      goalkeeperAndCorners: LIVE_WEIGHT_GK_CORNERS,
      discipline: LIVE_WEIGHT_CARDS,
    },
    lowCardTournamentAdjustment: teamStrength.methodology?.lowCardTournamentAdjustment
      ?? TOURNAMENT_LOW_CARD_FACTOR,
    dimensionWeights: teamStrength.methodology?.weights ?? DIMENSION_WEIGHTS,
    currentFormulas: {
      overallPowerScore: 'Weighted average of normalized dimension scores (attack, defence, chance creation, finishing, corners, discipline, goalkeeper, current form).',
      blendRaw: 'combinedRaw = (clubRaw × clubWeight) + (liveRaw × liveWeight) when group-stage matches exist; otherwise club baseline only.',
      normalizeDimension: 'score = ((raw - min) / (max - min)) × 100 per dimension across all 48 teams.',
      finishingEfficiency: 'goalsFor / xGFor when xG available.',
      disciplineAdjustment: 'Card projections multiplied by tournament low-card factor when average yellows < 3.5.',
    },
    confidenceCalculations: null,
    excludes: teamStrength.methodology?.excludes ?? ['FIFA rankings', 'bookmaker odds', 'simulated match data'],
    missingFieldsInSourceExport: summary.missingFields ?? null,
  };
}

function buildKnockoutReadySummary(teamDatabase, teamTotals, powerRankings, goalkeeperRankings, cardTrends, refereeStats) {
  const played = teamTotals.filter((t) => (t.matchesPlayed ?? 0) > 0);
  const powerRank = new Map((powerRankings.rankings || []).map((r) => [r.team, r]));

  const byAttack = played.slice().sort((a, b) => (b.goalsFor ?? 0) - (a.goalsFor ?? 0));
  const byDefence = played.slice().sort((a, b) => {
    const ga = a.goalsAgainst ?? 999;
    const gb = b.goalsAgainst ?? 999;
    if (ga !== gb) return ga - gb;
    return (b.cleanSheets ?? 0) - (a.cleanSheets ?? 0);
  });

  const clinical = played
    .filter((t) => t.finishingEfficiency != null)
    .sort((a, b) => (b.finishingEfficiency ?? 0) - (a.finishingEfficiency ?? 0));

  const leastClinical = played
    .filter((t) => t.finishingEfficiency != null && (t.xGFor ?? 0) >= 2)
    .sort((a, b) => (a.finishingEfficiency ?? 999) - (b.finishingEfficiency ?? 999));

  const qualified = teamDatabase.filter((t) => t.qualified === true);
  const eliminated = teamDatabase.filter((t) => t.eliminated === true);

  const surprise = qualified
    .filter((t) => (t.overallRank ?? 99) > 20)
    .sort((a, b) => (a.overallRank ?? 99) - (b.overallRank ?? 99));

  const disappointment = eliminated
    .filter((t) => (t.overallRank ?? 99) <= 15)
    .sort((a, b) => (a.overallRank ?? 99) - (b.overallRank ?? 99));

  const trendingUp = (powerRankings.rankings || [])
    .filter((r) => r.currentFormRating != null && r.rank != null && r.categoryRanks?.currentFormRating != null)
    .map((r) => ({
      team: r.team,
      overallRank: r.rank,
      formRank: r.categoryRanks.currentFormRating,
      formDelta: r.rank - r.categoryRanks.currentFormRating,
      currentFormRating: r.currentFormRating,
    }))
    .filter((r) => r.formDelta >= 10)
    .sort((a, b) => b.formDelta - a.formDelta);

  const trendingDown = (powerRankings.rankings || [])
    .filter((r) => r.currentFormRating != null && r.rank != null && r.categoryRanks?.currentFormRating != null)
    .map((r) => ({
      team: r.team,
      overallRank: r.rank,
      formRank: r.categoryRanks.currentFormRating,
      formDelta: r.rank - r.categoryRanks.currentFormRating,
      currentFormRating: r.currentFormRating,
    }))
    .filter((r) => r.formDelta <= -10)
    .sort((a, b) => a.formDelta - b.formDelta);

  const topGK = (goalkeeperRankings.goalkeepers || [])[0] ?? null;

  return {
    strongestAttackingTeams: byAttack.slice(0, 5).map((t) => ({
      team: resolveOfficialTeamName(t.team),
      goalsFor: t.goalsFor,
      xGFor: t.xGFor,
      goalsPerMatch: t.averages?.goalsFor ?? null,
    })),
    strongestDefensiveTeams: byDefence.slice(0, 5).map((t) => ({
      team: resolveOfficialTeamName(t.team),
      goalsAgainst: t.goalsAgainst,
      cleanSheets: t.cleanSheets,
      goalsAgainstPerMatch: t.averages?.goalsAgainst ?? null,
    })),
    biggestSurprise: surprise[0] ?? null,
    biggestDisappointment: disappointment[0] ?? null,
    mostClinicalTeam: clinical[0]
      ? {
        team: resolveOfficialTeamName(clinical[0].team),
        goalsFor: clinical[0].goalsFor,
        xGFor: clinical[0].xGFor,
        finishingEfficiency: clinical[0].finishingEfficiency,
      }
      : null,
    leastClinicalTeam: leastClinical[0]
      ? {
        team: resolveOfficialTeamName(leastClinical[0].team),
        goalsFor: leastClinical[0].goalsFor,
        xGFor: leastClinical[0].xGFor,
        finishingEfficiency: leastClinical[0].finishingEfficiency,
      }
      : null,
    bestGoalkeeper: topGK,
    bestRefereeTrends: {
      tournamentLowCardFactor: cardTrends.tournamentLowCardFactor ?? null,
      tournamentAverageYellowCards: cardTrends.tournamentAverageYellowCards ?? null,
      note: cardTrends.notes ?? null,
      strictestReferee: (refereeStats.referees || [])
        .slice()
        .sort((a, b) => (b.averageYellowCards ?? 0) - (a.averageYellowCards ?? 0))[0] ?? null,
      lowestCardReferee: (refereeStats.referees || [])
        .slice()
        .sort((a, b) => (a.averageYellowCards ?? 999) - (b.averageYellowCards ?? 999))[0] ?? null,
    },
    teamsTrendingUpward: trendingUp.slice(0, 5),
    teamsTrendingDownward: trendingDown.slice(0, 5),
    qualifiedTeams: qualified.map((t) => t.team),
    eliminatedTeams: eliminated.map((t) => t.team),
  };
}

export function buildMasterGroupStageExport() {
  const summary = readLiveJson('worldcup-live-summary.json');
  const teamStats = readLiveJson('worldcup-live-team-stats.json');
  const playerStats = readLiveJson('worldcup-live-player-stats.json');
  const matchResults = readLiveJson('worldcup-live-match-results.json');
  const refereeStats = readLiveJson('worldcup-live-referee-stats.json');
  const powerRankings = readLiveJson('worldcup-live-power-rankings.json');
  const teamStrength = readLiveJson('worldcup-live-team-strength.json');
  const goalkeeperRankings = readLiveJson('worldcup-live-goalkeeper-rankings.json');
  const cornerTrends = readLiveJson('worldcup-live-corner-trends.json');
  const cardTrends = readLiveJson('worldcup-live-card-trends.json');
  const round1Analysis = readLiveJson('worldcup-live-round1-analysis.json');
  const clubDataset = readJson('video-data/wc2026-full-player-data.json');

  const matches = matchResults.matches || [];
  const teamTotals = teamStats.teamTotals || [];
  const playerTotals = playerStats.playerTotals || [];

  const teamStatsByMatch = new Map();
  for (const row of teamStats.matchStats || []) {
    if (!teamStatsByMatch.has(row.matchId)) teamStatsByMatch.set(row.matchId, []);
    teamStatsByMatch.get(row.matchId).push(row);
  }

  const standingsResult = computeGroupStandings(teamTotals);

  const exportDoc = {
    fileName: 'EdgeStats_Master_GroupStage_Complete.json',
    tournamentInfo: buildTournamentInfo(summary, matches, teamTotals, standingsResult),
    everyMatch: matches.map((m) => buildMatchEntry(m, teamStatsByMatch)),
    teamDatabase: buildTeamDatabase(teamTotals, powerRankings, teamStrength, standingsResult),
    playerDatabase: buildPlayerDatabase(clubDataset, playerTotals),
    refereeDatabase: buildRefereeDatabase(refereeStats),
    edgeStatsPowerModel: buildPowerModel(powerRankings, teamStrength, goalkeeperRankings),
    tournamentLeaders: buildTournamentLeaders(playerTotals, teamTotals),
    methodology: buildMethodology(teamStrength, summary),
    knockoutReadySummary: buildKnockoutReadySummary(
      buildTeamDatabase(teamTotals, powerRankings, teamStrength, standingsResult),
      teamTotals,
      powerRankings,
      goalkeeperRankings,
      cardTrends,
      refereeStats,
    ),
    supplementaryStoredExports: {
      cornerTrends,
      cardTrends,
      round1Analysis,
      liveSummary: summary,
    },
    dataIntegrity: {
      completedGroupStageMatchesOnly: true,
      groupStageMatchesProcessed: summary.completedMatchesProcessed ?? matches.length,
      futureFixturesExcluded: true,
      skippedUpcoming: summary.skippedUpcoming ?? null,
      skippedLive: summary.skippedLive ?? null,
      simulatedDataIncluded: false,
      missingFieldsUseNull: true,
      fieldsNotStoredInProject: [
        'fifaWorldCupRanking',
        'halftimeScore',
        'shotsOffTarget',
        'blockedShots',
        'offsides',
        'tackles',
        'interceptions',
        'clearances',
        'motm',
        'totalPenalties',
        'refereePenalties',
        'playerXG',
        'playerXA',
        'playerDribbles',
        'playerTournamentStarts',
        'playerCleanSheets',
        'playerRating',
        'confidenceCalculations',
        'passAccuracyLeaders',
        'cleanSheetLeaders',
        'tackleLeaders',
        'interceptionLeaders',
      ],
    },
  };

  return exportDoc;
}
