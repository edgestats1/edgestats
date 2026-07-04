/**
 * Official FIFA World Cup 2026 group-stage team list (48 nations).
 * Used as the sole source of truth for homepage rankings team pool.
 */

export const OFFICIAL_WC2026_GROUPS = [
  { group: 'A', teams: ['Mexico', 'South Africa', 'South Korea', 'Czechia'] },
  { group: 'B', teams: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'] },
  { group: 'C', teams: ['Brazil', 'Morocco', 'Haiti', 'Scotland'] },
  { group: 'D', teams: ['United States', 'Paraguay', 'Australia', 'Türkiye'] },
  { group: 'E', teams: ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'] },
  { group: 'F', teams: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'] },
  { group: 'G', teams: ['Belgium', 'Egypt', 'Iran', 'New Zealand'] },
  { group: 'H', teams: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'] },
  { group: 'I', teams: ['France', 'Senegal', 'Iraq', 'Norway'] },
  { group: 'J', teams: ['Argentina', 'Algeria', 'Austria', 'Jordan'] },
  { group: 'K', teams: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'] },
  { group: 'L', teams: ['England', 'Croatia', 'Ghana', 'Panama'] },
];

export const OFFICIAL_WC2026_TEAM_COUNT = 48;

/** Canonical official name → API-Football fixture name aliases */
const API_NAME_ALIASES = {
  czechia: ['czech republic', 'czechia'],
  'bosnia and herzegovina': ['bosnia & herzegovina', 'bosnia and herzegovina'],
  'united states': ['usa', 'united states'],
  'ivory coast': ['ivory coast', "cote d'ivoire", "côte d'ivoire"],
  'cape verde': ['cape verde islands', 'cape verde'],
  'dr congo': ['congo dr', 'dr congo', 'congo democratic'],
  türkiye: ['türkiye', 'turkey'],
};

export function getOfficialTeamNames() {
  return OFFICIAL_WC2026_GROUPS.flatMap((entry) => entry.teams);
}

function normalizeKey(name) {
  return (name || '').toLowerCase().trim();
}

function lookupApiTeam(apiTeamsByKey, officialName) {
  const lower = normalizeKey(officialName);
  if (apiTeamsByKey.has(lower)) return apiTeamsByKey.get(lower);

  const aliases = API_NAME_ALIASES[lower] || [lower];
  for (const alias of aliases) {
    if (apiTeamsByKey.has(alias)) return apiTeamsByKey.get(alias);
    for (const [key, team] of apiTeamsByKey) {
      if (key.includes(alias) || alias.includes(key)) return team;
    }
  }
  return null;
}

/**
 * Resolve all 48 official teams to API-Football ids using fixture team names.
 * @param {Array<{ id: number, name: string }>} fixtureTeams
 */
export function resolveOfficialTeams(fixtureTeams) {
  const apiTeamsByKey = new Map();
  (fixtureTeams || []).forEach((team) => {
    if (!team?.id || !team?.name) return;
    apiTeamsByKey.set(normalizeKey(team.name), {
      id: team.id,
      apiName: team.name,
    });
  });

  const teamsFound = [];
  const teamsMissing = [];

  OFFICIAL_WC2026_GROUPS.forEach(({ group, teams }) => {
    teams.forEach((officialName) => {
      const match = lookupApiTeam(apiTeamsByKey, officialName);
      if (match) {
        teamsFound.push({
          group,
          officialName,
          id: match.id,
          apiName: match.apiName,
        });
      } else {
        teamsMissing.push({ group, officialName });
      }
    });
  });

  return {
    teams: teamsFound,
    teamsFound: teamsFound.map((t) => t.officialName),
    teamsMissing: teamsMissing.map((t) => t.officialName),
    teamCount: teamsFound.length,
    complete: teamsFound.length === OFFICIAL_WC2026_TEAM_COUNT && teamsMissing.length === 0,
  };
}

export function isRequiredNationIncluded(teamNames, pattern) {
  const normalized = (teamNames || []).map((n) => normalizeKey(n));
  const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  return normalized.some((n) => re.test(n));
}
