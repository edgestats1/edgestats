import { createApiFootballProxy } from './_lib/proxy-handler.js';

export default createApiFootballProxy({
  upstreamPath: '/fixtures',
  validate: (query) => {
    if (query.scope === 'player' || (query.team && query.last && !query.league && !query.next)) {
      if (query.player && !query.team) {
        return 'API-Football /fixtures does not support player=. Use team=CLUB_ID&season=YEAR&last=N instead.';
      }
      if (!query.team) {
        return 'Missing required query param: team (player is not supported upstream)';
      }
    }
    return null;
  },
  buildParams: (query) => {
    if (query.scope === 'player' || (query.team && query.last && !query.league && !query.next)) {
      const params = {
        team: String(query.team),
        last: String(query.last || '1'),
      };
      if (query.season) params.season = String(query.season);
      return params;
    }

    const params = {
      league: query.league || '1',
      season: query.season || '2026',
      timezone: query.timezone || 'UTC',
    };
    if (query.next) params.next = String(query.next);
    if (query.status) params.status = String(query.status);
    if (query.team) params.team = String(query.team);
    if (query.id) params.id = String(query.id);
    if (query.last) params.last = String(query.last);
    return params;
  },
});
