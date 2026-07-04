/**
 * Build EdgeStats_AI_Master_Model.json — complete project knowledge export for AI analysis.
 * Merges every stored JSON dataset without truncation or null removal.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OFFICIAL_WC2026_GROUPS } from '../../api/_lib/wc2026-official-teams.js';
import { resolveOfficialTeamName } from './power-rankings-lib.js';
import { buildModelMetadata } from './model-metadata-export-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const LIVE_DIR = __dirname;

const SOURCE_FILES = [
  { key: 'worldcupLiveSummary', path: 'data/worldcup-live/worldcup-live-summary.json' },
  { key: 'worldcupLiveRound1Analysis', path: 'data/worldcup-live/worldcup-live-round1-analysis.json' },
  { key: 'worldcupLiveCardTrends', path: 'data/worldcup-live/worldcup-live-card-trends.json' },
  { key: 'worldcupLiveCornerTrends', path: 'data/worldcup-live/worldcup-live-corner-trends.json' },
  { key: 'worldcupLiveGoalkeeperRankings', path: 'data/worldcup-live/worldcup-live-goalkeeper-rankings.json' },
  { key: 'worldcupLiveTeamStrength', path: 'data/worldcup-live/worldcup-live-team-strength.json' },
  { key: 'worldcupLivePowerRankings', path: 'data/worldcup-live/worldcup-live-power-rankings.json' },
  { key: 'worldcupLiveRefereeStats', path: 'data/worldcup-live/worldcup-live-referee-stats.json' },
  { key: 'worldcupLivePlayerStats', path: 'data/worldcup-live/worldcup-live-player-stats.json' },
  { key: 'worldcupLiveTeamStats', path: 'data/worldcup-live/worldcup-live-team-stats.json' },
  { key: 'worldcupLiveMatchResults', path: 'data/worldcup-live/worldcup-live-match-results.json' },
  { key: 'worldcupLiveCombinedAnalysis', path: 'data/worldcup-live/worldcup-live-combined-analysis.json' },
  { key: 'edgeStatsModelMetadata', path: 'data/worldcup-live/EdgeStats_Model_Metadata.json' },
  { key: 'edgeStatsMasterGroupStageComplete', path: 'data/worldcup-live/EdgeStats_Master_GroupStage_Complete.json' },
  { key: 'homepageRankings', path: 'data/homepage-rankings.json' },
  { key: 'clubPlayerDataset', path: 'video-data/wc2026-full-player-data.json' },
];

function readJson(relativePath) {
  const path = join(ROOT, relativePath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function indexByTeam(rows, teamField = 'team') {
  const map = new Map();
  for (const row of rows || []) {
    const key = resolveOfficialTeamName(row[teamField]);
    if (key) map.set(key, row);
  }
  return map;
}

function indexArrayByTeam(rows, teamField = 'team') {
  const map = new Map();
  for (const row of rows || []) {
    const key = resolveOfficialTeamName(row[teamField]);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function indexPlayers(playerTotals, playerMatchStats) {
  const totalsById = new Map();
  const totalsByNameTeam = new Map();
  const matchStatsById = new Map();

  for (const row of playerTotals || []) {
    if (row.playerId != null) totalsById.set(row.playerId, row);
    const key = `${(row.playerName || '').toLowerCase()}::${resolveOfficialTeamName(row.team)}`;
    totalsByNameTeam.set(key, row);
    if (row.playerId != null) {
      if (!matchStatsById.has(row.playerId)) matchStatsById.set(row.playerId, []);
    }
  }

  for (const row of playerMatchStats || []) {
    if (row.playerId == null) continue;
    if (!matchStatsById.has(row.playerId)) matchStatsById.set(row.playerId, []);
    matchStatsById.get(row.playerId).push(row);
  }

  return { totalsById, totalsByNameTeam, matchStatsById };
}

function buildGroupStandings(teamTotals) {
  const teamIndex = indexByTeam(teamTotals);
  return OFFICIAL_WC2026_GROUPS.map(({ group, teams }) => ({
    group,
    standings: teams.map((team) => {
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
        teamTotals: stats,
      };
    }).sort((a, b) => {
      if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
      if ((b.goalDifference ?? 0) !== (a.goalDifference ?? 0)) {
        return (b.goalDifference ?? 0) - (a.goalDifference ?? 0);
      }
      return (b.goalsFor ?? 0) - (a.goalsFor ?? 0);
    }).map((row, index) => ({ ...row, groupFinish: index + 1 })),
  }));
}

function buildMatchesEnriched(matchResults, teamMatchStats) {
  const statsByMatch = indexArrayByTeam(
    (teamMatchStats || []).map((r) => ({ ...r, team: r.team })),
    'team',
  );

  const byMatchId = new Map();
  for (const row of teamMatchStats || []) {
    if (!byMatchId.has(row.matchId)) byMatchId.set(row.matchId, []);
    byMatchId.get(row.matchId).push(row);
  }

  return (matchResults?.matches || []).map((match) => ({
    ...match,
    lineups: null,
    halftimeScore: null,
    offsides: null,
    tackles: null,
    interceptions: null,
    clearances: null,
    blockedShots: null,
    shotsOffTarget: null,
    motm: null,
    teamMatchStats: byMatchId.get(match.matchId) || [],
    fieldsNotStoredInProject: [
      'lineups',
      'halftimeScore',
      'offsides',
      'tackles',
      'interceptions',
      'clearances',
      'blockedShots',
      'shotsOffTarget',
      'motm',
    ],
  }));
}

function buildTeamsMerged(sources) {
  const {
    teamTotals,
    teamStrengthTeams,
    powerRankings,
    cornerTrends,
    cardTrends,
    masterTeamDatabase,
  } = sources;

  const strengthByTeam = indexByTeam(teamStrengthTeams);
  const powerByTeam = indexByTeam(powerRankings?.rankings);
  const cornerByTeam = indexByTeam(cornerTrends?.teams);
  const cardByTeam = indexByTeam(cardTrends?.teams);
  const masterByTeam = indexByTeam(masterTeamDatabase);
  const totalsByTeam = indexByTeam(teamTotals);

  return OFFICIAL_WC2026_GROUPS.flatMap((g) => g.teams).map((team) => {
    const totals = totalsByTeam.get(team) || null;
    const strength = strengthByTeam.get(team) || null;
    const power = powerByTeam.get(team) || null;
    const corner = cornerByTeam.get(team) || null;
    const card = cardByTeam.get(team) || null;
    const master = masterByTeam.get(team) || null;

    return {
      team,
      group: strength?.group ?? power?.group ?? null,
      officialGroup: OFFICIAL_WC2026_GROUPS.find((g) => g.teams.includes(team))?.group ?? null,
      tournamentTotals: totals,
      powerRanking: power,
      teamStrength: strength,
      cornerTrends: corner,
      cardTrends: card,
      masterGroupStageRecord: master,
      ratings: {
        overallPower: power?.overallPowerScore ?? strength?.overallPowerScore ?? null,
        attackRating: power?.attackRating ?? strength?.ratings?.attackRating?.combined ?? null,
        defenceRating: power?.defenceRating ?? strength?.ratings?.defenceRating?.combined ?? null,
        midfieldRating: null,
        goalkeeperRating: power?.goalkeeperRating ?? strength?.ratings?.goalkeeperRating?.combined ?? null,
        setPieceRating: power?.cornerRating ?? strength?.ratings?.cornerRating?.combined ?? null,
        disciplineRating: power?.disciplineRating ?? strength?.ratings?.disciplineRating?.combined ?? null,
        formRating: power?.currentFormRating ?? strength?.ratings?.currentFormRating?.combined ?? null,
        chanceCreationRating: power?.chanceCreationRating ?? strength?.ratings?.chanceCreationRating?.combined ?? null,
        finishingRating: power?.finishingRating ?? strength?.ratings?.finishingRating?.combined ?? null,
        pressingRating: null,
      },
      categoryRanks: power?.categoryRanks ?? strength?.categoryRanks ?? null,
      ratingsBreakdown: strength?.ratings ?? null,
      clubBaseline: strength?.clubBaseline ?? null,
      liveTournament: strength?.round1Tournament ?? null,
      qualified: master?.qualified ?? null,
      eliminated: master?.eliminated ?? null,
      groupFinish: master?.groupFinish ?? null,
      homeAway: null,
      currentStreak: null,
      goalsFor: totals?.goalsFor ?? null,
      goalsAgainst: totals?.goalsAgainst ?? null,
      shotConversion: totals?.finishingEfficiency ?? null,
      cleanSheets: totals?.cleanSheets ?? null,
      worldCupMatchesPlayed: power?.worldCupMatchesPlayed ?? totals?.matchesPlayed ?? null,
      dataSource: power?.dataSource ?? null,
    };
  });
}

function buildPlayersMerged(clubDataset, playerStats) {
  const { totalsById, totalsByNameTeam, matchStatsById } = indexPlayers(
    playerStats?.playerTotals,
    playerStats?.matchStats,
  );

  const merged = (clubDataset?.players || []).map((player) => {
    let wcTotal = totalsById.get(player.id);
    if (!wcTotal) {
      const key = `${(player.name || '').toLowerCase()}::${resolveOfficialTeamName(player.country || player.team)}`;
      wcTotal = totalsByNameTeam.get(key) ?? null;
    }

    return {
      ...player,
      worldCupStatistics: wcTotal,
      worldCupMatchStatistics: player.id != null ? (matchStatsById.get(player.id) || []) : [],
      form: null,
    };
  });

  const clubIds = new Set((clubDataset?.players || []).map((p) => p.id));
  for (const row of playerStats?.playerTotals || []) {
    if (row.playerId != null && !clubIds.has(row.playerId)) {
      merged.push({
        id: row.playerId,
        name: row.playerName,
        country: row.team,
        team: row.team,
        position: row.position,
        club: null,
        clubSeasonProfile: null,
        worldCupStatistics: row,
        worldCupMatchStatistics: matchStatsById.get(row.playerId) || [],
        form: null,
        note: 'Tournament-only player not in club player dataset',
      });
    }
  }

  return merged;
}

function buildLeaderboards(playerStats, teamStats, powerRankings, gkRankings, homepageRankings) {
  const sortPlayers = (field) => (playerStats?.playerTotals || [])
    .filter((p) => p[field] != null)
    .slice()
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));

  const sortTeams = (field) => (teamStats?.teamTotals || [])
    .filter((t) => t[field] != null)
    .slice()
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));

  const power = powerRankings?.rankings || [];
  const byCategory = (key) => power.slice().sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1));

  return {
    teamPowerRankings: power,
    offensiveRankings: byCategory('attackRating'),
    defensiveRankings: byCategory('defenceRating'),
    goalkeeperRankings: gkRankings,
    formRankings: byCategory('currentFormRating'),
    disciplineRankings: byCategory('disciplineRating'),
    cornerRankings: byCategory('cornerRating'),
    finishingRankings: byCategory('finishingRating'),
    chanceCreationRankings: byCategory('chanceCreationRating'),
    shotRankings: sortTeams('shots'),
    possessionRankings: sortTeams('possessionAverage'),
    playerGoalRankings: sortPlayers('goals'),
    playerAssistRankings: sortPlayers('assists'),
    playerSaveRankings: sortPlayers('saves'),
    playerShotRankings: sortPlayers('shots'),
    playerShotsOnTargetRankings: sortPlayers('shotsOnTarget'),
    playerChancesCreatedRankings: sortPlayers('chancesCreated'),
    playerMinutesRankings: sortPlayers('minutes'),
    playerCardsRankings: sortPlayers('yellowCards'),
    homepageRankings: homepageRankings?.categories ?? homepageRankings,
    playersToWatch: null,
  };
}

export function buildAiMasterModel() {
  const verbatimSourceExports = {};
  const loaded = {};

  for (const { key, path } of SOURCE_FILES) {
    const data = readJson(path);
    verbatimSourceExports[key] = data;
    loaded[key] = data;
  }

  const modelMetadata = loaded.edgeStatsModelMetadata ?? buildModelMetadata();
  const summary = loaded.worldcupLiveSummary;
  const matchResults = loaded.worldcupLiveMatchResults;
  const teamStats = loaded.worldcupLiveTeamStats;
  const playerStats = loaded.worldcupLivePlayerStats;
  const powerRankings = loaded.worldcupLivePowerRankings;
  const teamStrength = loaded.worldcupLiveTeamStrength;
  const cornerTrends = loaded.worldcupLiveCornerTrends;
  const cardTrends = loaded.worldcupLiveCardTrends;
  const gkRankings = loaded.worldcupLiveGoalkeeperRankings;
  const round1Analysis = loaded.worldcupLiveRound1Analysis;
  const refereeStats = loaded.worldcupLiveRefereeStats;
  const clubDataset = loaded.clubPlayerDataset;
  const homepageRankings = loaded.homepageRankings;
  const masterExport = loaded.edgeStatsMasterGroupStageComplete;

  const groupStandings = buildGroupStandings(teamStats?.teamTotals);
  const knockoutSummary = masterExport?.knockoutReadySummary ?? null;

  return {
    fileName: 'EdgeStats_AI_Master_Model.json',

    metadata: {
      exportTimestamp: new Date().toISOString(),
      purpose: 'Complete EdgeStats project knowledge export for ChatGPT model analysis and improvement',
      projectVersion: readJson('package.json')?.version ?? null,
      modelVersion: modelMetadata?.modelVersion ?? null,
      liveExportVersion: summary?.version ?? null,
      powerRankingsVersion: powerRankings?.version ?? null,
      clubDatasetExportedAt: clubDataset?.exportedAt ?? null,
      homepageRankingsVersion: homepageRankings?.version ?? null,
      homepageRankingsBuiltAt: homepageRankings?.builtAt ?? null,
      liveExportTimestamp: summary?.exportedAt ?? null,
      sourceFilesMerged: SOURCE_FILES.map((f) => f.path),
      dataIntegrity: {
        completedMatchesOnlyInLiveExport: true,
        simulatedDataIncluded: false,
        nullValuesPreserved: true,
        arraysNotTruncated: true,
        skippedUpcomingFixtures: summary?.skippedUpcoming ?? null,
        skippedLiveFixtures: summary?.skippedLive ?? null,
        missingFieldsInLiveExport: summary?.missingFields ?? null,
      },
      implementationMap: modelMetadata?.implementationMap ?? null,
    },

    tournament: {
      name: 'FIFA World Cup 2026',
      status: 'Knockout Stage',
      currentRound: 'Knockout Stage',
      groupStageComplete: true,
      league: summary?.league ?? null,
      season: summary?.season ?? null,
      matchesChecked: summary?.matchesChecked ?? null,
      completedMatchesProcessed: summary?.completedMatchesProcessed ?? null,
      totalGoals: masterExport?.tournamentInfo?.totalGoals ?? null,
      totalCards: masterExport?.tournamentInfo?.totalCards ?? null,
      totalYellowCards: masterExport?.tournamentInfo?.totalYellowCards ?? null,
      totalRedCards: masterExport?.tournamentInfo?.totalRedCards ?? null,
      totalPenalties: null,
      qualifiedTeams: knockoutSummary?.qualifiedTeams ?? null,
      eliminatedTeams: knockoutSummary?.eliminatedTeams ?? null,
      officialGroups: OFFICIAL_WC2026_GROUPS,
      refereeSummary: summary?.refereeSummary ?? null,
      powerSummary: summary?.powerSummary ?? null,
    },

    model: modelMetadata,

    powerRankings: {
      fullExport: powerRankings,
      teamStrengthFullExport: teamStrength,
    },

    fixtures: {
      remainingFixtures: null,
      matchSchedule: null,
      note: `${summary?.skippedUpcoming ?? 0} upcoming fixtures exist in API but are not stored in project JSON exports (live export includes completed matches only)`,
      completedMatchCount: matchResults?.matches?.length ?? null,
    },

    results: {
      matchResultsFullExport: matchResults,
      round1AnalysisFullExport: round1Analysis,
      knockoutReadySummary: knockoutSummary,
    },

    teams: buildTeamsMerged({
      teamTotals: teamStats?.teamTotals,
      teamStrengthTeams: teamStrength?.teams,
      powerRankings,
      cornerTrends,
      cardTrends,
      masterTeamDatabase: masterExport?.teamDatabase,
    }),

    players: buildPlayersMerged(clubDataset, playerStats),

    matches: buildMatchesEnriched(matchResults, teamStats?.matchStats),

    groupStandings,

    knockoutBracket: {
      bracket: null,
      qualifiedTeams: knockoutSummary?.qualifiedTeams ?? null,
      eliminatedTeams: knockoutSummary?.eliminatedTeams ?? null,
      note: 'Knockout bracket pairings not stored in project JSON; qualified/eliminated lists derived from group standings in EdgeStats_Master_GroupStage_Complete.json',
    },

    predictions: {
      implementedInProject: false,
      matchOutcomePredictions: null,
      scorelinePredictions: null,
      winDrawLossProbabilities: null,
      cardMarketSignalsByMatch: (matchResults?.matches || []).map((m) => ({
        matchId: m.matchId,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        cardMarketSignal: m.cardMarketSignal ?? null,
      })),
      projectedRound2CornerStrength: cornerTrends?.teams ?? null,
      projectedRound2CardRisk: cardTrends?.teams ?? null,
      projectedRound2SaveStrength: gkRankings?.goalkeepers ?? null,
    },

    form: {
      round1AnalysisFullExport: round1Analysis,
      formRankings: (powerRankings?.rankings || [])
        .slice()
        .sort((a, b) => (b.currentFormRating ?? -1) - (a.currentFormRating ?? -1)),
      teamsTrendingUpward: knockoutSummary?.teamsTrendingUpward ?? null,
      teamsTrendingDownward: knockoutSummary?.teamsTrendingDownward ?? null,
    },

    statistics: {
      teamStatsFullExport: teamStats,
      playerStatsFullExport: playerStats,
      refereeStatsFullExport: refereeStats,
      clubPlayerDatasetMeta: {
        exportedAt: clubDataset?.exportedAt ?? null,
        source: clubDataset?.source ?? null,
        sourceDataset: clubDataset?.sourceDataset ?? null,
        sourceNote: clubDataset?.sourceNote ?? null,
        totals: clubDataset?.totals ?? null,
        groups: clubDataset?.groups ?? null,
        teams: clubDataset?.teams ?? null,
      },
    },

    derivedMetrics: {
      cornerTrendsFullExport: cornerTrends,
      cardTrendsFullExport: cardTrends,
      goalkeeperRankingsFullExport: gkRankings,
      round1AnalysisFullExport: round1Analysis,
      leaderboards: buildLeaderboards(
        playerStats,
        teamStats,
        powerRankings,
        gkRankings,
        homepageRankings,
      ),
      masterGroupStageKnockoutSummary: knockoutSummary,
    },

    confidenceModel: modelMetadata?.confidenceModel ?? {
      implementedInProject: false,
      minimumConfidence: null,
      maximumConfidence: null,
      increasesConfidence: null,
      decreasesConfidence: null,
      conversionToOutOf10: null,
    },

    history: {
      exportNotes: summary?.notes ?? null,
      modelFutureNotes: modelMetadata?.futureNotes ?? null,
      worldcupLiveReadmeNotes: [
        'World Cup live exports not connected to website',
        'Designed for Round 2 predictions with club-season + live blend',
        'Card market signals for future card prediction work',
      ],
      exportTimeline: {
        clubPlayerDataset: clubDataset?.exportedAt ?? null,
        homepageRankings: homepageRankings?.builtAt ?? null,
        worldcupLiveExport: summary?.exportedAt ?? null,
        modelMetadataExport: modelMetadata?.modelVersion?.exportTimestamp ?? null,
        masterGroupStageExport: masterExport?.tournamentInfo?.exportTimestamp ?? null,
        aiMasterModelExport: new Date().toISOString(),
      },
    },

    verbatimSourceExports,
  };
}
