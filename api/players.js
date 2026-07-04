import { createApiFootballProxy } from './_lib/proxy-handler.js';

export default createApiFootballProxy({
  upstreamPath: '/players',
  validate: (query) => {
    if (!query.id) return 'Missing required query param: id';
    return null;
  },
  buildParams: (query) => ({
    id: String(query.id),
    season: String(query.season || '2025'),
  }),
});
