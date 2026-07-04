/**
 * World Cup live leaderboard calculations from stored JSON exports only.
 * Tournament stats only — no club-season data in leaderboards.
 */

const TEAM_ALIASES = {
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

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function resolveTeamName(name) {
  if (!name) return null;
  const key = String(name).toLowerCase().trim();
  return TEAM_ALIASES[key] || name;
}

function isGoalkeeper(player) {
  const pos = (player.position || '').toUpperCase();
  return pos === 'G' || pos.includes('GOAL');
}

function withRanks(rows) {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

/**
 * @param {object} playerStats - worldcup-live-player-stats.json payload
 * @param {number|null} limit
 */
export function getGoldenBootLeaders(playerStats, limit = null) {
  const rows = (playerStats?.playerTotals || [])
    .filter((p) => p.goals != null && Number(p.goals) > 0)
    .slice()
    .sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      return (b.assists ?? 0) - (a.assists ?? 0);
    })
    .map((p) => ({
      playerId: p.playerId ?? null,
      playerName: p.playerName ?? null,
      team: resolveTeamName(p.team),
      goals: p.goals,
      assists: p.assists ?? null,
      minutes: p.minutes ?? null,
      matchesPlayed: p.matchesPlayed ?? null,
    }));

  return withRanks(limit ? rows.slice(0, limit) : rows);
}

/**
 * @param {object} teamStats - worldcup-live-team-stats.json payload
 * @param {number|null} limit
 */
export function getGoalsByCountry(teamStats, limit = null) {
  const rows = (teamStats?.teamTotals || [])
    .filter((t) => t.goalsFor != null)
    .slice()
    .sort((a, b) => (b.goalsFor ?? 0) - (a.goalsFor ?? 0))
    .map((t) => ({
      team: resolveTeamName(t.team),
      goalsScored: t.goalsFor,
      matchesPlayed: t.matchesPlayed ?? null,
      goalsPerMatch: t.averages?.goalsFor ?? (
        t.goalsFor != null && t.matchesPlayed
          ? round(t.goalsFor / t.matchesPlayed, 2)
          : null
      ),
    }));

  return withRanks(limit ? rows.slice(0, limit) : rows);
}

export function getCornersByCountry(teamStats, limit = null) {
  const rows = (teamStats?.teamTotals || [])
    .filter((t) => t.cornersFor != null)
    .slice()
    .sort((a, b) => (b.cornersFor ?? 0) - (a.cornersFor ?? 0))
    .map((t) => ({
      team: resolveTeamName(t.team),
      totalCorners: t.cornersFor,
      matchesPlayed: t.matchesPlayed ?? null,
      averageCornersPerMatch: t.averages?.cornersFor ?? (
        t.cornersFor != null && t.matchesPlayed
          ? round(t.cornersFor / t.matchesPlayed, 2)
          : null
      ),
    }));

  return withRanks(limit ? rows.slice(0, limit) : rows);
}

export function getGoalkeeperSaveLeaders(playerStats, teamStats, limit = null, gkRankings = null) {
  const gkIndex = new Map(
    (gkRankings?.goalkeepers || []).map((g) => [g.playerId, g]),
  );

  const teamIndex = new Map(
    (teamStats?.teamTotals || []).map((t) => [resolveTeamName(t.team), t]),
  );

  const rows = (playerStats?.playerTotals || [])
    .filter((p) => isGoalkeeper(p) && p.saves != null && Number(p.saves) > 0)
    .slice()
    .sort((a, b) => (b.saves ?? 0) - (a.saves ?? 0))
    .map((p) => {
      const team = resolveTeamName(p.team);
      const teamTotal = teamIndex.get(team);
      const gkRow = gkIndex.get(p.playerId);
      const matchesPlayed = p.matchesPlayed ?? gkRow?.matchesPlayed ?? teamTotal?.matchesPlayed ?? null;
      const cleanSheets = gkRow?.cleanSheets ?? (
        gkRow?.cleanSheet != null ? (gkRow.cleanSheet ? 1 : 0) : null
      );
      return {
        playerId: p.playerId ?? null,
        playerName: p.playerName ?? null,
        team,
        saves: p.saves,
        matchesPlayed,
        savesPerMatch: p.saves != null && matchesPlayed
          ? round(p.saves / matchesPlayed, 2)
          : gkRow?.savesPerMatch ?? null,
        cleanSheets,
      };
    });

  return withRanks(limit ? rows.slice(0, limit) : rows);
}

export function getShotsByCountry(teamStats, limit = null) {
  const rows = (teamStats?.teamTotals || [])
    .filter((t) => t.shots != null)
    .slice()
    .sort((a, b) => (b.shots ?? 0) - (a.shots ?? 0))
    .map((t) => ({
      team: resolveTeamName(t.team),
      totalShots: t.shots,
      shotsOnTarget: t.shotsOnTarget ?? null,
      shotAccuracy: t.shotAccuracy ?? null,
      matchesPlayed: t.matchesPlayed ?? null,
    }));

  return withRanks(limit ? rows.slice(0, limit) : rows);
}

export function getTopAssistsLeaders(playerStats, limit = null) {
  const rows = (playerStats?.playerTotals || [])
    .filter((p) => p.assists != null && Number(p.assists) > 0)
    .slice()
    .sort((a, b) => {
      if (b.assists !== a.assists) return b.assists - a.assists;
      return (b.goals ?? 0) - (a.goals ?? 0);
    })
    .map((p) => ({
      playerId: p.playerId ?? null,
      playerName: p.playerName ?? null,
      team: resolveTeamName(p.team),
      assists: p.assists,
      goals: p.goals ?? null,
      matchesPlayed: p.matchesPlayed ?? null,
    }));

  return withRanks(limit ? rows.slice(0, limit) : rows);
}

export function getTeamWinPercentage(teamStats, limit = null) {
  const rows = (teamStats?.teamTotals || [])
    .filter((t) => t.matchesPlayed != null && t.matchesPlayed > 0)
    .slice()
    .map((t) => {
      const mp = t.matchesPlayed ?? 0;
      const wins = t.wins ?? 0;
      const draws = t.draws ?? 0;
      const losses = t.losses ?? 0;
      const winPct = mp > 0 ? round((wins / mp) * 100, 1) : null;
      return {
        team: resolveTeamName(t.team),
        winPercentage: winPct,
        matchesPlayed: mp,
        wins,
        draws,
        losses,
        record: `${wins}-${draws}-${losses}`,
      };
    })
    .sort((a, b) => {
      if ((b.winPercentage ?? 0) !== (a.winPercentage ?? 0)) {
        return (b.winPercentage ?? 0) - (a.winPercentage ?? 0);
      }
      return (b.wins ?? 0) - (a.wins ?? 0);
    });

  return withRanks(limit ? rows.slice(0, limit) : rows);
}

/**
 * EdgeStats #1 ranked team from power rankings export.
 * @param {object} powerRankings - worldcup-live-power-rankings.json payload
 */
export function getCupWinnerPrediction(powerRankings) {
  const top = (powerRankings?.rankings || [])[0];
  if (!top?.team) return null;

  return {
    team: resolveTeamName(top.team),
    rank: top.rank ?? 1,
    powerRating: top.overallPowerScore ?? null,
    winProbability: null,
    reason: top.overallPowerScore != null
      ? `#${top.rank ?? 1} in EdgeStats power rankings (${top.overallPowerScore} overall) after group stage — strongest blend of attack, defence, form and tournament data.`
      : 'Top-ranked team in EdgeStats power rankings after group stage.',
  };
}

export function getDisciplineTable(teamStats, limit = null) {
  const rows = (teamStats?.teamTotals || [])
    .slice()
    .map((t) => {
      const yellow = t.yellowCards ?? 0;
      const red = t.redCards ?? 0;
      const totalCards = (t.yellowCards != null || t.redCards != null) ? yellow + red : null;
      return {
        team: resolveTeamName(t.team),
        yellowCards: t.yellowCards ?? null,
        redCards: t.redCards ?? null,
        totalCards,
        foulsCommitted: t.foulsCommitted ?? null,
        matchesPlayed: t.matchesPlayed ?? null,
      };
    })
    .filter((t) => t.totalCards != null && t.totalCards > 0)
    .sort((a, b) => {
      if ((b.totalCards ?? 0) !== (a.totalCards ?? 0)) {
        return (b.totalCards ?? 0) - (a.totalCards ?? 0);
      }
      return (b.redCards ?? 0) - (a.redCards ?? 0);
    });

  return withRanks(limit ? rows.slice(0, limit) : rows);
}

export function getExportedAt(sources) {
  return sources?.summary?.exportedAt
    ?? sources?.teamStats?.exportedAt
    ?? sources?.playerStats?.exportedAt
    ?? null;
}

export function formatExportedAt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }) + ' UTC';
  } catch {
    return iso;
  }
}

/**
 * Build all leaderboards from loaded JSON payloads.
 * @param {{ teamStats: object, playerStats: object, summary?: object }} sources
 * @param {{ displayLimit?: number }} options
 */
export function buildLeaderboardsFromData(sources, options = {}) {
  const { teamStats, playerStats, summary, gkRankings, powerRankings } = sources;
  const limit = options.displayLimit ?? null;

  return {
    exportedAt: getExportedAt(sources),
    exportedAtFormatted: formatExportedAt(getExportedAt(sources)),
    completedMatchesProcessed: summary?.completedMatchesProcessed ?? null,
    source: 'data/worldcup-live/worldcup-live-team-stats.json + worldcup-live-player-stats.json',
    dataNote: 'Updated from completed World Cup matches only',
    goldenBoot: getGoldenBootLeaders(playerStats, limit),
    topAssists: getTopAssistsLeaders(playerStats, limit),
    goalsByCountry: getGoalsByCountry(teamStats, limit),
    cornersByCountry: getCornersByCountry(teamStats, limit),
    teamWinPercentage: getTeamWinPercentage(teamStats, limit),
    cupWinnerPrediction: getCupWinnerPrediction(powerRankings),
    goalkeeperSaveLeaders: getGoalkeeperSaveLeaders(playerStats, teamStats, limit, gkRankings),
    shotsByCountry: getShotsByCountry(teamStats, limit),
    disciplineTable: getDisciplineTable(teamStats, limit),
  };
}

// Browser global for non-module script tags (optional)
if (typeof globalThis !== 'undefined') {
  globalThis.WCLeaderboards = {
    getGoldenBootLeaders,
    getGoalsByCountry,
    getCornersByCountry,
    getGoalkeeperSaveLeaders,
    getShotsByCountry,
    getDisciplineTable,
    buildLeaderboardsFromData,
    formatExportedAt,
    resolveTeamName,
  };
}
