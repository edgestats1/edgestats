/** Shared prediction engine types — sport-agnostic where possible. */

export type SportId = 'world-cup-2026' | 'nfl' | 'nrl' | 'epl' | 'champions-league';

export interface TeamNameAliases {
  [alias: string]: string;
}

export interface PowerRatingSlice {
  rank: number | null;
  overallPowerScore: number | null;
  attackRating: number | null;
  defenceRating: number | null;
  chanceCreationRating: number | null;
  finishingRating: number | null;
  cornerRating: number | null;
  disciplineRating: number | null;
  goalkeeperRating: number | null;
  currentFormRating: number | null;
  worldCupMatchesPlayed: number | null;
  dataSource: string | null;
}

export interface TournamentAverages {
  goalsFor: number | null;
  goalsAgainst: number | null;
  xG: number | null;
  xGAgainst: number | null;
  shots: number | null;
  shotsAgainst: number | null;
  cornersFor: number | null;
  cornersAgainst: number | null;
  shotsOnTarget: number | null;
  shotsOnTargetAgainst: number | null;
  yellowCards: number | null;
  savesFor: number | null;
  possessionAverage: number | null;
}

export interface CornerTrendSlice {
  averageCornersFor: number | null;
  averageCornersAgainst: number | null;
  projectedRound2CornerStrength: number | null;
}

export interface CardTrendSlice {
  projectedRound2CardRisk: number | null;
  disciplineRating: number | null;
  yellowCards: number | null;
  redCards: number | null;
}

export interface GoalkeeperSlice {
  playerId: number | null;
  playerName: string | null;
  savesPerMatch: number | null;
  saveRate: number | null;
  projectedRound2SaveStrength: number | null;
  shotsOnTargetFaced: number | null;
  matchesPlayed: number | null;
}

export interface PlayerThreat {
  playerId: number | null;
  name: string;
  team: string;
  worldCupGoals: number | null;
  worldCupAssists: number | null;
  clubGoals: number | null;
  threatScore: number | null;
  note: string | null;
}

export interface TeamMatchProfile {
  team: string;
  group: string | null;
  qualified: boolean;
  power: PowerRatingSlice;
  tournamentAverages: TournamentAverages;
  finishingEfficiency: number | null;
  cornerTrends: CornerTrendSlice;
  cardTrends: CardTrendSlice;
  primaryGoalkeeper: GoalkeeperSlice | null;
  keyThreats: PlayerThreat[];
  dataCompleteness: DataCompleteness;
}

export interface DataCompleteness {
  hasPowerRating: boolean;
  hasTournamentTotals: boolean;
  hasCornerTrends: boolean;
  hasCardTrends: boolean;
  hasGoalkeeper: boolean;
  hasWorldCupPlayerStats: boolean;
  worldCupMatchesPlayed: number | null;
}

export interface ExpectedGoals {
  home: number | null;
  away: number | null;
  homeLambda: number | null;
  awayLambda: number | null;
  leagueAveragePerTeam: number | null;
  method: string;
}

export interface OutcomeProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
}

export interface PredictedScoreline {
  home: number;
  away: number;
  label: string;
  probability: number | null;
}

export interface PoissonScoreEntry {
  home: number;
  away: number;
  label: string;
  probability: number;
}

export interface ScorelineCandidateScore {
  label: string;
  home: number;
  away: number;
  source: string;
  totalScore: number;
  poissonProbability: number;
  fitToWinProbability: number;
  fitToXG: number;
  fitToShotVolume: number;
  fitToShotsOnTarget: number;
  fitToDefensiveProfile: number;
  fitToGoalkeeperProjection: number;
  fitToCleanSheetProbability: number;
  fitToAttackingDominance: number;
}

export interface ScorelineOutput {
  rawPoissonMostLikely: string;
  representativeScoreline: string;
  selectedScoreline: string;
  selectionReason: string;
  home: number;
  away: number;
}

export interface ScorelineDiagnostics {
  rawPoissonTopScores: PoissonScoreEntry[];
  candidateScores: ScorelineCandidateScore[];
  dominanceRuleApplied: boolean;
  cleanSheetRuleApplied: boolean;
  drawRuleApplied: boolean;
  upsetRuleApplied: boolean;
  underdogGoalRuleApplied: boolean;
  goalBandHome: number;
  goalBandAway: number;
  selectionReason: string;
  scorelineConfidence: number | null;
}

export interface V2ModelDiagnostics {
  engineVersion: string;
  modelConfidence: number | null;
  statConsistencyScore: number | null;
  expectedGoalDifference: number;
  dominanceIndex: number;
  cleanSheetProbabilityHome: number;
  cleanSheetProbabilityAway: number;
  scorelineConfidence: number | null;
  topWinProbabilities: Array<{ outcome: string; probability: number }>;
  top10Scorelines: Array<{ label: string; probability: number }>;
  mainReasons: string[];
  drawCalibrationApplied: boolean;
  knockoutMode: boolean;
  rawPoissonProbabilities: OutcomeProbabilities;
}

export interface MatchPredictionCore {
  winner: string | 'Draw';
  score: string;
  winProbability: number;
  drawProbability: number;
  lossProbability: number;
  confidence: number;
}

export interface ExpectedMatchStats {
  expectedGoals: ExpectedGoals;
  shots: Record<string, { total: number | null; onTarget: number | null }>;
  corners: Record<string, number | null>;
  cards: { total: number | null; home: number | null; away: number | null };
  saves: Record<string, number | null>;
}

export interface StatDiagnosticEntry {
  teamBase: number | null;
  opponentAgainst: number | null;
  baseFormula: string;
  modifiers: string[];
  final: number | null;
}

export interface ModelDiagnostics {
  corners: Record<string, StatDiagnosticEntry>;
  shots: Record<string, StatDiagnosticEntry>;
  shotsOnTarget: Record<string, StatDiagnosticEntry>;
  goals: Record<string, StatDiagnosticEntry>;
  saves: Record<string, StatDiagnosticEntry>;
  sanityChecksApplied: string[];
}

export interface MatchPredictionResult {
  match: string;
  homeTeam: string;
  awayTeam: string;
  sport: SportId;
  modelVersion: string | null;
  exportedAt: string | null;
  prediction: MatchPredictionCore;
  scoreline: ScorelineOutput;
  scorelineDiagnostics: ScorelineDiagnostics;
  v2Diagnostics: V2ModelDiagnostics;
  expectedStats: ExpectedMatchStats;
  modelDiagnostics: ModelDiagnostics;
  statConsistencyScore: number | null;
  keyPlayerThreats: {
    home: PlayerThreat[];
    away: PlayerThreat[];
  };
  breakdown: string;
  limitations: string[];
  pairingNote: string | null;
}

export interface KnockoutFixtureTeam {
  name: string;
  officialName: string | null;
  flag: string | null;
  group: string | null;
  groupFinish: number | null;
  seed: number | null;
  teamId: number | null;
}

export interface KnockoutFixture {
  id: string;
  fixtureId: number | null;
  round: string;
  stage: string | null;
  kickoffTime: string | null;
  kickoffLocal: string | null;
  home: KnockoutFixtureTeam;
  away: KnockoutFixtureTeam;
  venue: string | null;
  city: string | null;
  status: string | null;
  isSynthetic: boolean;
  syntheticNote: string | null;
  source: 'api-football' | 'synthetic';
}

export interface KnockoutMatchListResponse {
  round: string;
  exportedAt: string | null;
  isSynthetic: boolean;
  source: 'api-football' | 'synthetic';
  statusMessage: string;
  syntheticNote: string | null;
  dataNote: string | null;
  kickoffAvailable: boolean;
  error: string | null;
  fixtures: KnockoutFixture[];
}

export interface OfficialKnockoutFixtureRow {
  fixtureId: number;
  round: string | null;
  stage: string | null;
  kickoffUTC: string | null;
  kickoffLocal: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamOfficial?: string | null;
  awayTeamOfficial?: string | null;
  venue: string | null;
  city: string | null;
  status: string | null;
  source: 'api-football';
}

export interface OfficialKnockoutFixturesExport {
  version: string;
  exportedAt: string;
  source: 'api-football';
  league: number;
  season: number;
  leagueName?: string;
  rounds?: string[];
  fixtureCount?: number;
  fixtures: OfficialKnockoutFixtureRow[];
}

export interface KnockoutRoundResult {
  sport: SportId;
  modelVersion: string | null;
  exportedAt: string | null;
  round: string;
  pairingMethod: string;
  limitations: string[];
  matches: MatchPredictionResult[];
}

export interface MasterModelTeam {
  team: string;
  group?: string;
  tournamentTotals?: {
    finishingEfficiency?: number | null;
    averages?: TournamentAverages;
  };
  powerRanking?: PowerRatingSlice & { team?: string; group?: string };
  cornerTrends?: CornerTrendSlice & { team?: string };
  cardTrends?: CardTrendSlice & { team?: string };
  masterGroupStageRecord?: {
    qualified?: boolean;
    groupFinish?: number | null;
  };
}

export interface MasterModelPlayer {
  id?: number;
  name: string;
  country?: string;
  goals?: number | null;
  assists?: number | null;
  worldCupStatistics?: {
    playerId?: number;
    playerName?: string;
    goals?: number | null;
    assists?: number | null;
    shots?: number | null;
    shotsOnTarget?: number | null;
    matchesPlayed?: number | null;
  } | null;
}

export interface LoadedMasterModel {
  sport: SportId;
  modelVersion: string | null;
  exportedAt: string | null;
  tournamentGoalsPerMatch: number | null;
  tournamentGoalsPerTeam: number | null;
  tournamentAverageShots: number | null;
  tournamentAverageShotsOnTarget: number | null;
  tournamentAverageYellowCards: number | null;
  lowCardFactor: number;
  weighting: ModelWeighting;
  teamsByName: Map<string, MasterModelTeam>;
  playersByCountry: Map<string, MasterModelPlayer[]>;
  goalkeepersByTeam: Map<string, GoalkeeperSlice[]>;
  defensiveAveragesByTeam: Map<string, { shotsAgainst: number | null; shotsOnTargetAgainst: number | null }>;
  qualifiedTeams: string[];
  knockoutBracketNote: string | null;
}

export interface ModelWeighting {
  attack: number;
  defence: number;
  chanceCreation: number;
  finishing: number;
  corner: number;
  discipline: number;
  goalkeeper: number;
  currentForm: number;
  clubSeasonBlend: number;
  worldCupBlend: number;
}

export interface PredictMatchOptions {
  homeTeam?: string;
  awayTeam?: string;
  /** Treat first team as designated home side for labelling only. */
  designateHome?: boolean;
  pairingNote?: string | null;
}
