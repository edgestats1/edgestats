import { createApiFootballProxy } from './_lib/proxy-handler.js';

export default createApiFootballProxy({
  upstreamPath: '/fixtures',
  validate: (query) => {
    if (!query.team) return 'Missing required query param: team';
    return null;
  },
  buildParams: (query) => ({
    team: String(query.team),
    last: String(query.last || '5'),
  }),
});
