/**
 * Server-side API-Football fetch helper for debug routes.
 * Uses shared cache + in-flight de-duplication.
 */

import { cachedApiFootballFetch } from './cached-api-football.js';

export async function apiFootballFetch(path, params, apiKey) {
  return cachedApiFootballFetch(path, params, apiKey);
}

export function isInternationalLeague(league) {
  if (!league) return false;
  if (league.country === 'World') return true;
  const name = (league.name || '').toLowerCase();
  const patterns = [
    'friendlies', 'world cup', 'qualification', 'qualifying',
    'nations league', 'euro ', 'copa america', 'concacaf',
    'africa cup', 'asian cup', 'olympic',
  ];
  return patterns.some((pattern) => name.includes(pattern));
}

export function pickClubStatRow(statistics, nationalTeamName) {
  const clubStats = (statistics || []).filter((stat) => {
    const teamName = stat.team?.name;
    if (nationalTeamName && teamName === nationalTeamName) return false;
    return !isInternationalLeague(stat.league);
  });

  if (!clubStats.length) return null;

  clubStats.sort((a, b) => {
    const minsA = a.games?.minutes || 0;
    const minsB = b.games?.minutes || 0;
    if (minsB !== minsA) return minsB - minsA;
    const leagueA = a.league?.name || '';
    const leagueB = b.league?.name || '';
    const cupA = /cup|pokal|copa|coupe|fa |dfb|copa del rey/i.test(leagueA) ? 1 : 0;
    const cupB = /cup|pokal|copa|coupe|fa |dfb|copa del rey/i.test(leagueB) ? 1 : 0;
    return cupA - cupB;
  });

  return clubStats[0];
}

export function pickInternationalStatRow(statistics, nationalTeamName) {
  const intlStats = (statistics || []).filter((stat) => {
    const teamName = stat.team?.name;
    if (nationalTeamName && teamName === nationalTeamName) return true;
    return isInternationalLeague(stat.league);
  });

  if (!intlStats.length) return null;

  intlStats.sort((a, b) => (b.games?.minutes || 0) - (a.games?.minutes || 0));
  return intlStats[0];
}

export function findPlayerInFixturePlayers(data, playerId) {
  const targetId = Number(playerId);
  for (const teamBlock of data.response || []) {
    for (const entry of teamBlock.players || []) {
      if (entry.player && Number(entry.player.id) === targetId) {
        return entry;
      }
    }
  }
  return null;
}
