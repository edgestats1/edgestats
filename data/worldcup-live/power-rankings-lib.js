/**
 * World Cup 2026 power rankings — 65% club / 35% Round 1 blend (EdgeStats data only).
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OFFICIAL_WC2026_GROUPS, getOfficialTeamNames } from '../../api/_lib/wc2026-official-teams.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

export const POWER_RANKINGS_VERSION = 'wc2026-live-power-rankings-v2';

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

const API_NAME_TO_OFFICIAL = {
  usa: 'United States',
  'united states': 'United States',
  'bosnia & herzegovina': 'Bosnia and Herzegovina',
  'bosnia and herzegovina': 'Bosnia and Herzegovina',
  'czech republic': 'Czechia',
  czechia: 'Czechia',
  "cote d'ivoire": 'Ivory Coast',
  "côte d'ivoire": 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
  'cape verde islands': 'Cape Verde',
  'cape verde': 'Cape Verde',
  'congo dr': 'DR Congo',
  'congo democratic': 'DR Congo',
  'dr congo': 'DR Congo',
  turkey: 'Türkiye',
  türkiye: 'Türkiye',
};

function normalizeKey(name) {
  return (name || '').toLowerCase().trim();
}

export function resolveOfficialTeamName(name) {
  const key = normalizeKey(name);
  if (!key) return null;

  const officialTeams = getOfficialTeamNames();
  const direct = officialTeams.find((team) => normalizeKey(team) === key);
  if (direct) return direct;

  if (API_NAME_TO_OFFICIAL[key]) return API_NAME_TO_OFFICIAL[key];

  for (const [alias, official] of Object.entries(API_NAME_TO_OFFICIAL)) {
    if (key.includes(alias) || alias.includes(key)) return official;
  }

  return name;
}

function getOfficialGroup(teamName) {
  for (const entry of OFFICIAL_WC2026_GROUPS) {
    if (entry.teams.includes(teamName)) return entry.group;
  }
  return null;
}

function sum(values) {
  const nums = values.filter((value) => value != null && Number.isFinite(Number(value)));
  if (!nums.length) return null;
  return nums.reduce((total, value) => total + Number(value), 0);
}

function avg(values) {
  const nums = values.filter((value) => value != null && Number.isFinite(Number(value)));
  if (!nums.length) return null;
  return nums.reduce((total, value) => total + Number(value), 0) / nums.length;
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function loadClubPlayerDataset() {
  const paths = [
    join(ROOT, 'video-data/wc2026-full-player-data.json'),
    join(ROOT, 'data/homepage-rankings.json'),
  ];

  for (const path of paths) {
    if (!existsSync(path)) continue;

    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (Array.isArray(raw.players)) {
      return { source: path.replace(`${ROOT}/`, ''), players: raw.players };
    }

    if (Array.isArray(raw.categories)) {
      return {
        source: path.replace(`${ROOT}/`, ''),
        players: raw.categories.flatMap((category) => category.players || []),
        partial: true,
      };
    }
  }

  throw new Error('Club player dataset not found (video-data/wc2026-full-player-data.json).');
}

function aggregateClubBaseline(players, officialTeam) {
  const squad = players.filter((player) => {
    const country = player.country || player.team;
    return resolveOfficialTeamName(country) === officialTeam;
  });

  const minutes = sum(squad.map((player) => player.minutes)) ?? 0;
  const appearances = sum(squad.map((player) => player.appearances)) ?? 0;
  const squadGoals = sum(squad.map((player) => player.goals)) ?? 0;
  const squadAssists = sum(squad.map((player) => player.assists)) ?? 0;
  const squadChances = sum(squad.map((player) => player.chancesCreated)) ?? 0;
  const squadCorners = sum(squad.map((player) => player.cornersInvolved)) ?? 0;
  const squadYellow = sum(squad.map((player) => player.yellowCards ?? player.cards)) ?? 0;
  const squadRed = sum(squad.map((player) => player.redCards)) ?? 0;
  const squadFoulsCommitted = sum(squad.map((player) => player.foulsCommitted ?? player.fouls)) ?? 0;

  const gkMinutes = sum(
    squad.filter((p) => (p.position || '').toLowerCase().includes('goal')).map((p) => p.minutes),
  ) ?? 0;
  const defMinutes = sum(
    squad.filter((p) => (p.position || '').toLowerCase().startsWith('def')).map((p) => p.minutes),
  ) ?? 0;

  const minutes90 = minutes > 0 ? minutes / 90 : null;
  const cardRate = appearances > 0 ? (squadYellow + squadRed * 2) / appearances : null;

  return {
    squadPlayers: squad.length,
    verifiedPlayers: squad.filter((p) => p.clubStatsVerified !== false).length,
    goals: squadGoals,
    assists: squadAssists,
    chancesCreated: squadChances,
    cornersInvolved: squadCorners,
    yellowCards: squadYellow,
    redCards: squadRed,
    foulsCommitted: squadFoulsCommitted,
    attackRaw: (squadGoals * 1.4) + (squadAssists * 1.0) + (squadChances * 0.55),
    defenceRaw: minutes > 0
      ? ((defMinutes + gkMinutes * 1.15) / minutes) * 55 + Math.max(0, 18 - (cardRate ?? 0) * 4)
      : null,
    finishingRaw: squadGoals > 0 && minutes90 != null ? squadGoals / minutes90 * 20 : squadGoals * 0.5,
    cornersRaw: minutes90 != null ? squadCorners / minutes90 : squadCorners,
    cardsRaw: cardRate != null ? cardRate * 10 + (squadFoulsCommitted / Math.max(1, appearances)) * 0.35 : null,
    disciplineRaw: cardRate != null ? Math.max(0, 20 - cardRate * 8) : null,
    goalkeeperRaw: minutes > 0 ? (gkMinutes / minutes) * 45 : null,
    chanceCreationRaw: minutes90 != null
      ? (squadChances / minutes90) * 12 + (squadAssists / minutes90) * 8
      : squadChances,
  };
}

function indexTeamTotals(teamTotals) {
  const map = new Map();
  for (const row of teamTotals || []) {
    const official = resolveOfficialTeamName(row.team);
    if (official) map.set(official, row);
  }
  return map;
}

function indexPlayerTotals(playerTotals) {
  const map = new Map();
  for (const row of playerTotals || []) {
    const official = resolveOfficialTeamName(row.team);
    if (!official) continue;
    if (!map.has(official)) map.set(official, []);
    map.get(official).push(row);
  }
  return map;
}

function aggregateLiveBaseline(teamTotal, playerRows, matchResults, officialTeam) {
  if (!teamTotal?.matchesPlayed) {
    return { matchesPlayed: 0 };
  }

  const averages = teamTotal.averages || {};
  const playerChances = sum((playerRows || []).map((row) => row.chancesCreated));
  const playerAssists = sum((playerRows || []).map((row) => row.assists));
  const chancesPerMatch = playerChances != null ? playerChances / teamTotal.matchesPlayed : null;

  const teamMatches = (matchResults || []).filter(
    (match) => resolveOfficialTeamName(match.homeTeam) === officialTeam
      || resolveOfficialTeamName(match.awayTeam) === officialTeam,
  );

  const cardEnvironment = avg(teamMatches.map((m) => m.referee?.totalYellowCards).filter((v) => v != null));
  const points = (teamTotal.wins * 3) + teamTotal.draws;
  const ppg = points / teamTotal.matchesPlayed;
  const gdPerMatch = teamTotal.goalDifference != null
    ? teamTotal.goalDifference / teamTotal.matchesPlayed
    : null;

  const finishingEfficiency = teamTotal.finishingEfficiency;
  const cardAvg = averages.yellowCards ?? (teamTotal.yellowCards != null
    ? teamTotal.yellowCards / teamTotal.matchesPlayed
    : null);

  return {
    matchesPlayed: teamTotal.matchesPlayed,
    wins: teamTotal.wins,
    draws: teamTotal.draws,
    losses: teamTotal.losses,
    goalsFor: teamTotal.goalsFor,
    goalsAgainst: teamTotal.goalsAgainst,
    goalDifference: teamTotal.goalDifference,
    finishingEfficiency,
    averages,
    cardEnvironment,
    attackRaw: (averages.goalsFor ?? 0) * 18 + (averages.shotsOnTarget ?? 0) * 2.4 + (averages.shots ?? 0) * 0.35,
    defenceRaw: 28 - (averages.goalsAgainst ?? 0) * 9 + (averages.savesFor ?? averages.saves ?? 0) * 0.85,
    finishingRaw: finishingEfficiency != null ? finishingEfficiency * 25 : (averages.goalsFor ?? 0) * 12,
    cornersRaw: averages.cornersFor ?? averages.corners,
    cardsRaw: cardAvg != null ? cardAvg * TOURNAMENT_LOW_CARD_FACTOR * 2.2 : null,
    disciplineRaw: cardAvg != null ? Math.max(0, 18 - cardAvg * TOURNAMENT_LOW_CARD_FACTOR * 4) : null,
    goalkeeperRaw: averages.savesFor ?? averages.saves,
    chanceCreationRaw: chancesPerMatch != null
      ? chancesPerMatch * 8 + (playerAssists ?? 0) / teamTotal.matchesPlayed * 5
      : null,
    formRaw: ppg * 22 + (gdPerMatch ?? 0) * 12 + (averages.goalsFor ?? 0) * 6 - (averages.goalsAgainst ?? 0) * 5,
  };
}

function blendRaw(clubRaw, liveRaw, matchesPlayed, clubWeight, liveWeight) {
  if (!matchesPlayed || liveRaw == null) return clubRaw;
  if (clubRaw == null) return liveRaw;
  return (clubRaw * clubWeight) + (liveRaw * liveWeight);
}

function normalizeDimension(teams, rawKey, scoreKey, invert = false) {
  const values = teams.map((team) => team._raw[rawKey]).filter((v) => v != null && Number.isFinite(v));
  if (!values.length) {
    teams.forEach((team) => { team.scores[scoreKey] = null; });
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  teams.forEach((team) => {
    const raw = team._raw[rawKey];
    if (raw == null || !Number.isFinite(raw)) {
      team.scores[scoreKey] = null;
      return;
    }
    let score = span > 0 ? ((raw - min) / span) * 100 : 50;
    if (invert) score = 100 - score;
    team.scores[scoreKey] = round(score, 1);
  });
}

function rankByScore(teams, scoreKey) {
  teams.slice()
    .sort((a, b) => (b.scores[scoreKey] ?? -1) - (a.scores[scoreKey] ?? -1))
    .forEach((team, index) => {
      const found = teams.find((t) => t.team === team.team);
      if (found) found.categoryRanks[scoreKey] = found.scores[scoreKey] != null ? index + 1 : null;
    });
}

function computeOverallPower(team) {
  const entries = Object.entries(DIMENSION_WEIGHTS).filter(([key]) => {
    if (key === 'currentFormRating' && team.scores.currentFormRating == null) return false;
    return team.scores[key] != null;
  });
  if (!entries.length) return null;

  const weightTotal = entries.reduce((total, [, weight]) => total + weight, 0);
  const weighted = entries.reduce((total, [key, weight]) => total + (team.scores[key] * weight), 0);
  return round(weighted / weightTotal, 1);
}

export function buildPowerRankings({
  exportedAt,
  teamStats,
  playerStats,
  matchResults,
  refereeSummary,
  completedMatchesProcessed = 0,
}) {
  const clubDataset = loadClubPlayerDataset();
  const teamTotalsMap = indexTeamTotals(teamStats?.teamTotals);
  const playerTotalsMap = indexPlayerTotals(playerStats?.playerTotals);
  const lowCardTournament = refereeSummary?.tournamentAverageYellowCards != null
    && refereeSummary.tournamentAverageYellowCards < 3.5;

  const teams = getOfficialTeamNames().map((officialTeam) => {
    const club = aggregateClubBaseline(clubDataset.players, officialTeam);
    const live = aggregateLiveBaseline(
      teamTotalsMap.get(officialTeam),
      playerTotalsMap.get(officialTeam),
      matchResults?.matches,
      officialTeam,
    );

    const mp = live.matchesPlayed || 0;

    return {
      team: officialTeam,
      group: getOfficialGroup(officialTeam),
      worldCupMatchesPlayed: mp,
      dataSource: mp > 0 ? 'club-plus-round1' : 'club-baseline',
      clubBaseline: club,
      liveTournament: mp > 0 ? live : null,
      _liveRaw: {
        attackRating: live.attackRaw,
        defenceRating: live.defenceRaw,
        finishingRating: live.finishingRaw,
        cornerRating: live.cornersRaw,
        disciplineRating: live.disciplineRaw,
        goalkeeperRating: live.goalkeeperRaw,
        chanceCreationRating: live.chanceCreationRaw,
        currentFormRating: live.formRaw,
      },
      _raw: {
        attackRating: blendRaw(club.attackRaw, live.attackRaw, mp, CLUB_WEIGHT_DEFAULT, LIVE_WEIGHT_DEFAULT),
        defenceRating: blendRaw(club.defenceRaw, live.defenceRaw, mp, CLUB_WEIGHT_DEFAULT, LIVE_WEIGHT_DEFAULT),
        finishingRating: blendRaw(club.finishingRaw, live.finishingRaw, mp, CLUB_WEIGHT_DEFAULT, LIVE_WEIGHT_DEFAULT),
        cornerRating: blendRaw(club.cornersRaw, live.cornersRaw, mp, CLUB_WEIGHT_GK_CORNERS, LIVE_WEIGHT_GK_CORNERS),
        disciplineRating: blendRaw(club.disciplineRaw, live.disciplineRaw, mp, CLUB_WEIGHT_CARDS, LIVE_WEIGHT_CARDS),
        goalkeeperRating: blendRaw(club.goalkeeperRaw, live.goalkeeperRaw, mp, CLUB_WEIGHT_GK_CORNERS, LIVE_WEIGHT_GK_CORNERS),
        chanceCreationRating: blendRaw(club.chanceCreationRaw, live.chanceCreationRaw, mp, CLUB_WEIGHT_DEFAULT, LIVE_WEIGHT_DEFAULT),
        currentFormRating: mp > 0 ? live.formRaw : null,
      },
      scores: {},
      categoryRanks: {},
    };
  });

  const dimensions = [
    ['attackRating', 'attackRating'],
    ['defenceRating', 'defenceRating'],
    ['chanceCreationRating', 'chanceCreationRating'],
    ['finishingRating', 'finishingRating'],
    ['cornerRating', 'cornerRating'],
    ['disciplineRating', 'disciplineRating'],
    ['goalkeeperRating', 'goalkeeperRating'],
    ['currentFormRating', 'currentFormRating'],
  ];

  dimensions.forEach(([rawKey, scoreKey]) => {
    normalizeDimension(teams, rawKey, scoreKey);
    rankByScore(teams, scoreKey);
  });

  teams.forEach((team) => {
    team.overallPowerScore = computeOverallPower(team);
  });

  teams.sort((a, b) => (b.overallPowerScore ?? -1) - (a.overallPowerScore ?? -1));
  teams.forEach((team, index) => {
    team.overallRank = team.overallPowerScore != null ? index + 1 : null;
  });

  const rankings = teams.map((team) => ({
    rank: team.overallRank,
    team: team.team,
    group: team.group,
    overallPowerScore: team.overallPowerScore,
    attackRating: team.scores.attackRating,
    defenceRating: team.scores.defenceRating,
    chanceCreationRating: team.scores.chanceCreationRating,
    finishingRating: team.scores.finishingRating,
    cornerRating: team.scores.cornerRating,
    disciplineRating: team.scores.disciplineRating,
    goalkeeperRating: team.scores.goalkeeperRating,
    currentFormRating: team.scores.currentFormRating,
    worldCupMatchesPlayed: team.worldCupMatchesPlayed,
    dataSource: team.dataSource,
    categoryRanks: team.categoryRanks,
  }));

  const teamStrength = {
    version: POWER_RANKINGS_VERSION,
    exportedAt,
    methodology: {
      description: 'EdgeStats-only model: 65% club-season player data, 35% World Cup Round 1 (50/50 for GK and corners).',
      clubDataset: clubDataset.source,
      excludes: ['FIFA rankings', 'bookmaker odds', 'simulated match data'],
      blend: {
        default: `${CLUB_WEIGHT_DEFAULT * 100}% club / ${LIVE_WEIGHT_DEFAULT * 100}% Round 1`,
        goalkeeperAndCorners: `${CLUB_WEIGHT_GK_CORNERS * 100}% club / ${LIVE_WEIGHT_GK_CORNERS * 100}% Round 1`,
        discipline: `${Math.round(CLUB_WEIGHT_CARDS * 100)}% club / ${Math.round(LIVE_WEIGHT_CARDS * 100)}% Round 1 with low-card tournament adjustment`,
      },
      lowCardTournamentAdjustment: lowCardTournament ? TOURNAMENT_LOW_CARD_FACTOR : 1,
      weights: DIMENSION_WEIGHTS,
    },
    teamsRanked: teams.length,
    completedMatchesInPool: completedMatchesProcessed,
    teams: teams.map((team) => ({
      team: team.team,
      group: team.group,
      overallRank: team.overallRank,
      overallPowerScore: team.overallPowerScore,
      worldCupMatchesPlayed: team.worldCupMatchesPlayed,
      dataSource: team.dataSource,
      ratings: {
        attackRating: {
          combined: team.scores.attackRating,
          club: round(team.clubBaseline.attackRaw, 2),
          round1: round(team.liveTournament?.attackRaw ?? null, 2),
          rank: team.categoryRanks.attackRating,
        },
        defenceRating: {
          combined: team.scores.defenceRating,
          club: round(team.clubBaseline.defenceRaw, 2),
          round1: round(team.liveTournament?.defenceRaw ?? null, 2),
          rank: team.categoryRanks.defenceRating,
        },
        chanceCreationRating: {
          combined: team.scores.chanceCreationRating,
          club: round(team.clubBaseline.chanceCreationRaw, 2),
          round1: round(team.liveTournament?.chanceCreationRaw ?? null, 2),
          rank: team.categoryRanks.chanceCreationRating,
        },
        finishingRating: {
          combined: team.scores.finishingRating,
          club: round(team.clubBaseline.finishingRaw, 2),
          round1: round(team.liveTournament?.finishingRaw ?? null, 2),
          rank: team.categoryRanks.finishingRating,
        },
        cornerRating: {
          combined: team.scores.cornerRating,
          club: round(team.clubBaseline.cornersRaw, 2),
          round1: round(team.liveTournament?.cornersRaw ?? null, 2),
          rank: team.categoryRanks.cornerRating,
        },
        disciplineRating: {
          combined: team.scores.disciplineRating,
          club: round(team.clubBaseline.disciplineRaw, 2),
          round1: round(team.liveTournament?.disciplineRaw ?? null, 2),
          rank: team.categoryRanks.disciplineRating,
        },
        goalkeeperRating: {
          combined: team.scores.goalkeeperRating,
          club: round(team.clubBaseline.goalkeeperRaw, 2),
          round1: round(team.liveTournament?.goalkeeperRaw ?? null, 2),
          rank: team.categoryRanks.goalkeeperRating,
        },
        currentFormRating: {
          combined: team.scores.currentFormRating,
          club: null,
          round1: round(team.liveTournament?.formRaw ?? null, 2),
          rank: team.categoryRanks.currentFormRating,
        },
      },
      clubBaseline: team.clubBaseline,
      round1Tournament: team.liveTournament,
      categoryRanks: team.categoryRanks,
    })),
  };

  const powerRankings = {
    version: POWER_RANKINGS_VERSION,
    exportedAt,
    methodology: teamStrength.methodology.description,
    dataSources: {
      clubPlayerDataset: clubDataset.source,
      liveTeamStats: 'data/worldcup-live/worldcup-live-team-stats.json',
      livePlayerStats: 'data/worldcup-live/worldcup-live-player-stats.json',
      liveRefereeStats: 'data/worldcup-live/worldcup-live-referee-stats.json',
    },
    teamsRanked: teams.length,
    completedMatchesInPool: completedMatchesProcessed,
    rankings,
  };

  return {
    powerRankings,
    teamStrength,
    powerSummary: {
      topOverall: rankings.slice(0, 5).map((row) => ({
        rank: row.rank,
        team: row.team,
        overallPowerScore: row.overallPowerScore,
      })),
      teamsWithRound1Form: rankings.filter((row) => row.currentFormRating != null).length,
      teamsClubBaselineOnly: rankings.filter((row) => row.worldCupMatchesPlayed === 0).length,
    },
  };
}
