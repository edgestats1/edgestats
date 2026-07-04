import { createApiFootballProxy } from './_lib/proxy-handler.js';

export default createApiFootballProxy({
  upstreamPath: '/teams/statistics',
  validate: (query) => {
    if (!query.team) return 'Missing required query param: team';
    return null;
  },
  buildParams: (query) => ({
    team: String(query.team),
    league: String(query.league || '1'),
    season: String(query.season || '2026'),
  }),
});
