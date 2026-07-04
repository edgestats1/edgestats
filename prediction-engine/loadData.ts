import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  GoalkeeperSlice,
  LoadedMasterModel,
  MasterModelPlayer,
  MasterModelTeam,
  ModelWeighting,
  TeamNameAliases,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolveProjectRoot(__dirname);
const DEFAULT_MASTER_MODEL_PATH = join(
  PROJECT_ROOT,
  'data/worldcup-live/EdgeStats_AI_Master_Model.json',
);

function resolveProjectRoot(fromDir: string): string {
  const cwdRoot = process.cwd();
  if (existsSync(join(cwdRoot, 'data/worldcup-live/EdgeStats_AI_Master_Model.json'))) {
    return cwdRoot;
  }
  const candidates = [
    join(fromDir, '..'),
    join(fromDir, '../..'),
  ];
  for (const root of candidates) {
    if (existsSync(join(root, 'data/worldcup-live/EdgeStats_AI_Master_Model.json'))) {
      return root;
    }
  }
  return join(fromDir, '..');
}

const TEAM_ALIASES: TeamNameAliases = {
  usa: 'United States',
  'united states': 'United States',
  'bosnia & herzegovina': 'Bosnia and Herzegovina',
  'czech republic': 'Czechia',
  "cote d'ivoire": 'Ivory Coast',
  "côte d'ivoire": 'Ivory Coast',
  'cape verde islands': 'Cape Verde',
  'congo dr': 'DR Congo',
  turkey: 'Türkiye',
};

let cachedModel: LoadedMasterModel | null = null;

export interface TeamResolveResult {
  team: string;
  ambiguous?: false;
}

export interface TeamResolveError {
  error: string;
  ambiguous: true;
  matches: string[];
}

export function resolveTeamName(input: string, knownTeams: Iterable<string>): string | null {
  const result = resolveTeamNameDetailed(input, knownTeams);
  if ('error' in result) return null;
  return result.team;
}

export function resolveTeamNameDetailed(
  input: string,
  knownTeams: Iterable<string>,
): TeamResolveResult | TeamResolveError {
  const trimmed = stripQuotes((input || '').trim());
  if (!trimmed) {
    return { error: 'Team name is empty.', ambiguous: true, matches: [] };
  }

  const known = [...knownTeams];
  const lower = trimmed.toLowerCase();

  const exactMatches = known.filter((team) => team.toLowerCase() === lower);
  if (exactMatches.length === 1) return { team: exactMatches[0] };
  if (exactMatches.length > 1) {
    return {
      error: `Ambiguous team "${trimmed}". Multiple exact matches: ${exactMatches.join(', ')}`,
      ambiguous: true,
      matches: exactMatches,
    };
  }

  if (TEAM_ALIASES[lower]) {
    const aliasTarget = TEAM_ALIASES[lower];
    const aliasMatches = known.filter((team) => team.toLowerCase() === aliasTarget.toLowerCase());
    if (aliasMatches.length === 1) return { team: aliasMatches[0] };
    if (aliasMatches.length > 1) {
      return {
        error: `Ambiguous alias "${trimmed}" → "${aliasTarget}". Matches: ${aliasMatches.join(', ')}`,
        ambiguous: true,
        matches: aliasMatches,
      };
    }
  }

  const partialMatches = known.filter(
    (team) => team.toLowerCase().includes(lower) || lower.includes(team.toLowerCase()),
  );

  if (partialMatches.length === 1) return { team: partialMatches[0] };

  if (partialMatches.length > 1) {
    return {
      error: `Ambiguous team "${trimmed}". Did you mean: ${partialMatches.join(', ')}?`,
      ambiguous: true,
      matches: partialMatches,
    };
  }

  return {
    error: `Unknown team "${trimmed}". Not found in World Cup 2026 master model.`,
    ambiguous: true,
    matches: [],
  };
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function readMasterJson(path = DEFAULT_MASTER_MODEL_PATH): Record<string, unknown> {
  if (!existsSync(path)) {
    throw new Error(
      `Master model not found at ${path}. Run: npm run export-ai-master-model`,
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function extractWeighting(raw: Record<string, unknown>): ModelWeighting {
  const model = raw.model as Record<string, unknown> | undefined;
  const weighting = model?.weightingSystem as Record<string, unknown> | undefined;

  return {
    attack: numberOrNull(weighting?.attackWeight) ?? 0.18,
    defence: numberOrNull(weighting?.defensiveWeight) ?? 0.16,
    chanceCreation: numberOrNull(weighting?.chanceCreationWeight) ?? 0.14,
    finishing: numberOrNull(weighting?.finishingWeight) ?? 0.12,
    corner: numberOrNull(weighting?.cornerWeight) ?? 0.08,
    discipline: numberOrNull(weighting?.disciplineWeight) ?? 0.06,
    goalkeeper: numberOrNull(weighting?.goalkeeperWeight) ?? 0.12,
    currentForm: numberOrNull(weighting?.currentFormWeight) ?? 0.14,
    clubSeasonBlend: numberOrNull(weighting?.clubSeasonWeight) ?? 0.65,
    worldCupBlend: numberOrNull(weighting?.worldCupWeight) ?? 0.35,
  };
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function indexTeams(teams: MasterModelTeam[]): Map<string, MasterModelTeam> {
  const map = new Map<string, MasterModelTeam>();
  for (const team of teams) {
    if (team?.team) map.set(team.team, team);
  }
  return map;
}

function indexPlayers(players: MasterModelPlayer[]): Map<string, MasterModelPlayer[]> {
  const map = new Map<string, MasterModelPlayer[]>();
  for (const player of players) {
    const country = player.country;
    if (!country) continue;
    if (!map.has(country)) map.set(country, []);
    map.get(country)!.push(player);
  }
  return map;
}

function buildDefensiveAveragesFromMatches(raw: Record<string, unknown>) {
  const matches = (raw.matches as Array<Record<string, unknown>>) ?? [];
  const buckets = new Map<string, { shots: number[]; sot: number[] }>();

  for (const match of matches) {
    if (match.statusShort !== 'FT') continue;
    const homeTeam = match.homeTeam as string;
    const awayTeam = match.awayTeam as string;
    const homeStats = match.homeStats as Record<string, unknown> | undefined;
    const awayStats = match.awayStats as Record<string, unknown> | undefined;

    if (homeStats?.shots != null && awayTeam) {
      if (!buckets.has(awayTeam)) buckets.set(awayTeam, { shots: [], sot: [] });
      buckets.get(awayTeam)!.shots.push(Number(homeStats.shots));
      if (homeStats.shotsOnTarget != null) buckets.get(awayTeam)!.sot.push(Number(homeStats.shotsOnTarget));
    }
    if (awayStats?.shots != null && homeTeam) {
      if (!buckets.has(homeTeam)) buckets.set(homeTeam, { shots: [], sot: [] });
      buckets.get(homeTeam)!.shots.push(Number(awayStats.shots));
      if (awayStats.shotsOnTarget != null) buckets.get(homeTeam)!.sot.push(Number(awayStats.shotsOnTarget));
    }
  }

  const map = new Map<string, { shotsAgainst: number | null; shotsOnTargetAgainst: number | null }>();
  for (const [team, bucket] of buckets) {
    map.set(team, {
      shotsAgainst: bucket.shots.length
        ? bucket.shots.reduce((sum, value) => sum + value, 0) / bucket.shots.length
        : null,
      shotsOnTargetAgainst: bucket.sot.length
        ? bucket.sot.reduce((sum, value) => sum + value, 0) / bucket.sot.length
        : null,
    });
  }
  return map;
}

function computeTournamentShotAverages(teams: MasterModelTeam[]) {
  const shots: number[] = [];
  const sot: number[] = [];
  for (const team of teams) {
    const avg = team.tournamentTotals?.averages as Record<string, unknown> | undefined;
    if (avg?.shots != null) shots.push(Number(avg.shots));
    if (avg?.shotsOnTarget != null) sot.push(Number(avg.shotsOnTarget));
  }
  return {
    tournamentAverageShots: shots.length
      ? shots.reduce((sum, value) => sum + value, 0) / shots.length
      : null,
    tournamentAverageShotsOnTarget: sot.length
      ? sot.reduce((sum, value) => sum + value, 0) / sot.length
      : null,
  };
}

function indexGoalkeepers(raw: Record<string, unknown>): Map<string, GoalkeeperSlice[]> {
  const derived = raw.derivedMetrics as Record<string, unknown> | undefined;
  const gkExport = derived?.goalkeeperRankingsFullExport as Record<string, unknown> | undefined;
  const rows = (gkExport?.goalkeepers as Record<string, unknown>[]) ?? [];

  const map = new Map<string, GoalkeeperSlice[]>();
  for (const row of rows) {
    const team = String(row.team ?? '');
    if (!team) continue;
    const slice: GoalkeeperSlice = {
      playerId: numberOrNull(row.playerId),
      playerName: (row.playerName as string) ?? null,
      savesPerMatch: numberOrNull(row.savesPerMatch),
      saveRate: numberOrNull(row.saveRate),
      projectedRound2SaveStrength: numberOrNull(row.projectedRound2SaveStrength),
      shotsOnTargetFaced: numberOrNull(row.shotsOnTargetFaced),
      matchesPlayed: numberOrNull(row.matchesPlayed),
    };
    if (!map.has(team)) map.set(team, []);
    map.get(team)!.push(slice);
  }

  for (const [team, keepers] of map) {
    keepers.sort((a, b) => (b.matchesPlayed ?? 0) - (a.matchesPlayed ?? 0));
    map.set(team, keepers);
  }

  return map;
}

export function loadMasterModel(path = DEFAULT_MASTER_MODEL_PATH): LoadedMasterModel {
  if (cachedModel && path === DEFAULT_MASTER_MODEL_PATH) return cachedModel;

  const raw = readMasterJson(path);
  const metadata = raw.metadata as Record<string, unknown> | undefined;
  const tournament = raw.tournament as Record<string, unknown> | undefined;
  const knockout = raw.knockoutBracket as Record<string, unknown> | undefined;
  const summary = raw.statistics as Record<string, unknown> | undefined;
  const liveSummary = summary?.teamStatsFullExport as Record<string, unknown> | undefined;

  const completedMatches = numberOrNull(tournament?.completedMatchesProcessed)
    ?? numberOrNull(liveSummary?.completedMatchesProcessed);
  const totalGoals = numberOrNull(tournament?.totalGoals);
  const teams = (raw.teams as MasterModelTeam[]) ?? [];
  const players = (raw.players as MasterModelPlayer[]) ?? [];

  const modelMeta = raw.model as Record<string, unknown> | undefined;
  const specialRules = modelMeta?.specialRules as Record<string, unknown> | undefined;
  const lowCardRule = specialRules?.tournamentLowCardAdjustment as Record<string, unknown> | undefined;

  let tournamentAverageYellowCards: number | null = null;
  try {
    const summaryPath = join(PROJECT_ROOT, 'data/worldcup-live/worldcup-live-summary.json');
    if (existsSync(summaryPath)) {
      const liveSummaryFile = JSON.parse(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
      tournamentAverageYellowCards = numberOrNull(
        (liveSummaryFile.refereeSummary as Record<string, unknown> | undefined)?.tournamentAverageYellowCards,
      );
    }
  } catch {
    tournamentAverageYellowCards = null;
  }

  const lowCardFactor = tournamentAverageYellowCards != null && tournamentAverageYellowCards < 3.5
    ? numberOrNull(lowCardRule?.factor) ?? 0.82
    : 1;

  const goalsPerMatch = completedMatches && totalGoals != null
    ? totalGoals / completedMatches
    : null;
  const goalsPerTeam = goalsPerMatch != null ? goalsPerMatch / 2 : null;
  const shotAvgs = computeTournamentShotAverages(teams);
  const defensiveAveragesByTeam = buildDefensiveAveragesFromMatches(raw);

  const loaded: LoadedMasterModel = {
    sport: 'world-cup-2026',
    modelVersion: (metadata?.modelVersion as Record<string, unknown> | undefined)?.modelVersion as string
      ?? null,
    exportedAt: (metadata?.exportTimestamp as string)
      ?? (metadata?.liveExportTimestamp as string)
      ?? null,
    tournamentGoalsPerMatch: goalsPerMatch,
    tournamentGoalsPerTeam: goalsPerTeam,
    tournamentAverageShots: shotAvgs.tournamentAverageShots,
    tournamentAverageShotsOnTarget: shotAvgs.tournamentAverageShotsOnTarget,
    tournamentAverageYellowCards,
    lowCardFactor,
    weighting: extractWeighting(raw),
    teamsByName: indexTeams(teams),
    playersByCountry: indexPlayers(players),
    goalkeepersByTeam: indexGoalkeepers(raw),
    defensiveAveragesByTeam,
    qualifiedTeams: (knockout?.qualifiedTeams as string[]) ?? [],
    knockoutBracketNote: (knockout?.note as string) ?? null,
  };

  if (path === DEFAULT_MASTER_MODEL_PATH) cachedModel = loaded;
  return loaded;
}

export function getKnownTeamNames(model: LoadedMasterModel): string[] {
  return [...model.teamsByName.keys()];
}

export function requireTeam(model: LoadedMasterModel, input: string): MasterModelTeam {
  const resolved = resolveTeamNameDetailed(input, model.teamsByName.keys());

  if ('error' in resolved) {
    if (resolved.matches.length > 0) {
      throw new Error(resolved.error);
    }
    const knownSample = getKnownTeamNames(model).slice(0, 8).join(', ');
    throw new Error(
      `${resolved.error} Example teams: ${knownSample}, …`,
    );
  }

  const team = model.teamsByName.get(resolved.team);
  if (!team) {
    throw new Error(`Team profile missing for "${resolved.team}" in master model.`);
  }
  return team;
}

export function clearModelCache(): void {
  cachedModel = null;
}

export { DEFAULT_MASTER_MODEL_PATH, TEAM_ALIASES };
