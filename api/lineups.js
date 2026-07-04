import { createApiFootballProxy } from './_lib/proxy-handler.js';

export default createApiFootballProxy({
  upstreamPath: '/fixtures/lineups',
  validate: (query) => {
    if (!query.fixture) return 'Missing required query param: fixture';
    return null;
  },
  buildParams: (query) => ({
    fixture: String(query.fixture),
  }),
});
