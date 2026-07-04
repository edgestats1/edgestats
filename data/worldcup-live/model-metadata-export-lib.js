/**
 * Export EdgeStats_Model_Metadata.json — complete model logic documentation.
 * Reads source constants/formulas and current team-strength snapshots only.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const LIVE_DIR = join(__dirname);

const POWER_RANKINGS_VERSION = 'wc2026-live-power-rankings-v2';
const EXPORT_VERSION = 'wc2026-live-export-v4';
const ROUND1_EXPORT_VERSION = 'wc2026-live-round1-v1';

const CLUB_WEIGHT_DEFAULT = 0.65;
const LIVE_WEIGHT_DEFAULT = 0.35;
const CLUB_WEIGHT_GK_CORNERS = 0.50;
const LIVE_WEIGHT_GK_CORNERS = 0.50;
const CLUB_WEIGHT_CARDS = 0.55;
const LIVE_WEIGHT_CARDS = 0.45;
const TOURNAMENT_LOW_CARD_FACTOR = 0.82;
const TOURNAMENT_LOW_CARD_YELLOW_THRESHOLD = 3.5;

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

function readJsonIfExists(relativePath) {
  const path = join(ROOT, relativePath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readLiveJson(filename) {
  return JSON.parse(readFileSync(join(LIVE_DIR, filename), 'utf8'));
}

export function buildModelMetadata() {
  const summary = readLiveJson('worldcup-live-summary.json');
  const teamStrength = readLiveJson('worldcup-live-team-strength.json');
  const packageJson = readJsonIfExists('package.json');

  return {
    fileName: 'EdgeStats_Model_Metadata.json',

    modelVersion: {
      modelVersion: POWER_RANKINGS_VERSION,
      buildDate: teamStrength.exportedAt ?? summary.exportedAt ?? null,
      projectVersion: packageJson?.version ?? null,
      tournamentStage: 'Knockout Stage',
      exportTimestamp: new Date().toISOString(),
      liveExportVersion: EXPORT_VERSION,
      round1DerivedExportVersion: ROUND1_EXPORT_VERSION,
    },

    dataSources: [
      {
        filePath: 'video-data/wc2026-full-player-data.json',
        purpose: 'Club-season player squad statistics for all 48 nations; primary input to club baseline power ratings',
        updateFrequency: 'manual static export (official-48-team-build pipeline)',
        liveOrStatic: 'static',
        priorityLevel: 1,
        usedBy: ['power-rankings-lib.js', 'master-groupstage-export-lib.js'],
      },
      {
        filePath: 'data/homepage-rankings.json',
        purpose: 'Fallback club player dataset if video-data export missing; homepage category rankings (top goalscorers, assists, etc.)',
        updateFrequency: 'manual via npm run build:homepage-rankings',
        liveOrStatic: 'static',
        priorityLevel: 2,
        usedBy: ['power-rankings-lib.js', 'api/_lib/homepage-rankings-debug.js', 'homepage UI'],
      },
      {
        filePath: 'data/worldcup-live/worldcup-live-team-stats.json',
        purpose: 'Completed World Cup 2026 team match stats and aggregated tournament totals',
        updateFrequency: 'manual via npm run update-worldcup-live-stats',
        liveOrStatic: 'live-export',
        priorityLevel: 1,
        usedBy: ['power-rankings-lib.js', 'round1-exports-lib.js', 'export-lib.js'],
      },
      {
        filePath: 'data/worldcup-live/worldcup-live-player-stats.json',
        purpose: 'Completed World Cup 2026 player match stats and aggregated tournament totals',
        updateFrequency: 'manual via npm run update-worldcup-live-stats',
        liveOrStatic: 'live-export',
        priorityLevel: 1,
        usedBy: ['power-rankings-lib.js', 'round1-exports-lib.js'],
      },
      {
        filePath: 'data/worldcup-live/worldcup-live-match-results.json',
        purpose: 'Completed match results, scorers, referee blocks, card market signals',
        updateFrequency: 'manual via npm run update-worldcup-live-stats',
        liveOrStatic: 'live-export',
        priorityLevel: 1,
        usedBy: ['power-rankings-lib.js', 'export-lib.js', 'round1-exports-lib.js'],
      },
      {
        filePath: 'data/worldcup-live/worldcup-live-referee-stats.json',
        purpose: 'Aggregated referee tournament totals and style classification inputs',
        updateFrequency: 'manual via npm run update-worldcup-live-stats',
        liveOrStatic: 'live-export',
        priorityLevel: 2,
        usedBy: ['power-rankings-lib.js', 'round1-exports-lib.js'],
      },
      {
        filePath: 'api/_lib/wc2026-official-teams.js',
        purpose: 'Official 48-nation group list and API name aliasing',
        updateFrequency: 'static code',
        liveOrStatic: 'static',
        priorityLevel: 1,
        usedBy: ['power-rankings-lib.js', 'homepage-rankings-debug.js', 'export-lib.js'],
      },
      {
        filePath: 'API-Football (league=1, season=2026)',
        purpose: 'Source for live World Cup fixtures, statistics, players, events at export time',
        updateFrequency: 'on-demand when update-worldcup-live-stats runs',
        liveOrStatic: 'live',
        priorityLevel: 1,
        usedBy: ['export-lib.js', 'homepage-rankings-debug.js'],
      },
      {
        filePath: 'data/worldcup-live/worldcup-live-power-rankings.json',
        purpose: 'Output of power ranking model (not an input to itself)',
        updateFrequency: 'regenerated with update-worldcup-live-stats',
        liveOrStatic: 'derived-export',
        priorityLevel: null,
        usedBy: ['round1-exports-lib.js', 'master-groupstage-export-lib.js'],
      },
      {
        filePath: 'data/worldcup-live/worldcup-live-team-strength.json',
        purpose: 'Detailed per-team rating breakdown output',
        updateFrequency: 'regenerated with update-worldcup-live-stats',
        liveOrStatic: 'derived-export',
        priorityLevel: null,
        usedBy: ['master-groupstage-export-lib.js'],
      },
    ],

    weightingSystem: {
      clubSeasonWeight: CLUB_WEIGHT_DEFAULT,
      worldCupWeight: LIVE_WEIGHT_DEFAULT,
      recentMatchWeight: null,
      currentFormWeight: DIMENSION_WEIGHTS.currentFormRating,
      goalkeeperWeight: DIMENSION_WEIGHTS.goalkeeperRating,
      defensiveWeight: DIMENSION_WEIGHTS.defenceRating,
      finishingWeight: DIMENSION_WEIGHTS.finishingRating,
      disciplineWeight: DIMENSION_WEIGHTS.disciplineRating,
      attackWeight: DIMENSION_WEIGHTS.attackRating,
      chanceCreationWeight: DIMENSION_WEIGHTS.chanceCreationRating,
      cornerWeight: DIMENSION_WEIGHTS.cornerRating,
      homeAdvantageWeight: null,
      blendByDimension: {
        default: { club: CLUB_WEIGHT_DEFAULT, worldCup: LIVE_WEIGHT_DEFAULT },
        goalkeeperAndCorners: { club: CLUB_WEIGHT_GK_CORNERS, worldCup: LIVE_WEIGHT_GK_CORNERS },
        discipline: { club: CLUB_WEIGHT_CARDS, worldCup: LIVE_WEIGHT_CARDS },
      },
      dimensionWeights: DIMENSION_WEIGHTS,
      lowCardTournamentFactor: TOURNAMENT_LOW_CARD_FACTOR,
      lowCardTournamentYellowThreshold: TOURNAMENT_LOW_CARD_YELLOW_THRESHOLD,
      sourceFile: 'data/worldcup-live/power-rankings-lib.js',
    },

    powerRatingFormula: {
      sourceFile: 'data/worldcup-live/power-rankings-lib.js',
      blendRaw: {
        formula: 'combinedRaw = (clubRaw * clubWeight) + (liveRaw * liveWeight)',
        whenNoWorldCupMatches: 'combinedRaw = clubRaw',
        whenLiveRawNull: 'combinedRaw = clubRaw',
        whenClubRawNull: 'combinedRaw = liveRaw',
      },
      clubBaselineRaw: {
        attackRaw: '(squadGoals * 1.4) + (squadAssists * 1.0) + (squadChances * 0.55)',
        defenceRaw: 'minutes > 0 ? ((defMinutes + gkMinutes * 1.15) / minutes) * 55 + Math.max(0, 18 - (cardRate ?? 0) * 4) : null',
        finishingRaw: 'squadGoals > 0 && minutes90 != null ? (squadGoals / minutes90) * 20 : squadGoals * 0.5',
        cornersRaw: 'minutes90 != null ? squadCorners / minutes90 : squadCorners',
        cardsRaw: 'cardRate != null ? cardRate * 10 + (squadFoulsCommitted / Math.max(1, appearances)) * 0.35 : null',
        disciplineRaw: 'cardRate != null ? Math.max(0, 20 - cardRate * 8) : null',
        goalkeeperRaw: 'minutes > 0 ? (gkMinutes / minutes) * 45 : null',
        chanceCreationRaw: 'minutes90 != null ? (squadChances / minutes90) * 12 + (squadAssists / minutes90) * 8 : squadChances',
        cardRate: '(squadYellow + squadRed * 2) / appearances',
        minutes90: 'minutes / 90',
      },
      liveTournamentRaw: {
        attackRaw: '(averages.goalsFor ?? 0) * 18 + (averages.shotsOnTarget ?? 0) * 2.4 + (averages.shots ?? 0) * 0.35',
        defenceRaw: '28 - (averages.goalsAgainst ?? 0) * 9 + (averages.savesFor ?? averages.saves ?? 0) * 0.85',
        finishingRaw: 'finishingEfficiency != null ? finishingEfficiency * 25 : (averages.goalsFor ?? 0) * 12',
        cornersRaw: 'averages.cornersFor ?? averages.corners',
        cardsRaw: 'cardAvg != null ? cardAvg * TOURNAMENT_LOW_CARD_FACTOR * 2.2 : null',
        disciplineRaw: 'cardAvg != null ? Math.max(0, 18 - cardAvg * TOURNAMENT_LOW_CARD_FACTOR * 4) : null',
        goalkeeperRaw: 'averages.savesFor ?? averages.saves',
        chanceCreationRaw: 'chancesPerMatch != null ? chancesPerMatch * 8 + (playerAssists / matchesPlayed) * 5 : null',
        formRaw: 'ppg * 22 + (gdPerMatch ?? 0) * 12 + (averages.goalsFor ?? 0) * 6 - (averages.goalsAgainst ?? 0) * 5',
        finishingEfficiency: 'goalsFor / xGFor (from enrichTeamTotals in round1-exports-lib.js)',
        ppg: '(wins * 3 + draws) / matchesPlayed',
        gdPerMatch: 'goalDifference / matchesPlayed',
        chancesPerMatch: 'sum(player chancesCreated) / matchesPlayed',
      },
      normalization: {
        formula: 'score = span > 0 ? ((raw - min) / (max - min)) * 100 : 50',
        invertOption: 'score = 100 - score when invert=true (not used for current dimensions)',
        scope: 'min/max computed across all 48 official teams per dimension',
        rounding: '1 decimal place',
      },
      overallPower: {
        formula: 'overallPowerScore = sum(dimensionScore * dimensionWeight) / sum(dimensionWeight)',
        includedDimensions: 'all DIMENSION_WEIGHTS keys where score is not null; currentFormRating excluded when null',
        rounding: '1 decimal place',
      },
      ratings: {
        overallPower: 'computeOverallPower(team) — weighted average of normalized dimension scores',
        attackRating: 'normalizeDimension(team._raw.attackRating)',
        defenceRating: 'normalizeDimension(team._raw.defenceRating)',
        goalkeeperRating: 'normalizeDimension(team._raw.goalkeeperRating)',
        chanceCreationRating: 'normalizeDimension(team._raw.chanceCreationRating)',
        finishingRating: 'normalizeDimension(team._raw.finishingRating)',
        disciplineRating: 'normalizeDimension(team._raw.disciplineRating)',
        cornerRating: 'normalizeDimension(team._raw.cornerRating)',
        formRating: 'currentFormRating = normalizeDimension(live.formRaw) when worldCupMatchesPlayed > 0, else null',
      },
      excludes: ['FIFA rankings', 'bookmaker odds', 'simulated match data'],
    },

    matchPredictionModel: {
      implementedInProject: false,
      inputs: null,
      transformations: null,
      normalisation: null,
      probabilityCalculations: null,
      scorelineGeneration: null,
      drawAdjustment: null,
      goalExpectationCalculations: null,
      notes: 'No match outcome prediction, scoreline generation, or win/draw/loss probability model exists in the current codebase. Power ratings and card/corner/GK projection helpers exist but are not wired to a full match prediction pipeline.',
    },

    confidenceModel: {
      implementedInProject: false,
      minimumConfidence: null,
      maximumConfidence: null,
      increasesConfidence: null,
      decreasesConfidence: null,
      conversionToOutOf10: null,
      notes: 'No confidence scoring model or /10 confidence conversion exists in the current codebase.',
    },

    specialRules: {
      refereeStyleClassification: {
        sourceFile: 'data/worldcup-live/export-lib.js',
        function: 'calcRefereeStyle(totalYellowCards, totalFouls)',
        strict: 'yellow >= 6 OR foulsPerYellowCard <= 4',
        lowCard: 'yellow <= 2 OR foulsPerYellowCard >= 8',
        balanced: 'yellow >= 3 AND yellow <= 5',
        otherwise: null,
      },
      cardMarketSignal: {
        sourceFile: 'data/worldcup-live/export-lib.js',
        rawPlayerCardRisk: {
          primary: 'foulSum / 6.5 when player foulSum > 0',
          fallback: 'teamYellow + teamRed when foul data unavailable',
        },
        lowCardReferee: {
          refereeAdjustment: 'down',
          adjustedCardProjectionLow: 'rawPlayerCardRisk * 0.60',
          adjustedCardProjectionHigh: 'rawPlayerCardRisk * 0.75',
        },
        strictReferee: {
          refereeAdjustment: 'up',
          adjustedCardProjectionLow: 'rawPlayerCardRisk * 1.20',
          adjustedCardProjectionHigh: 'rawPlayerCardRisk * 1.35',
        },
        balancedReferee: {
          refereeAdjustment: 'neutral',
          adjustedCardProjectionLow: 'rawPlayerCardRisk * 0.95',
          adjustedCardProjectionHigh: 'rawPlayerCardRisk * 1.05',
        },
      },
      tournamentLowCardAdjustment: {
        sourceFile: 'data/worldcup-live/power-rankings-lib.js, round1-exports-lib.js',
        condition: 'refereeSummary.tournamentAverageYellowCards < 3.5',
        factor: TOURNAMENT_LOW_CARD_FACTOR,
        appliedTo: ['live cardsRaw', 'live disciplineRaw', 'projectedRound2CardRisk'],
      },
      goalkeeperCornerHigherLiveWeight: {
        clubWeight: CLUB_WEIGHT_GK_CORNERS,
        liveWeight: LIVE_WEIGHT_GK_CORNERS,
        dimensions: ['goalkeeperRating', 'cornerRating'],
      },
      disciplineSeparateBlend: {
        clubWeight: CLUB_WEIGHT_CARDS,
        liveWeight: LIVE_WEIGHT_CARDS,
        dimension: 'disciplineRating',
      },
      currentFormClubExcluded: {
        rule: 'currentFormRating uses live.formRaw only; no club-season form component',
      },
      projectedRound2SaveStrengthFallback: {
        sourceFile: 'data/worldcup-live/round1-exports-lib.js',
        rule: 'if power goalkeeperRating null, normalize saveRate across GKs to 0-100',
        formula: '((saveRate - min) / (max - min)) * 100, equal values => 50',
      },
      projectedRound2CornerStrengthFallback: {
        sourceFile: 'data/worldcup-live/round1-exports-lib.js',
        rule: 'if power cornerRating null, normalize cornerDominanceScore across teams',
        cornerDominanceScore: 'averageCornersFor - averageCornersAgainst (or averageCornersFor if against null)',
      },
      projectedRound2CardRisk: {
        sourceFile: 'data/worldcup-live/round1-exports-lib.js',
        formula: 'baseRisk * tournamentLowCardFactor',
        baseRisk: 'team.averages.yellowCards OR yellowCards / matchesPlayed',
      },
      recentUpsetAdjustment: null,
      redCardAdjustment: null,
      goalkeeperFormBonus: null,
      poorFinishingPenalty: null,
      smallSampleProtection: null,
      groupStageWeighting: {
        note: 'Live tournament weight applies to all completed World Cup matches in export pool (currently full group stage when complete). No separate group-stage vs knockout blend constant exists.',
        liveWeight: LIVE_WEIGHT_DEFAULT,
      },
      knockoutWeighting: null,
      rotationAdjustment: null,
    },

    teamPowerSnapshots: (teamStrength.teams || []).map((team) => ({
      team: team.team,
      group: team.group,
      overallRank: team.overallRank,
      overallPower: team.overallPowerScore,
      attack: team.ratings?.attackRating?.combined ?? null,
      defence: team.ratings?.defenceRating?.combined ?? null,
      goalkeeper: team.ratings?.goalkeeperRating?.combined ?? null,
      finishing: team.ratings?.finishingRating?.combined ?? null,
      chanceCreation: team.ratings?.chanceCreationRating?.combined ?? null,
      discipline: team.ratings?.disciplineRating?.combined ?? null,
      form: team.ratings?.currentFormRating?.combined ?? null,
      corner: team.ratings?.cornerRating?.combined ?? null,
      components: {
        ratingsBreakdown: team.ratings ?? null,
        clubBaseline: team.clubBaseline ?? null,
        liveTournament: team.round1Tournament ?? null,
        categoryRanks: team.categoryRanks ?? null,
        worldCupMatchesPlayed: team.worldCupMatchesPlayed ?? null,
        dataSource: team.dataSource ?? null,
      },
    })),

    playerImpactModel: {
      sourceFile: 'data/worldcup-live/power-rankings-lib.js',
      function: 'aggregateClubBaseline(players, officialTeam)',
      description: 'Individual players influence team ratings only through squad-level aggregation of club-season stats. There is no per-player weighting into live match predictions.',
      squadSelection: 'all players where resolveOfficialTeamName(player.country || player.team) === officialTeam',
      influences: {
        teamRating: 'club baseline raw values summed/averaged across squad',
        attack: 'squadGoals, squadAssists, squadChancesCreated with coefficients 1.4, 1.0, 0.55',
        defence: 'defMinutes, gkMinutes, cardRate from squad players',
        goalExpectation: null,
        confidence: null,
      },
      liveTournamentPlayerContribution: {
        sourceFile: 'data/worldcup-live/power-rankings-lib.js',
        function: 'aggregateLiveBaseline',
        chanceCreationRaw: 'uses sum(player.chancesCreated) and sum(player.assists) per team',
        note: 'Player match stats feed team live chanceCreationRaw only; other live raw dimensions use team match aggregates',
      },
      homepagePlayerRankings: {
        sourceFile: 'api/_lib/homepage-rankings-debug.js',
        method: 'rankPoolByMetric — sort players by single club-season metric, TOP_N=10, DEBUG_TOP_N=20',
        disciplineRisk: '(foulsCommitted || 0) + (cards || 0)',
        chanceCreation: '(chancesCreated || 0) + (cornersInvolved || 0)',
        notUsedInPowerModel: true,
      },
    },

    calibration: {
      ratingNormalisation: {
        formula: '((raw - min) / (max - min)) * 100',
        equalRangeFallback: 50,
        sourceFile: 'data/worldcup-live/power-rankings-lib.js',
      },
      derivedProjectionNormalisation: {
        formula: '((value - min) / (max - min)) * 100',
        equalRangeFallback: 50,
        sourceFile: 'data/worldcup-live/round1-exports-lib.js',
        function: 'normalizeScore',
      },
      goalScaling: null,
      scorelineAdjustment: null,
      drawBias: null,
      probabilitySmoothing: null,
      confidenceSmoothing: null,
      finishingEfficiency: {
        formula: 'goalsFor / xGFor',
        sourceFile: 'data/worldcup-live/round1-exports-lib.js',
      },
      shotAccuracy: {
        formula: '(shotsOnTarget / shots) * 100',
        sourceFile: 'data/worldcup-live/round1-exports-lib.js',
      },
      goalkeeperSaveRate: {
        primary: 'saves / shotsOnTargetFaced when SOT faced available',
        fallback: 'saves / (saves + goalsConceded)',
        sourceFile: 'data/worldcup-live/round1-exports-lib.js',
      },
      cardMarketMultipliers: {
        lowCard: { low: 0.60, high: 0.75 },
        strict: { low: 1.20, high: 1.35 },
        balanced: { low: 0.95, high: 1.05 },
        sourceFile: 'data/worldcup-live/export-lib.js',
      },
      rawPlayerCardRiskDivisor: 6.5,
      liveCardsRawMultiplier: 2.2,
      liveDisciplineCardMultiplier: 4,
      clubDefenceCardRateMultiplier: 4,
      clubDisciplineCardRateMultiplier: 8,
    },

    futureNotes: {
      fromReadme: [
        'World Cup live exports are not connected to the website yet.',
        'Exports designed to be combined with club-season player dataset for Round 2 predictions including card market modelling with referee context.',
        'Card market signals apply referee style adjustments to a player-foul baseline for future card prediction work.',
        'Power rankings use only EdgeStats data — no FIFA rankings or bookmaker odds.',
        'Teams without completed World Cup matches use club baseline only (currentForm: null).',
        'Missing API fields exported as null — no placeholder or demo data.',
      ],
      fromExportLib: [
        'Used by scripts/update-worldcup-live-stats.js (not connected to the website).',
        'Completed matches only: FT, AET, PEN, AWD, WO.',
        'Upcoming and live matches excluded entirely.',
      ],
      fromSummary: summary.notes ?? null,
      missingFieldsInLatestExport: summary.missingFields ?? null,
      knownLimitations: [
        'No implemented match prediction model.',
        'No implemented confidence model.',
        'No home advantage weighting.',
        'No knockout-stage-specific weighting constants.',
        'No FIFA ranking input.',
        'foulsDrawn often null in team match export.',
        'Power model live weight label still references Round 1 in methodology description string though export pool includes full group stage when complete.',
      ],
      assumptions: [
        'Official 48-team list in wc2026-official-teams.js is source of truth for nation pool.',
        'Club-season stats from API-Football player endpoints seasons [2025, 2026, 2024].',
        'Low-card tournament adjustment activates when average yellow cards per match < 3.5.',
      ],
      todosInProjectSource: null,
    },

    implementationMap: {
      powerRankings: 'data/worldcup-live/power-rankings-lib.js',
      liveExport: 'data/worldcup-live/export-lib.js',
      round1DerivedExports: 'data/worldcup-live/round1-exports-lib.js',
      homepageRankingsBuild: 'api/_lib/homepage-rankings-debug.js',
      officialTeams: 'api/_lib/wc2026-official-teams.js',
      updateScript: 'scripts/update-worldcup-live-stats.js',
    },
  };
}
