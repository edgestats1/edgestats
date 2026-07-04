/**
 * EdgeStats client for World Cup data via Vercel proxy routes.
 * No API key is used here — serverless functions add it server-side.
 */
(function (global) {
  'use strict';

  var FIXTURES_URL = '/api/fixtures';
  var HOMEPAGE_RANKINGS_URL = '/api/homepage-rankings';
  var HOMEPAGE_RANKINGS_VERSION = 'wc2026-official-48-static-v1';
  var TOP_SCORERS_URL = '/api/top-scorers';
  var TOP_PLAYERS_URL = '/api/top-players';
  var LINEUPS_URL = '/api/lineups';
  var SQUADS_URL = '/api/squads';
  var PLAYERS_URL = '/api/players';
  var PLAYER_FIXTURES_URL = '/api/player-fixtures';
  var FIXTURE_PLAYERS_URL = '/api/fixture-players';
  var TEAM_STATISTICS_URL = '/api/team-statistics';
  var TEAM_FIXTURES_URL = '/api/team-fixtures';
  var FIXTURE_STATISTICS_URL = '/api/fixture-statistics';
  var WORLD_CUP_LEAGUE = 1;
  var WORLD_CUP_SEASON = 2026;
  var RECENT_FORM_MATCH_COUNT = 5;
  var RECENT_FORM_FETCH_BUFFER = 12;
  var PREMIUM_PREVIEW_LIMIT = 4;
  var PREMIUM_POOL_MAX_PLAYERS = 28;
  var PREMIUM_POOL_MAX_TEAMS = 6;
  var HOMEPAGE_RANKING_TOP_N = 10;
  var HOMEPAGE_RANKING_CARD_N = 4;
  var HOMEPAGE_RANKING_POOL_MAX_PLAYERS = 240;
  var HOMEPAGE_RANKING_SQUAD_CONCURRENCY = 4;
  var PREMIUM_STAT_FETCH_CONCURRENCY = 6;
  var CLUB_STATS_SEASON = 2025;
  var CLUB_STATS_SEASON_FALLBACKS = [2025, 2026, 2024];
  var FIXTURES_FETCH_TIMEOUT_MS = 15000;
  var MATCH_DATA_TIMEOUT_MS = 12000;
  var MATCH_PLAYER_ENRICH_CONCURRENCY = 5;

  var LIVE_STATUSES = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'];

  function isFixtureStatsDebugEnabled() {
    try {
      return global.localStorage && global.localStorage.getItem('edgestats_fixture_debug') === '1';
    } catch (e) {
      return false;
    }
  }

  function logFixtureStats(scope, payload) {
    if (!isFixtureStatsDebugEnabled()) return;
    console.info('[EdgeStats:FixtureStats:' + scope + ']', payload);
  }

  function isRankingsDebugEnabled() {
    try {
      return global.localStorage && global.localStorage.getItem('edgestats_rankings_debug') === '1';
    } catch (e) {
      return false;
    }
  }

  function logHomepageRankings(payload) {
    if (!isRankingsDebugEnabled()) return;
    console.info('[EdgeStats:HomepageRankings]', payload);
  }

  function enableRankingsDebug() {
    try {
      global.localStorage.setItem('edgestats_rankings_debug', '1');
    } catch (e) {
      /* ignore */
    }
    console.info('[EdgeStats] Homepage rankings debug logging enabled. Reload the page.');
  }

  function enableFixtureStatsDebug() {
    try {
      global.localStorage.setItem('edgestats_fixture_debug', '1');
    } catch (e) {
      /* ignore */
    }
    console.info('[EdgeStats] Fixture stats debug logging enabled. Reload and open Match Centre.');
  }
  var COMPLETED_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];

  function mapStatus(short) {
    if (LIVE_STATUSES.indexOf(short) !== -1) return 'live';
    if (COMPLETED_STATUSES.indexOf(short) !== -1) return 'completed';
    return 'upcoming';
  }

  function formatDate(isoDate) {
    var d = new Date(isoDate);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatRound(round) {
    if (!round) return 'World Cup';
    return round.replace('Group Stage - ', 'Group ');
  }

  function normalizeFixture(item) {
    var fixture = item.fixture;
    var statusShort = fixture.status.short;
    var mappedStatus = mapStatus(statusShort);

    return {
      id: fixture.id,
      group: formatRound(item.league.round),
      home: item.teams.home.name,
      homeId: item.teams.home.id,
      homeLogo: item.teams.home.logo,
      away: item.teams.away.name,
      awayId: item.teams.away.id,
      awayLogo: item.teams.away.logo,
      homeScore: item.goals.home,
      awayScore: item.goals.away,
      status: mappedStatus,
      statusLabel: fixture.status.long,
      statusShort: statusShort,
      date: formatDate(fixture.date),
      dateRaw: fixture.date,
      venue: fixture.venue.name || fixture.venue.city || 'TBD',
      city: fixture.venue.city || '',
    };
  }

  function sortFixtures(fixtures) {
    return fixtures.slice().sort(function (a, b) {
      return new Date(a.dateRaw) - new Date(b.dateRaw);
    });
  }

  async function fetchProxy(url, params, label, timeoutMs) {
    var requestUrl = url + '?' + params.toString();
    var response;

    try {
      if (timeoutMs) {
        response = await Promise.race([
          fetch(requestUrl),
          new Promise(function (_, reject) {
            setTimeout(function () {
              reject(new Error(label + ' request timed out after ' + (timeoutMs / 1000) + 's. Try again.'));
            }, timeoutMs);
          }),
        ]);
      } else {
        response = await fetch(requestUrl);
      }
    } catch (e) {
      if (e.message && e.message.indexOf('timed out') !== -1) {
        throw e;
      }
      throw new Error(
        'Cannot reach ' + url + '. Run locally with `vercel dev` (not a plain static server).'
      );
    }

    var data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error('Invalid response from ' + label);
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to load ' + label + ' (HTTP ' + response.status + ')');
    }

    if (data.errors && Object.keys(data.errors).length > 0) {
      var messages = Object.keys(data.errors).map(function (key) {
        return data.errors[key];
      });
      throw new Error(messages.join(' '));
    }

    return data;
  }

  function normalizeTopScorer(item) {
    var stats = item.statistics && item.statistics.length ? item.statistics[0] : null;
    var goals = stats && stats.goals ? stats.goals.total : null;

    return {
      id: item.player.id,
      name: item.player.name,
      photo: item.player.photo,
      team: stats && stats.team ? stats.team.name : '',
      teamLogo: stats && stats.team ? stats.team.logo : '',
      goals: goals !== null && goals !== undefined ? goals : 0,
    };
  }

  async function fetchWorldCupFixtures(options) {
    var opts = options || {};
    var params = new URLSearchParams({
      league: String(opts.league || WORLD_CUP_LEAGUE),
      season: String(opts.season || WORLD_CUP_SEASON),
      timezone: opts.timezone || 'UTC',
    });

    if (opts.next) params.set('next', String(opts.next));

    var data = await fetchProxy(FIXTURES_URL, params, 'fixtures', FIXTURES_FETCH_TIMEOUT_MS);
    var fixtures = (data.response || []).map(normalizeFixture);
    return sortFixtures(fixtures);
  }

  async function fetchTopScorers(options) {
    var opts = options || {};
    var params = new URLSearchParams({
      league: String(opts.league || WORLD_CUP_LEAGUE),
      season: String(opts.season || WORLD_CUP_SEASON),
    });

    var data = await fetchProxy(TOP_SCORERS_URL, params, 'top scorers');
    var scorers = (data.response || []).map(normalizeTopScorer);

    return scorers.filter(function (s) {
      return s.goals > 0;
    }).sort(function (a, b) {
      return b.goals - a.goals;
    });
  }

  async function fetchAllWorldCupFixtures(options) {
    var opts = options || {};
    var params = new URLSearchParams({
      league: String(opts.league || WORLD_CUP_LEAGUE),
      season: String(opts.season || WORLD_CUP_SEASON),
      timezone: opts.timezone || 'UTC',
    });

    var data = await fetchProxy(FIXTURES_URL, params, 'fixtures');
    var fixtures = (data.response || []).map(normalizeFixture);
    return sortFixtures(fixtures);
  }

  async function fetchCompletedFixtures(options) {
    var all = await fetchAllWorldCupFixtures(options);
    return all.filter(function (f) {
      return f.status === 'completed';
    });
  }

  function mapPosition(pos) {
    if (!pos) return '—';
    var map = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD' };
    return map[pos] || pos;
  }

  function parseLineupPlayers(data, fixture) {
    var response = data.response || [];
    if (!response.length) return { confirmed: false, players: [] };

    var players = [];
    var hasStarting = false;

    response.forEach(function (teamLineup) {
      var side = teamLineup.team.id === fixture.homeId ? 'home' : 'away';
      var nationalTeam = teamLineup.team.name;
      var startXI = teamLineup.startXI || [];

      if (startXI.length > 0) hasStarting = true;

      startXI.forEach(function (entry) {
        var p = entry.player;
        if (!p || !p.name) return;
        players.push({
          id: p.id,
          name: p.name,
          photo: null,
          number: p.number,
          position: mapPosition(p.pos),
          age: null,
          nationalTeam: nationalTeam,
          side: side,
          club: null,
          clubMinutes: null,
          source: 'lineup',
        });
      });
    });

    return { confirmed: hasStarting, players: players };
  }

  function parseSquadPlayers(data, side, nationalTeamName) {
    var block = data.response && data.response[0];
    if (!block || !block.players) return [];

    return block.players.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        photo: p.photo || null,
        number: p.number,
        position: p.position || '—',
        age: p.age != null ? p.age : null,
        nationalTeam: nationalTeamName || (block.team && block.team.name) || '—',
        side: side,
        club: null,
        clubMinutes: null,
        source: 'squad',
      };
    });
  }

  function isInternationalStat(stat, nationalTeamName) {
    var league = stat.league || {};
    var team = stat.team || {};
    var leagueName = (league.name || '').toLowerCase();

    if (league.country === 'World') return true;
    if (nationalTeamName && team.name === nationalTeamName) return true;

    var intlPatterns = [
      'friendlies', 'world cup', 'qualification', 'qualifying',
      'nations league', 'euro ', 'copa america', 'afc ', 'concacaf',
      'africa cup', 'asian cup', 'olympic', 'confederations',
    ];

    return intlPatterns.some(function (pattern) {
      return leagueName.indexOf(pattern) !== -1;
    });
  }

  function isInternationalFixture(item) {
    if (!item || !item.league) return false;
    return isInternationalStat({ league: item.league, team: {} });
  }

  function isCompletedFixture(item) {
    var statusShort = item.fixture && item.fixture.status && item.fixture.status.short;
    return COMPLETED_STATUSES.indexOf(statusShort) !== -1;
  }

  function pickClubStat(statistics, nationalTeamName) {
    var clubStats = (statistics || []).filter(function (stat) {
      return !isInternationalStat(stat, nationalTeamName);
    });

    if (!clubStats.length) return null;

    clubStats.sort(function (a, b) {
      var minsA = (a.games && a.games.minutes) || 0;
      var minsB = (b.games && b.games.minutes) || 0;
      if (minsB !== minsA) return minsB - minsA;

      var leagueA = (a.league && a.league.name) || '';
      var leagueB = (b.league && b.league.name) || '';
      var cupA = /cup|pokal|copa|coupe|fa |dfb|copa del rey/i.test(leagueA) ? 1 : 0;
      var cupB = /cup|pokal|copa|coupe|fa |dfb|copa del rey/i.test(leagueB) ? 1 : 0;
      return cupA - cupB;
    });

    return clubStats[0];
  }

  function formatClubLastMatch(fixture) {
    if (!fixture) return null;
    var home = fixture.teams.home.name;
    var away = fixture.teams.away.name;
    var date = new Date(fixture.fixture.date);
    var dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return home + ' vs ' + away + ' · ' + dateStr;
  }

  function isGoalkeeper(player) {
    var pos = (player.clubPosition || player.position || '').toLowerCase();
    return pos.indexOf('goalkeeper') !== -1 || pos === 'gk' || pos === 'g';
  }

  function applyProfileFallback(player, profile) {
    var merged = Object.assign({}, player);
    if (!merged.photo && profile && profile.photo) merged.photo = profile.photo;
    if (merged.age == null && profile && profile.age != null) merged.age = profile.age;
    return merged;
  }

  function getAppearances(games) {
    if (!games) return null;
    if (games.appearences != null) return games.appearences;
    if (games.appearances != null) return games.appearances;
    return null;
  }

  function parseStatPremiumFields(stat) {
    if (!stat) return null;

    var games = stat.games || {};
    var goals = stat.goals || {};
    var shots = stat.shots || {};
    var fouls = stat.fouls || {};
    var cards = stat.cards || {};
    var committed = fouls.committed != null ? fouls.committed : null;
    var drawn = fouls.drawn != null ? fouls.drawn : null;
    var foulsTotal = null;

    if (committed != null || drawn != null) {
      foulsTotal = (committed || 0) + (drawn || 0);
    }

    var cardsTotal = null;
    if (cards.yellow != null || cards.red != null) {
      cardsTotal = (cards.yellow || 0) + (cards.red || 0);
    }

    var passes = stat.passes || {};

    return {
      goals: goals.total != null ? goals.total : null,
      assists: goals.assists != null ? goals.assists : null,
      shots: shots.total != null ? shots.total : null,
      fouls: foulsTotal,
      foulsCommitted: committed,
      cards: cardsTotal,
      chancesCreated: passes.key != null ? passes.key : null,
      cornersInvolved: passes.cross != null ? passes.cross : null,
      minutes: games.minutes != null ? games.minutes : null,
      appearances: getAppearances(games),
      rating: games.rating != null ? games.rating : null,
      lastFiveCount: null,
      formRating: games.rating != null ? games.rating : null,
      lastFiveMatchLog: [],
      statsSource: 'season',
    };
  }

  function formatFixtureLogLabel(item) {
    if (!item || !item.fixture) return 'Match';
    var home = item.teams && item.teams.home ? item.teams.home.name : 'Home';
    var away = item.teams && item.teams.away ? item.teams.away.name : 'Away';
    var date = new Date(item.fixture.date);
    var dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return home + ' vs ' + away + ' · ' + dateStr;
  }

  function isClubFixture(item) {
    return item && item.league && !isInternationalFixture(item);
  }

  function selectRecentClubFixtures(items, clubTeamId, limit) {
    return (items || [])
      .filter(function (item) {
        if (!isCompletedFixture(item) || !isClubFixture(item)) return false;
        if (!clubTeamId) return true;
        var homeId = item.teams && item.teams.home && item.teams.home.id;
        var awayId = item.teams && item.teams.away && item.teams.away.id;
        return homeId === clubTeamId || awayId === clubTeamId;
      })
      .sort(function (a, b) {
        return new Date(b.fixture.date) - new Date(a.fixture.date);
      })
      .slice(0, limit);
  }

  function hasQuickStatsData(stats) {
    if (!stats) return false;
    return ['goalsFor', 'goalsAgainst', 'cornersFor', 'cornersAgainst', 'fouls', 'cards', 'shots', 'shotsOnTarget']
      .some(function (key) {
        return stats[key] != null;
      });
  }

  function buildEffectivePremiumFields(player) {
    var club = player.clubPremium || {};
    var national = player.nationalPremium || {};
    var preferClub = player.clubStatsAvailable !== false;
    var primary = preferClub && player.clubPremium ? club : (player.nationalPremium ? national : club);
    var secondary = primary === club ? national : club;
    var source = player.clubStatsAvailable && player.clubPremium
      ? 'club-season'
      : (player.nationalStatsAvailable && player.nationalPremium ? 'national-season' : 'none');

    function pick(key) {
      if (primary[key] != null) return primary[key];
      if (secondary[key] != null) return secondary[key];
      if (key === 'goals' && player.recentGoals != null) return player.recentGoals;
      if (key === 'assists' && player.recentAssists != null) return player.recentAssists;
      if ((key === 'formRating' || key === 'rating') && player.recentFormRating != null) return player.recentFormRating;
      if (key === 'lastFiveCount' && player.lastFiveCount != null) return player.lastFiveCount;
      if (key === 'fouls' && player.recentFouls != null) return player.recentFouls;
      if (key === 'cards' && player.recentCards != null) return player.recentCards;
      if (key === 'shots' && player.recentShots != null) return player.recentShots;
      if (key === 'minutes' && player.clubMinutes != null) return player.clubMinutes;
      if (key === 'minutes' && player.nationalMinutes != null) return player.nationalMinutes;
      if (key === 'appearances' && player.clubAppearances != null) return player.clubAppearances;
      if (key === 'appearances' && player.nationalAppearances != null) return player.nationalAppearances;
      return null;
    }

    return {
      goals: pick('goals'),
      assists: pick('assists'),
      shots: pick('shots'),
      fouls: pick('fouls'),
      foulsCommitted: pick('foulsCommitted'),
      cards: pick('cards'),
      chancesCreated: pick('chancesCreated'),
      cornersInvolved: pick('cornersInvolved'),
      minutes: pick('minutes'),
      appearances: pick('appearances'),
      formRating: pick('formRating'),
      lastFiveCount: pick('lastFiveCount'),
      lastFiveMatchLog: player.lastFiveMatchLog || primary.lastFiveMatchLog || [],
      statsSource: player.recentFormSource || source,
    };
  }

  function finalizePlayerPremiumBlocks(player) {
    var merged = Object.assign({}, player);
    var lastFive = {
      lastFiveCount: merged.lastFiveCount,
      formRating: merged.recentFormRating,
      recentGoals: merged.recentGoals,
      recentAssists: merged.recentAssists,
      recentFouls: merged.recentFouls,
      recentCards: merged.recentCards,
      recentShots: merged.recentShots,
      lastFiveMatchLog: merged.lastFiveMatchLog || [],
      recentFormSource: merged.recentFormSource,
    };

    if (merged.clubPremium) {
      merged.clubPremium = Object.assign({}, merged.clubPremium, lastFive);
      if (merged.recentFormRating != null) merged.clubPremium.formRating = merged.recentFormRating;
    }
    if (merged.nationalPremium) {
      merged.nationalPremium = Object.assign({}, merged.nationalPremium, lastFive);
      if (merged.recentFormRating != null) merged.nationalPremium.formRating = merged.recentFormRating;
    }

    merged.effectivePremium = buildEffectivePremiumFields(merged);
    return merged;
  }

  function aggregateSquadToQuickStats(premiumList) {
    if (!premiumList.length) return emptyQuickStats();

    var count = premiumList.length;
    var sum = {
      goals: 0,
      assists: 0,
      shots: 0,
      fouls: 0,
      cards: 0,
      cornersInvolved: 0,
      chancesCreated: 0,
    };
    var samples = {};

    premiumList.forEach(function (entry) {
      Object.keys(sum).forEach(function (key) {
        if (entry[key] == null) return;
        sum[key] += entry[key];
        samples[key] = (samples[key] || 0) + 1;
      });
    });

    return {
      goalsFor: samples.goals ? formatAverage(sum.goals, count) : null,
      goalsAgainst: null,
      cornersFor: samples.cornersInvolved ? formatAverage(sum.cornersInvolved, count) : null,
      cornersAgainst: null,
      fouls: samples.fouls ? formatAverage(sum.fouls, count) : null,
      cards: samples.cards ? formatAverage(sum.cards, count) : null,
      throwIns: null,
      shots: null,
      shotsOnTarget: null,
    };
  }

  function parseFreeStatFields(stat) {
    if (!stat) return null;
    var games = stat.games || {};
    return {
      appearances: getAppearances(games),
      minutes: games.minutes != null ? games.minutes : null,
      position: games.position || null,
    };
  }

  function averageRating(ratings) {
    var valid = ratings.filter(function (r) {
      return r != null && !isNaN(Number(r));
    });
    if (!valid.length) return null;
    var sum = valid.reduce(function (total, r) {
      return total + Number(r);
    }, 0);
    return Math.round((sum / valid.length) * 10) / 10;
  }

  async function fetchClubTeamFixturesRaw(teamId, season, last) {
    var params = new URLSearchParams({
      team: String(teamId),
      season: String(season),
      last: String(last),
    });
    var data = await fetchProxy(PLAYER_FIXTURES_URL, params, 'club team fixtures', MATCH_DATA_TIMEOUT_MS);
    return data.response || [];
  }

  async function fetchNationalTeamFixturesRaw(teamId, last) {
    var params = new URLSearchParams({
      team: String(teamId),
      last: String(last),
    });
    var data = await fetchProxy(TEAM_FIXTURES_URL, params, 'national team fixtures', MATCH_DATA_TIMEOUT_MS);
    return data.response || [];
  }

  function playerAppearedInFixtureDetail(detail) {
    if (!detail) return false;
    return (detail.minutes != null && detail.minutes > 0)
      || detail.goals != null
      || detail.assists != null
      || detail.rating != null
      || detail.shots != null;
  }

  function resolveClubSeasonCandidates(primarySeason) {
    var seasons = [];
    [primarySeason].concat(CLUB_STATS_SEASON_FALLBACKS).forEach(function (season) {
      if (season != null && seasons.indexOf(season) === -1) seasons.push(season);
    });
    return seasons;
  }

  async function buildLastFiveMatchPremium(playerId, fixturePlayersCache, options) {
    options = options || {};
    var clubTeamId = options.clubTeamId || null;
    var clubSeason = options.clubSeason || CLUB_STATS_SEASON;
    var nationalTeamId = options.nationalTeamId || null;
    var numericPlayerId = Number(playerId);

    var result = {
      lastFiveCount: null,
      formRating: null,
      recentGoals: null,
      recentAssists: null,
      recentFouls: null,
      recentCards: null,
      recentShots: null,
      lastFiveMatchLog: [],
      recentFormSource: null,
      clubSeasonUsed: null,
    };

    logFixtureStats('last5:start', {
      playerId: numericPlayerId,
      clubTeamId: clubTeamId,
      clubSeason: clubSeason,
      nationalTeamId: nationalTeamId,
    });

    try {
      var fixtureCandidates = [];
      var seasonUsed = null;

      if (clubTeamId) {
        var seasonCandidates = resolveClubSeasonCandidates(clubSeason);
        for (var si = 0; si < seasonCandidates.length; si++) {
          var seasonTry = seasonCandidates[si];
          try {
            var clubFixtures = await fetchClubTeamFixturesRaw(
              clubTeamId,
              seasonTry,
              RECENT_FORM_FETCH_BUFFER
            );
            var completedClub = selectRecentClubFixtures(clubFixtures, clubTeamId, RECENT_FORM_FETCH_BUFFER);
            if (completedClub.length) {
              fixtureCandidates = completedClub;
              seasonUsed = seasonTry;
              result.recentFormSource = 'club-team-fixtures';
              result.clubSeasonUsed = seasonTry;
              logFixtureStats('last5:club-fixtures', {
                playerId: numericPlayerId,
                clubTeamId: clubTeamId,
                season: seasonTry,
                count: completedClub.length,
              });
              break;
            }
          } catch (e) {
            logFixtureStats('last5:club-fixtures-error', {
              playerId: numericPlayerId,
              season: seasonTry,
              error: e.message,
            });
          }
        }
      }

      if (!fixtureCandidates.length && nationalTeamId) {
        try {
          var nationalFixtures = await fetchNationalTeamFixturesRaw(nationalTeamId, RECENT_FORM_FETCH_BUFFER);
          fixtureCandidates = selectRecentInternationalFixtures(
            nationalFixtures,
            nationalTeamId,
            RECENT_FORM_FETCH_BUFFER
          );
          if (fixtureCandidates.length) {
            result.recentFormSource = 'national-team-fixtures';
            logFixtureStats('last5:national-fixtures', {
              playerId: numericPlayerId,
              nationalTeamId: nationalTeamId,
              count: fixtureCandidates.length,
            });
          }
        } catch (e) {
          logFixtureStats('last5:national-fixtures-error', {
            playerId: numericPlayerId,
            error: e.message,
          });
        }
      }

      if (!fixtureCandidates.length) {
        result.lastFiveDiagnosis = clubTeamId
          ? 'No completed club fixtures returned from GET /fixtures?team=' + clubTeamId + '&season=' + clubSeason + '&last=N'
          : 'No club team id available from /players season stats — cannot fetch last 5 club matches.';
        logFixtureStats('last5:empty', {
          playerId: numericPlayerId,
          clubTeamId: clubTeamId,
          diagnosis: result.lastFiveDiagnosis,
        });
        return result;
      }

      var ratings = [];
      var goalsTotal = 0;
      var assistsTotal = 0;
      var foulsTotal = 0;
      var cardsTotal = 0;
      var shotsTotal = 0;
      var hasGoalData = false;
      var hasAssistData = false;
      var hasFoulData = false;
      var hasCardData = false;
      var hasShotData = false;
      var log = [];

      for (var i = 0; i < fixtureCandidates.length && log.length < RECENT_FORM_MATCH_COUNT; i++) {
        var item = fixtureCandidates[i];
        if (!item.fixture || !item.fixture.id) continue;

        var label = formatFixtureLogLabel(item);
        var logEntry = {
          match: label,
          goals: null,
          assists: null,
          rating: null,
          minutes: null,
        };

        try {
          var fixturePlayersData = await fetchFixturePlayersData(item.fixture.id, fixturePlayersCache);
          var detail = parseFixturePlayerMatchStats(fixturePlayersData, numericPlayerId, label);

          if (!playerAppearedInFixtureDetail(detail)) {
            logFixtureStats('last5:player-absent', {
              playerId: numericPlayerId,
              fixtureId: item.fixture.id,
            });
            continue;
          }

          logEntry.rating = detail.rating;
          logEntry.minutes = detail.minutes;
          logEntry.goals = detail.goals;
          logEntry.assists = detail.assists;

          if (detail.rating != null) ratings.push(detail.rating);
          if (detail.goals != null) {
            goalsTotal += detail.goals;
            hasGoalData = true;
          }
          if (detail.assists != null) {
            assistsTotal += detail.assists;
            hasAssistData = true;
          }
          if (detail.foulsCommitted != null) {
            foulsTotal += detail.foulsCommitted;
            hasFoulData = true;
          }
          if (detail.yellowCards != null || detail.redCards != null) {
            cardsTotal += (detail.yellowCards || 0) + (detail.redCards || 0);
            hasCardData = true;
          }
          if (detail.shots != null) {
            shotsTotal += detail.shots;
            hasShotData = true;
          }

          log.push(logEntry);
        } catch (e) {
          logFixtureStats('last5:match-miss', {
            playerId: numericPlayerId,
            fixtureId: item.fixture.id,
            error: e.message,
          });
        }
      }

      result.lastFiveCount = log.length || null;
      result.formRating = averageRating(ratings);
      result.recentGoals = hasGoalData ? goalsTotal : null;
      result.recentAssists = hasAssistData ? assistsTotal : null;
      result.recentFouls = hasFoulData ? foulsTotal : null;
      result.recentCards = hasCardData ? cardsTotal : null;
      result.recentShots = hasShotData ? shotsTotal : null;
      result.lastFiveMatchLog = log;

      if (!log.length) {
        result.lastFiveDiagnosis = 'Fixtures returned for team but player not found in GET /fixtures/players for those matches.';
      }

      logFixtureStats('last5:done', {
        playerId: numericPlayerId,
        source: result.recentFormSource,
        seasonUsed: seasonUsed,
        matchesScanned: fixtureCandidates.length,
        matchesLogged: log.length,
      });
    } catch (e) {
      result.lastFiveDiagnosis = e.message;
      logFixtureStats('last5:error', { playerId: numericPlayerId, error: e.message });
    }

    return result;
  }

  async function fetchPlayerStatisticsBundle(playerId) {
    var seasons = [WORLD_CUP_SEASON].concat(CLUB_STATS_SEASON_FALLBACKS);
    var statistics = [];
    var profile = null;
    var seen = {};

    for (var i = 0; i < seasons.length; i++) {
      try {
        var params = new URLSearchParams({
          id: String(playerId),
          season: String(seasons[i]),
        });
        var data = await fetchProxy(PLAYERS_URL, params, 'player stats', MATCH_DATA_TIMEOUT_MS);
        var entry = data.response && data.response[0];
        if (!entry) continue;
        if (entry.player) profile = entry.player;
        (entry.statistics || []).forEach(function (stat) {
          var leagueId = stat.league && stat.league.id;
          var seasonVal = stat.league && stat.league.season;
          var teamId = stat.team && stat.team.id;
          var dedupeKey = [leagueId, seasonVal, teamId].join(':');
          if (seen[dedupeKey]) return;
          seen[dedupeKey] = true;
          statistics.push(stat);
        });
      } catch (e) {
        logFixtureStats('player-stats:season-miss', { playerId: playerId, season: seasons[i], error: e.message });
      }
    }

    return { profile: profile, statistics: statistics };
  }

  function parseNationalSeasonStats(statistics, player) {
    var intlStat = pickInternationalStat(statistics, player.nationalTeam);
    if (!intlStat) {
      return { nationalStatsAvailable: false };
    }

    var freeFields = parseFreeStatFields(intlStat);
    var premium = parseStatPremiumFields(intlStat);

    return {
      nationalStatsAvailable: true,
      nationalAppearances: freeFields.appearances,
      nationalMinutes: freeFields.minutes,
      nationalPosition: freeFields.position || player.position || null,
      nationalPremium: premium,
    };
  }

  function parseClubSeasonStats(data, player) {
    var entry = data.response && data.response[0];
    if (!entry) {
      return { clubStatsAvailable: false };
    }

    var profile = entry.player || {};
    var clubStat = pickClubStat(entry.statistics, player.nationalTeam);

    if (!clubStat || !clubStat.team) {
      return Object.assign({ clubStatsAvailable: false }, applyProfileFallback({}, profile));
    }

    var games = clubStat.games || {};
    var team = clubStat.team;
    var freeFields = parseFreeStatFields(clubStat);
    var premium = parseStatPremiumFields(clubStat);

    return Object.assign({
      clubStatsAvailable: true,
      club: team.name,
      clubLogo: team.logo || null,
      clubTeamId: team.id,
      clubLeague: clubStat.league ? clubStat.league.name : null,
      clubLeagueId: clubStat.league ? clubStat.league.id : null,
      clubSeason: clubStat.league && clubStat.league.season != null
        ? clubStat.league.season
        : CLUB_STATS_SEASON,
      clubPosition: freeFields.position || games.position || null,
      clubAge: profile.age != null ? profile.age : null,
      clubAppearances: freeFields.appearances,
      clubMinutes: freeFields.minutes,
      clubPremium: premium,
      clubLastMatch: null,
      clubLastMatchDetail: null,
      isGoalkeeper: isGoalkeeper({
        clubPosition: games.position,
        position: player.position,
      }),
    }, applyProfileFallback({}, profile));
  }

  function parseFixturePlayerMatchStats(data, playerId, fixtureLabel) {
    var empty = { match: fixtureLabel || null };
    var allTeams = data.response || [];
    var found = null;

    allTeams.forEach(function (teamBlock) {
      (teamBlock.players || []).forEach(function (entry) {
        if (entry.player && Number(entry.player.id) === Number(playerId)) {
          found = entry;
        }
      });
    });

    if (!found) return empty;

    var stats = found.statistics && found.statistics[0];
    if (!stats) return empty;

    var games = stats.games || {};
    var goals = stats.goals || {};
    var shots = stats.shots || {};
    var fouls = stats.fouls || {};
    var cards = stats.cards || {};

    return {
      match: fixtureLabel || null,
      photo: found.player && found.player.photo ? found.player.photo : null,
      minutes: games.minutes != null ? games.minutes : null,
      goals: goals.total != null ? goals.total : null,
      assists: goals.assists != null ? goals.assists : null,
      shots: shots.total != null ? shots.total : null,
      shotsOnTarget: shots.on != null ? shots.on : null,
      foulsCommitted: fouls.committed != null ? fouls.committed : null,
      foulsDrawn: fouls.drawn != null ? fouls.drawn : null,
      yellowCards: cards.yellow != null ? cards.yellow : null,
      redCards: cards.red != null ? cards.red : null,
      rating: games.rating != null ? games.rating : null,
      saves: goals.saves != null ? goals.saves : null,
      goalsConceded: goals.conceded != null ? goals.conceded : null,
      position: games.position || null,
    };
  }

  async function fetchLastClubFixtureRaw(teamId, season) {
    var params = new URLSearchParams({
      team: String(teamId),
      season: String(season),
      last: '1',
    });
    var data = await fetchProxy(PLAYER_FIXTURES_URL, params, 'club fixtures', MATCH_DATA_TIMEOUT_MS);
    return data.response && data.response[0];
  }

  async function fetchFixturePlayersData(fixtureId, cache) {
    if (cache[fixtureId]) return cache[fixtureId];
    var params = new URLSearchParams({ fixture: String(fixtureId) });
    var promise = fetchProxy(FIXTURE_PLAYERS_URL, params, 'fixture players', MATCH_DATA_TIMEOUT_MS);
    cache[fixtureId] = promise;
    return promise;
  }

  async function enrichPlayersWithClubStats(players, limit, fixture) {
    var slice = players.slice(0, limit || players.length);
    var fixturePlayersCache = {};

    var enriched = await mapWithConcurrency(slice, MATCH_PLAYER_ENRICH_CONCURRENCY, async function (player) {
      if (!player.id) {
        return finalizePlayerPremiumBlocks(Object.assign({}, player, {
          clubStatsAvailable: false,
          nationalStatsAvailable: false,
        }));
      }

      try {
        var bundle = await fetchPlayerStatisticsBundle(player.id);
        var profile = bundle.profile;
        var clubData = parseClubSeasonStats({ response: [{ player: profile, statistics: bundle.statistics }] }, player);
        var nationalData = parseNationalSeasonStats(bundle.statistics, player);
        var merged = applyProfileFallback(Object.assign({}, player, clubData, nationalData), profile);

        var nationalTeamId = null;
        if (fixture) {
          nationalTeamId = player.side === 'away' ? fixture.awayId : fixture.homeId;
        }

        try {
          var lastFive = await buildLastFiveMatchPremium(player.id, fixturePlayersCache, {
            clubTeamId: merged.clubTeamId || null,
            clubSeason: merged.clubSeason || CLUB_STATS_SEASON,
            nationalTeamId: nationalTeamId,
          });

          merged.recentFormRating = lastFive.formRating;
          merged.recentGoals = lastFive.recentGoals;
          merged.recentAssists = lastFive.recentAssists;
          merged.recentFouls = lastFive.recentFouls;
          merged.recentCards = lastFive.recentCards;
          merged.recentShots = lastFive.recentShots;
          merged.lastFiveCount = lastFive.lastFiveCount;
          merged.lastFiveMatchLog = lastFive.lastFiveMatchLog;
          merged.recentFormSource = lastFive.recentFormSource;
          merged.clubSeasonUsed = lastFive.clubSeasonUsed;
          merged.lastFiveDiagnosis = lastFive.lastFiveDiagnosis || null;
        } catch (e) {
          logFixtureStats('enrich:last5-failed', { playerId: player.id, error: e.message });
        }

        if (!merged.photo && profile && profile.photo) {
          merged.photo = profile.photo;
        }

        logFixtureStats('enrich:player', {
          playerId: player.id,
          name: player.name,
          clubAvailable: merged.clubStatsAvailable,
          nationalAvailable: merged.nationalStatsAvailable,
          clubGoals: merged.clubPremium && merged.clubPremium.goals,
          recentFormSource: merged.recentFormSource,
        });

        return finalizePlayerPremiumBlocks(merged);
      } catch (e) {
        logFixtureStats('enrich:failed', { playerId: player.id, error: e.message });
        return finalizePlayerPremiumBlocks(Object.assign({}, player, {
          clubStatsAvailable: false,
          nationalStatsAvailable: false,
        }));
      }
    });

    return enriched.concat(players.slice(slice.length));
  }

  async function fetchLineups(fixtureId) {
    var params = new URLSearchParams({ fixture: String(fixtureId) });
    return fetchProxy(LINEUPS_URL, params, 'lineups', MATCH_DATA_TIMEOUT_MS);
  }

  async function fetchSquad(teamId) {
    var params = new URLSearchParams({ team: String(teamId) });
    return fetchProxy(SQUADS_URL, params, 'squad', MATCH_DATA_TIMEOUT_MS);
  }

  function sumCardTotals(cards) {
    if (!cards) return null;
    var total = 0;
    var hasAny = false;

    ['yellow', 'red'].forEach(function (color) {
      var bucket = cards[color];
      if (!bucket || typeof bucket !== 'object') return;
      Object.keys(bucket).forEach(function (key) {
        var entry = bucket[key];
        if (entry && entry.total != null) {
          total += entry.total;
          hasAny = true;
        }
      });
    });

    return hasAny ? total : null;
  }

  function emptyQuickStats() {
    return {
      goalsFor: null,
      goalsAgainst: null,
      cornersFor: null,
      cornersAgainst: null,
      fouls: null,
      cards: null,
      throwIns: null,
      shots: null,
      shotsOnTarget: null,
    };
  }

  function formatAverage(total, count) {
    if (count <= 0 || total == null) return null;
    return Math.round((total / count) * 10) / 10;
  }

  function hasWorldCupTournamentStats(data) {
    var stats = data && data.response;
    if (!stats) return false;
    var played = stats.fixtures && stats.fixtures.played && stats.fixtures.played.total;
    return played != null && played > 0;
  }

  function parseTournamentQuickStats(data) {
    var stats = data.response;
    if (!stats) return emptyQuickStats();

    var matchesPlayed = stats.fixtures && stats.fixtures.played
      ? stats.fixtures.played.total
      : null;
    var goalsFor = stats.goals && stats.goals.for && stats.goals.for.total
      ? stats.goals.for.total.total
      : null;
    var goalsAgainst = stats.goals && stats.goals.against && stats.goals.against.total
      ? stats.goals.against.total.total
      : null;
    var cardTotal = sumCardTotals(stats.cards);

    return {
      goalsFor: goalsFor,
      goalsAgainst: goalsAgainst,
      cornersFor: null,
      cornersAgainst: null,
      fouls: null,
      cards: formatAverage(cardTotal, matchesPlayed),
      throwIns: null,
      shots: null,
      shotsOnTarget: null,
    };
  }

  function parseTeamSeasonQuickStats(data) {
    return parseTournamentQuickStats(data);
  }

  function selectRecentInternationalFixtures(items, teamId, limit) {
    return (items || [])
      .filter(function (item) {
        if (!isInternationalFixture(item) || !isCompletedFixture(item)) return false;
        var homeId = item.teams && item.teams.home && item.teams.home.id;
        var awayId = item.teams && item.teams.away && item.teams.away.id;
        return homeId === teamId || awayId === teamId;
      })
      .sort(function (a, b) {
        return new Date(b.fixture.date) - new Date(a.fixture.date);
      })
      .slice(0, limit);
  }

  function getFixtureSideGoals(item, teamId) {
    var homeId = item.teams.home.id;
    var awayId = item.teams.away.id;
    var homeScore = item.goals.home;
    var awayScore = item.goals.away;

    if (homeScore == null || awayScore == null) return null;

    if (teamId === homeId) {
      return { goalsFor: homeScore, goalsAgainst: awayScore };
    }
    if (teamId === awayId) {
      return { goalsFor: awayScore, goalsAgainst: homeScore };
    }
    return null;
  }

  async function fetchTeamRecentFixtures(teamId, last) {
    var params = new URLSearchParams({
      team: String(teamId),
      last: String(last),
    });
    return fetchProxy(TEAM_FIXTURES_URL, params, 'team fixtures', MATCH_DATA_TIMEOUT_MS);
  }

  async function fetchFixtureStatisticsCached(fixtureId, cache) {
    if (cache[fixtureId]) return cache[fixtureId];
    var promise = fetchFixtureStatistics(fixtureId);
    cache[fixtureId] = promise;
    return promise;
  }

  async function buildRecentInternationalQuickStats(teamId) {
    var data = await fetchTeamRecentFixtures(teamId, RECENT_FORM_FETCH_BUFFER);
    var fixtures = selectRecentInternationalFixtures(data.response, teamId, RECENT_FORM_MATCH_COUNT);

    logFixtureStats('intl-team-stats:start', {
      teamId: teamId,
      fixturesReturned: (data.response || []).length,
      internationalFixturesUsed: fixtures.length,
      fixtureIds: fixtures.map(function (item) { return item.fixture && item.fixture.id; }),
    });

    if (!fixtures.length) {
      return Object.assign(emptyQuickStats(), {
        intlFixturesUsed: 0,
        intlFixtureIds: [],
      });
    }

    var statsCache = {};
    var totals = {
      goalsFor: 0,
      goalsAgainst: 0,
      cornersFor: 0,
      cornersAgainst: 0,
      fouls: 0,
      cards: 0,
      shots: 0,
      shotsOnTarget: 0,
      throwIns: 0,
      matches: 0,
      cornerSamples: 0,
      foulSamples: 0,
      cardSamples: 0,
      shotSamples: 0,
      shotsOnTargetSamples: 0,
      throwInSamples: 0,
    };

    for (var i = 0; i < fixtures.length; i++) {
      var item = fixtures[i];
      var goals = getFixtureSideGoals(item, teamId);
      if (!goals) continue;

      totals.goalsFor += goals.goalsFor;
      totals.goalsAgainst += goals.goalsAgainst;
      totals.matches += 1;

      try {
        var fixtureStatsData = await fetchFixtureStatisticsCached(item.fixture.id, statsCache);
        var matchStats = parseFixtureTeamStats(
          fixtureStatsData,
          item.teams.home.id,
          item.teams.away.id
        );
        var side = item.teams.home.id === teamId ? 'home' : 'away';
        var teamStats = matchStats[side];

        if (teamStats.cornersFor != null) {
          totals.cornersFor += teamStats.cornersFor;
          totals.cornersAgainst += teamStats.cornersAgainst != null ? teamStats.cornersAgainst : 0;
          totals.cornerSamples += 1;
        }
        if (teamStats.fouls != null) {
          totals.fouls += teamStats.fouls;
          totals.foulSamples += 1;
        }
        if (teamStats.cards != null) {
          totals.cards += teamStats.cards;
          totals.cardSamples += 1;
        }
        if (teamStats.shots != null) {
          totals.shots += teamStats.shots;
          totals.shotSamples += 1;
        }
        if (teamStats.shotsOnTarget != null) {
          totals.shotsOnTarget += teamStats.shotsOnTarget;
          totals.shotsOnTargetSamples += 1;
        }
        if (teamStats.throwIns != null) {
          totals.throwIns += teamStats.throwIns;
          totals.throwInSamples += 1;
        }
      } catch (e) {
        logFixtureStats('intl-team-stats:fixture-miss', {
          teamId: teamId,
          fixtureId: item.fixture.id,
          error: e.message,
        });
      }
    }

    if (!totals.matches) {
      return Object.assign(emptyQuickStats(), {
        intlFixturesUsed: 0,
        intlFixtureIds: fixtures.map(function (item) { return item.fixture.id; }),
      });
    }

    var result = {
      goalsFor: totals.goalsFor,
      goalsAgainst: totals.goalsAgainst,
      cornersFor: formatAverage(totals.cornersFor, totals.cornerSamples),
      cornersAgainst: formatAverage(totals.cornersAgainst, totals.cornerSamples),
      fouls: formatAverage(totals.fouls, totals.foulSamples),
      cards: formatAverage(totals.cards, totals.cardSamples),
      throwIns: totals.throwInSamples ? formatAverage(totals.throwIns, totals.throwInSamples) : null,
      shots: totals.shotSamples ? formatAverage(totals.shots, totals.shotSamples) : null,
      shotsOnTarget: totals.shotsOnTargetSamples
        ? formatAverage(totals.shotsOnTarget, totals.shotsOnTargetSamples)
        : null,
      intlFixturesUsed: fixtures.length,
      intlFixtureIds: fixtures.map(function (item) { return item.fixture.id; }),
    };

    logFixtureStats('intl-team-stats:done', {
      teamId: teamId,
      fixturesUsed: result.intlFixturesUsed,
      statSamples: {
        shots: totals.shotSamples,
        shotsOnTarget: totals.shotsOnTargetSamples,
        throwIns: totals.throwInSamples,
      },
      stats: result,
    });

    return result;
  }

  function mergeInternationalShootingStats(baseStats, intlStats) {
    if (!intlStats) return baseStats;
    return Object.assign({}, baseStats, {
      shots: intlStats.shots,
      shotsOnTarget: intlStats.shotsOnTarget,
      throwIns: intlStats.throwIns,
      intlFixturesUsed: intlStats.intlFixturesUsed || 0,
      intlFixtureIds: intlStats.intlFixtureIds || [],
    });
  }

  async function enrichTournamentQuickStatsWithFixtureAverages(teamId, quickStats) {
    try {
      var params = new URLSearchParams({
        league: String(WORLD_CUP_LEAGUE),
        season: String(WORLD_CUP_SEASON),
        team: String(teamId),
      });
      var data = await fetchProxy(FIXTURES_URL, params, 'world cup team fixtures', MATCH_DATA_TIMEOUT_MS);
      var completed = (data.response || []).filter(function (item) {
        return isCompletedFixture(item) && item.league && item.league.id === WORLD_CUP_LEAGUE;
      });

      if (!completed.length) return quickStats;

      var statsCache = {};
      var totals = {
        cornersFor: 0,
        cornersAgainst: 0,
        fouls: 0,
        cards: 0,
        cornerSamples: 0,
        foulSamples: 0,
        cardSamples: 0,
      };

      for (var i = 0; i < completed.length; i++) {
        var item = completed[i];

        try {
          var fixtureStatsData = await fetchFixtureStatisticsCached(item.fixture.id, statsCache);
          var matchStats = parseFixtureTeamStats(
            fixtureStatsData,
            item.teams.home.id,
            item.teams.away.id
          );
          var side = item.teams.home.id === teamId ? 'home' : 'away';
          var teamStats = matchStats[side];

          if (teamStats.cornersFor != null) {
            totals.cornersFor += teamStats.cornersFor;
            totals.cornersAgainst += teamStats.cornersAgainst != null ? teamStats.cornersAgainst : 0;
            totals.cornerSamples += 1;
          }
          if (teamStats.fouls != null) {
            totals.fouls += teamStats.fouls;
            totals.foulSamples += 1;
          }
          if (teamStats.cards != null) {
            totals.cards += teamStats.cards;
            totals.cardSamples += 1;
          }
        } catch (e) {
          /* fixture statistics unavailable for this match */
        }
      }

      if (!totals.cornerSamples && !totals.foulSamples && !totals.cardSamples) return quickStats;

      return Object.assign({}, quickStats, {
        cornersFor: formatAverage(totals.cornersFor, totals.cornerSamples),
        cornersAgainst: formatAverage(totals.cornersAgainst, totals.cornerSamples),
        fouls: formatAverage(totals.fouls, totals.foulSamples),
        cards: quickStats.cards != null
          ? quickStats.cards
          : formatAverage(totals.cards, totals.cardSamples),
      });
    } catch (e) {
      return quickStats;
    }
  }

  async function fetchSquadClubFormQuickStats(teamId, teamName) {
    logFixtureStats('club-squad:start', { teamId: teamId, teamName: teamName });

    try {
      var squadData = await fetchSquad(teamId);
      var squadPlayers = parseSquadPlayers(squadData, 'home', teamName).slice(0, 14);

      if (!squadPlayers.length) {
        logFixtureStats('club-squad:empty-squad', { teamId: teamId });
        return null;
      }

      var premiums = await mapWithConcurrency(squadPlayers, 4, async function (squadPlayer) {
        if (!squadPlayer.id) return null;
        try {
          var bundle = await fetchPlayerStatisticsBundle(squadPlayer.id);
          var clubStat = pickClubStat(bundle.statistics, teamName);
          if (!clubStat) return null;
          var premium = parseStatPremiumFields(clubStat);
          premium.statsSource = 'club-season';
          return premium;
        } catch (e) {
          return null;
        }
      });

      var valid = premiums.filter(Boolean);
      if (!valid.length) {
        logFixtureStats('club-squad:no-club-stats', { teamId: teamId, squadSize: squadPlayers.length });
        return null;
      }

      var stats = aggregateSquadToQuickStats(valid);
      logFixtureStats('club-squad:done', {
        teamId: teamId,
        playersWithStats: valid.length,
        stats: stats,
      });
      return stats;
    } catch (e) {
      logFixtureStats('club-squad:error', { teamId: teamId, error: e.message });
      return null;
    }
  }

  async function fetchTeamQuickStatsForMatch(teamId, worldCupData, teamName) {
    var intlShootingStats = await buildRecentInternationalQuickStats(teamId);

    if (hasWorldCupTournamentStats(worldCupData)) {
      var tournamentStats = parseTournamentQuickStats(worldCupData);
      var enriched = await enrichTournamentQuickStatsWithFixtureAverages(teamId, tournamentStats);
      enriched = mergeInternationalShootingStats(enriched, intlShootingStats);
      logFixtureStats('team-quick:tournament', { teamId: teamId, stats: enriched });
      return { stats: enriched, source: 'tournament' };
    }

    try {
      var recentIntl = intlShootingStats;
      if (hasQuickStatsData(recentIntl)) {
        logFixtureStats('team-quick:recent-intl', { teamId: teamId, stats: recentIntl });
        return { stats: recentIntl, source: 'recent-international' };
      }
    } catch (e) {
      logFixtureStats('team-quick:recent-intl-error', { teamId: teamId, error: e.message });
    }

    var clubStats = await fetchSquadClubFormQuickStats(teamId, teamName);
    if (clubStats && hasQuickStatsData(clubStats)) {
      var mergedClub = mergeInternationalShootingStats(clubStats, intlShootingStats);
      return { stats: mergedClub, source: 'club-squad-aggregate' };
    }

    logFixtureStats('team-quick:empty', { teamId: teamId, teamName: teamName });
    return {
      stats: mergeInternationalShootingStats(emptyQuickStats(), intlShootingStats),
      source: 'none',
    };
  }

  function parseFixtureStatValue(statistics, type) {
    if (!statistics) return null;
    var entry = statistics.find(function (s) { return s.type === type; });
    if (!entry || entry.value == null || entry.value === '') return null;
    if (typeof entry.value === 'string' && entry.value.indexOf('%') !== -1) return null;
    var num = Number(entry.value);
    return isNaN(num) ? entry.value : num;
  }

  function parseFixtureTeamStats(data, homeId, awayId) {
    var result = {
      home: emptyQuickStats(),
      away: emptyQuickStats(),
    };

    (data.response || []).forEach(function (block) {
      var side = block.team.id === homeId ? 'home' : block.team.id === awayId ? 'away' : null;
      if (!side) return;

      var stats = block.statistics;
      result[side].cornersFor = parseFixtureStatValue(stats, 'Corner Kicks');
      result[side].fouls = parseFixtureStatValue(stats, 'Fouls');
      result[side].shots = parseFixtureStatValue(stats, 'Total Shots');
      result[side].shotsOnTarget = parseFixtureStatValue(stats, 'Shots on Goal');
      result[side].throwIns = parseFixtureStatValue(stats, 'Throw-in')
        || parseFixtureStatValue(stats, 'Throw In')
        || parseFixtureStatValue(stats, 'Throw-ins');

      var yellow = parseFixtureStatValue(stats, 'Yellow Cards') || 0;
      var red = parseFixtureStatValue(stats, 'Red Cards') || 0;
      if (yellow || red) {
        result[side].cards = yellow + red;
      }
    });

    result.home.cornersAgainst = result.away.cornersFor;
    result.away.cornersAgainst = result.home.cornersFor;

    return result;
  }

  function applyMatchScoreToQuickStats(quickStats, fixture) {
    if (fixture.homeScore == null || fixture.awayScore == null) return quickStats;

    return Object.assign({}, quickStats, {
      home: Object.assign({}, quickStats.home, {
        goalsFor: fixture.homeScore,
        goalsAgainst: fixture.awayScore,
      }),
      away: Object.assign({}, quickStats.away, {
        goalsFor: fixture.awayScore,
        goalsAgainst: fixture.homeScore,
      }),
    });
  }

  async function fetchTeamStatistics(teamId, league, season) {
    var params = new URLSearchParams({
      team: String(teamId),
      league: String(league),
      season: String(season),
    });
    return fetchProxy(TEAM_STATISTICS_URL, params, 'team statistics', MATCH_DATA_TIMEOUT_MS);
  }

  async function fetchFixtureStatistics(fixtureId) {
    var params = new URLSearchParams({ fixture: String(fixtureId) });
    return fetchProxy(FIXTURE_STATISTICS_URL, params, 'fixture statistics', MATCH_DATA_TIMEOUT_MS);
  }

  async function fetchMatchTeamQuickStats(fixture) {
    var isMatchDay = fixture.status === 'completed' || fixture.status === 'live';
    var quickStats = {
      home: emptyQuickStats(),
      away: emptyQuickStats(),
      isMatchDay: isMatchDay,
      statsSource: 'none',
      debug: {
        endpoints: ['/api/team-statistics', '/api/team-fixtures', '/api/fixture-statistics', '/api/squads', '/api/players'],
        homeSource: null,
        awaySource: null,
      },
    };

    logFixtureStats('match-quick:start', {
      fixtureId: fixture.id,
      home: fixture.home,
      away: fixture.away,
      status: fixture.status,
    });

    if (!fixture.homeId || !fixture.awayId) return quickStats;

    var homeWorldCupData = null;
    var awayWorldCupData = null;

    var worldCupStatsResults = await Promise.all([
      fetchTeamStatistics(fixture.homeId, WORLD_CUP_LEAGUE, WORLD_CUP_SEASON).catch(function () { return null; }),
      fetchTeamStatistics(fixture.awayId, WORLD_CUP_LEAGUE, WORLD_CUP_SEASON).catch(function () { return null; }),
    ]);

    homeWorldCupData = worldCupStatsResults[0];
    awayWorldCupData = worldCupStatsResults[1];

    try {
      var teamStats = await Promise.all([
        fetchTeamQuickStatsForMatch(fixture.homeId, homeWorldCupData, fixture.home),
        fetchTeamQuickStatsForMatch(fixture.awayId, awayWorldCupData, fixture.away),
      ]);

      quickStats.home = teamStats[0].stats;
      quickStats.away = teamStats[1].stats;
      quickStats.statsSource = teamStats[0].source === teamStats[1].source
        ? teamStats[0].source
        : 'mixed';
      quickStats.debug.homeSource = teamStats[0].source;
      quickStats.debug.awaySource = teamStats[1].source;
    } catch (e) {
      logFixtureStats('match-quick:error', { fixtureId: fixture.id, error: e.message });
    }

    if (isMatchDay) {
      try {
        var fixtureStats = await fetchFixtureStatistics(fixture.id);
        var matchStats = parseFixtureTeamStats(fixtureStats, fixture.homeId, fixture.awayId);
        quickStats.home = Object.assign({}, quickStats.home, matchStats.home);
        quickStats.away = Object.assign({}, quickStats.away, matchStats.away);
        quickStats = applyMatchScoreToQuickStats(quickStats, fixture);
        quickStats.statsSource = 'match-day';
        quickStats.debug.matchDayStats = true;
        logFixtureStats('match-quick:match-day', { fixtureId: fixture.id, stats: quickStats });
      } catch (e) {
        logFixtureStats('match-quick:match-day-miss', { fixtureId: fixture.id, error: e.message });
      }
    }

    logFixtureStats('match-quick:done', {
      fixtureId: fixture.id,
      statsSource: quickStats.statsSource,
      home: quickStats.home,
      away: quickStats.away,
      debug: quickStats.debug,
    });

    console.info('[EdgeStats:TeamQuickStats]', {
      fixtureId: fixture.id,
      homeTeamId: fixture.homeId,
      awayTeamId: fixture.awayId,
      statsSource: quickStats.statsSource,
      homeIntlFixtures: quickStats.home && quickStats.home.intlFixturesUsed,
      awayIntlFixtures: quickStats.away && quickStats.away.intlFixturesUsed,
      homeShots: quickStats.home && quickStats.home.shots,
      awayShots: quickStats.away && quickStats.away.shots,
      homeThrowIns: quickStats.home && quickStats.home.throwIns,
      awayThrowIns: quickStats.away && quickStats.away.throwIns,
    });

    return quickStats;
  }

  function normalizeRankingPlayer(item, value) {
    var stats = item.statistics && item.statistics.length ? item.statistics[0] : null;

    return {
      id: item.player.id,
      name: item.player.name,
      photo: item.player.photo,
      team: stats && stats.team ? stats.team.name : '',
      teamLogo: stats && stats.team ? stats.team.logo : '',
      value: value != null ? value : 0,
    };
  }

  function extractTopApiValue(stats, metric) {
    if (!stats) return 0;

    switch (metric) {
      case 'goals':
        return stats.goals && stats.goals.total != null ? stats.goals.total : 0;
      case 'assists':
        return stats.goals && stats.goals.assists != null ? stats.goals.assists : 0;
      case 'cards':
        return (stats.cards && stats.cards.yellow != null ? stats.cards.yellow : 0)
          + (stats.cards && stats.cards.red != null ? stats.cards.red : 0);
      case 'foulsDrawn':
        return stats.fouls && stats.fouls.drawn != null ? stats.fouls.drawn : 0;
      case 'corners':
        if (stats.passes && stats.passes.cross != null) return stats.passes.cross;
        return stats.passes && stats.passes.key != null ? stats.passes.key : 0;
      default:
        return 0;
    }
  }

  function normalizeTopApiPlayer(item, metric) {
    var stats = item.statistics && item.statistics.length ? item.statistics[0] : null;
    return normalizeRankingPlayer(item, extractTopApiValue(stats, metric));
  }

  async function fetchTopPlayersRanking(type, metric) {
    var params = new URLSearchParams({
      type: type,
      league: String(WORLD_CUP_LEAGUE),
      season: String(WORLD_CUP_SEASON),
    });

    var data = await fetchProxy(TOP_PLAYERS_URL, params, 'top players');
    return (data.response || [])
      .map(function (item) {
        return normalizeTopApiPlayer(item, metric);
      })
      .filter(function (player) {
        return player.value > 0;
      })
      .sort(function (a, b) {
        return b.value - a.value;
      })
      .slice(0, PREMIUM_PREVIEW_LIMIT);
  }

  function pickInternationalStat(statistics, nationalTeamName) {
    var intlStats = (statistics || []).filter(function (stat) {
      return isInternationalStat(stat, nationalTeamName);
    });

    if (!intlStats.length) return null;

    intlStats.sort(function (a, b) {
      var minsA = (a.games && a.games.minutes) || 0;
      var minsB = (b.games && b.games.minutes) || 0;
      return minsB - minsA;
    });

    return intlStats[0];
  }

  function pickPlayerSeasonStat(statistics, nationalTeamName, preferInternational) {
    if (preferInternational) {
      var intlStat = pickInternationalStat(statistics, nationalTeamName);
      if (intlStat) return intlStat;
    }
    return pickClubStat(statistics, nationalTeamName);
  }

  function buildRankingFromSeasonStat(player, seasonStat) {
    if (!seasonStat) return null;

    return {
      id: player.id,
      name: player.name,
      photo: player.photo,
      team: player.nationalTeam || (seasonStat.team && seasonStat.team.name) || '',
      teamLogo: seasonStat.team && seasonStat.team.logo ? seasonStat.team.logo : null,
      goals: seasonStat.goals && seasonStat.goals.total != null ? seasonStat.goals.total : 0,
      assists: seasonStat.goals && seasonStat.goals.assists != null ? seasonStat.goals.assists : 0,
      foulsDrawn: seasonStat.fouls && seasonStat.fouls.drawn != null ? seasonStat.fouls.drawn : 0,
      cards: (seasonStat.cards && seasonStat.cards.yellow != null ? seasonStat.cards.yellow : 0)
        + (seasonStat.cards && seasonStat.cards.red != null ? seasonStat.cards.red : 0),
      corners: extractTopApiValue(seasonStat, 'corners'),
    };
  }

  async function mapWithConcurrency(items, limit, mapper) {
    var results = new Array(items.length);
    var index = 0;

    async function worker() {
      while (index < items.length) {
        var current = index;
        index += 1;
        results[current] = await mapper(items[current], current);
      }
    }

    var workers = [];
    var workerCount = Math.min(limit, items.length);
    for (var i = 0; i < workerCount; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    return results;
  }

  function collectNationalTeamIdsFromFixtures(fixtures, limit) {
    var teamIds = [];
    var seen = {};

    (fixtures || []).forEach(function (fixture) {
      [fixture.homeId, fixture.awayId].forEach(function (teamId) {
        if (!teamId || seen[teamId]) return;
        seen[teamId] = true;
        teamIds.push(teamId);
      });
    });

    return typeof limit === 'number' ? teamIds.slice(0, limit) : teamIds;
  }

  async function fetchSquadPlayerPoolForRankings(teamIds, teamNamesById) {
    var players = [];
    var seen = {};

    await mapWithConcurrency(teamIds, HOMEPAGE_RANKING_SQUAD_CONCURRENCY, async function (teamId) {
      if (players.length >= HOMEPAGE_RANKING_POOL_MAX_PLAYERS) return;

      try {
        var squadData = await fetchSquad(teamId);
        var nationalTeam = teamNamesById[teamId] || '';
        var squadPlayers = parseSquadPlayers(squadData, 'home', nationalTeam);

        squadPlayers.forEach(function (player) {
          if (!player.id || seen[player.id] || players.length >= HOMEPAGE_RANKING_POOL_MAX_PLAYERS) return;
          seen[player.id] = true;
          players.push(player);
        });
      } catch (e) {
        /* squad unavailable for this team */
      }
    });

    return players;
  }

  function buildRankingFromClubStat(player, profile, clubStat) {
    if (!clubStat) return null;

    var premium = parseStatPremiumFields(clubStat);
    if (!premium) return null;

    var foulsDrawn = clubStat.fouls && clubStat.fouls.drawn != null ? clubStat.fouls.drawn : null;
    var foulsCommitted = clubStat.fouls && clubStat.fouls.committed != null ? clubStat.fouls.committed : null;
    var foulsInvolved = premium.fouls;
    var mostFouledValue = foulsDrawn != null && foulsDrawn > 0 ? foulsDrawn : foulsInvolved;

    var disciplineRisk = null;
    if (foulsCommitted != null || premium.cards != null) {
      disciplineRisk = (foulsCommitted || 0) + (premium.cards || 0);
      if (disciplineRisk <= 0) disciplineRisk = null;
    }

    var chanceCreation = null;
    if (premium.chancesCreated != null || premium.cornersInvolved != null) {
      chanceCreation = (premium.chancesCreated || 0) + (premium.cornersInvolved || 0);
      if (chanceCreation <= 0) chanceCreation = null;
    }

    return {
      id: player.id,
      name: (profile && profile.name) || player.name,
      photo: (profile && profile.photo) || player.photo,
      team: player.nationalTeam || '',
      club: clubStat.team && clubStat.team.name ? clubStat.team.name : null,
      teamLogo: clubStat.team && clubStat.team.logo ? clubStat.team.logo : null,
      goals: premium.goals,
      assists: premium.assists,
      foulsDrawn: mostFouledValue,
      disciplineRisk: disciplineRisk,
      chanceCreation: chanceCreation,
    };
  }

  async function buildGlobalClubRankingPool() {
    var fixtures = await fetchAllWorldCupFixtures();
    var teamNamesById = {};

    fixtures.forEach(function (fixture) {
      teamNamesById[fixture.homeId] = fixture.home;
      teamNamesById[fixture.awayId] = fixture.away;
    });

    var teamIds = collectNationalTeamIdsFromFixtures(fixtures);
    var players = await fetchSquadPlayerPoolForRankings(teamIds, teamNamesById);
    if (!players.length) return { pool: [], teamCount: teamIds.length, fixtureCount: fixtures.length };

    var enriched = await mapWithConcurrency(players, PREMIUM_STAT_FETCH_CONCURRENCY, async function (player) {
      try {
        var bundle = await fetchPlayerStatisticsBundle(player.id);
        var clubStat = pickClubStat(bundle.statistics, player.nationalTeam);
        if (!clubStat) return null;
        return buildRankingFromClubStat(player, bundle.profile, clubStat);
      } catch (e) {
        return null;
      }
    });

    return {
      pool: enriched.filter(Boolean),
      teamCount: teamIds.length,
      fixtureCount: fixtures.length,
    };
  }

  function rankPoolByMetric(pool, metric, limit, getValue) {
    var valueFor = getValue || function (player) {
      return player[metric];
    };

    return pool.slice().sort(function (a, b) {
      return (valueFor(b) || 0) - (valueFor(a) || 0);
    }).filter(function (player) {
      var value = valueFor(player);
      return value != null && value > 0;
    }).slice(0, limit).map(function (player) {
      return {
        id: player.id,
        name: player.name,
        photo: player.photo,
        team: player.team,
        club: player.club,
        teamLogo: player.teamLogo,
        value: valueFor(player),
      };
    });
  }

  function buildHomepageRankingDebug(pool, categories, meta) {
    var countries = {};

    pool.forEach(function (player) {
      if (player.team) countries[player.team] = true;
    });

    var top10PerCategory = {};
    categories.forEach(function (category) {
      top10PerCategory[category.id] = (category.playersTop10 || []).map(function (player) {
        return {
          name: player.name,
          country: player.team,
          club: player.club,
          value: player.value,
        };
      });
    });

    return {
      sourcePlayerCount: pool.length,
      squadTeamsInFixtures: meta.teamCount,
      fixtureCount: meta.fixtureCount,
      countriesRepresented: Object.keys(countries).sort(),
      countryCount: Object.keys(countries).length,
      playersWithClubStats: pool.length,
      categoriesGenerated: categories.length,
      top10PerCategory: top10PerCategory,
      dataSource: 'club-season-squad-pool',
      mockDataUsed: false,
      endpoints: [
        'GET /fixtures?league=1&season=2026',
        'GET /players/squads?team={teamId}',
        'GET /players?id={playerId}&season={2025|2026|2024}',
      ],
    };
  }

  async function fetchSquadPlayerPool(teamIds, teamNamesById) {
    var players = [];
    var seen = {};

    for (var i = 0; i < teamIds.length && players.length < PREMIUM_POOL_MAX_PLAYERS; i++) {
      try {
        var squadData = await fetchSquad(teamIds[i]);
        var nationalTeam = teamNamesById[teamIds[i]] || '';
        var squadPlayers = parseSquadPlayers(squadData, 'home', nationalTeam);

        squadPlayers.forEach(function (player) {
          if (!player.id || seen[player.id] || players.length >= PREMIUM_POOL_MAX_PLAYERS) return;
          seen[player.id] = true;
          players.push(player);
        });
      } catch (e) {
        /* squad unavailable for this team */
      }
    }

    return players;
  }

  async function buildPlayerMetricPool(teamIds, teamNamesById, preferInternational) {
    var players = await fetchSquadPlayerPool(teamIds, teamNamesById);
    if (!players.length) return [];

    var seasons = preferInternational
      ? [WORLD_CUP_SEASON, CLUB_STATS_SEASON]
      : [CLUB_STATS_SEASON, WORLD_CUP_SEASON];

    var enriched = await mapWithConcurrency(players, PREMIUM_STAT_FETCH_CONCURRENCY, async function (player) {
      var seasonStat = null;
      var profile = null;

      for (var s = 0; s < seasons.length; s++) {
        try {
          var params = new URLSearchParams({
            id: String(player.id),
            season: String(seasons[s]),
          });
          var data = await fetchProxy(PLAYERS_URL, params, 'player stats', MATCH_DATA_TIMEOUT_MS);
          var entry = data.response && data.response[0];
          if (!entry) continue;

          profile = entry.player || profile;
          seasonStat = pickPlayerSeasonStat(entry.statistics, player.nationalTeam, preferInternational);
          if (seasonStat) break;
        } catch (e) {
          /* try next season */
        }
      }

      if (!seasonStat) return null;

      var mergedPlayer = Object.assign({}, player, {
        name: (profile && profile.name) || player.name,
        photo: (profile && profile.photo) || player.photo,
      });

      return buildRankingFromSeasonStat(mergedPlayer, seasonStat);
    });

    return enriched.filter(Boolean);
  }

  function rankPoolByMetricLegacy(pool, metric, limit) {
    return rankPoolByMetric(pool, metric, limit);
  }

  async function resolvePremiumRanking(apiType, metric, pool) {
    if (apiType) {
      try {
        var apiRanking = await fetchTopPlayersRanking(apiType, metric);
        if (apiRanking.length) return apiRanking;
      } catch (e) {
        /* fall through to squad pool */
      }
    }

    if (!pool.length) return [];
    return rankPoolByMetricLegacy(pool, metric, PREMIUM_PREVIEW_LIMIT);
  }

  async function fetchPremiumPreviewRankings() {
    var params = new URLSearchParams();
    params.set('v', HOMEPAGE_RANKINGS_VERSION);
    params.set('_', String(Date.now()));
    var requestUrl = HOMEPAGE_RANKINGS_URL + '?' + params.toString();
    var response;

    try {
      response = await fetch(requestUrl, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
    } catch (e) {
      throw new Error(
        'Cannot reach ' + HOMEPAGE_RANKINGS_URL + '. Run locally with `vercel dev` (not a plain static server).'
      );
    }

    var data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error('Invalid response from homepage rankings');
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to load homepage rankings (HTTP ' + response.status + ')');
    }

    if (!data.categories || !Array.isArray(data.categories)) {
      throw new Error('Homepage rankings response missing categories array');
    }

    if (data && data.debug) {
      logHomepageRankings(data.debug);
    }

    return {
      categories: data.categories,
      debug: data.debug || null,
      version: data.version || HOMEPAGE_RANKINGS_VERSION,
      builtAt: data.builtAt || null,
    };
  }

  async function fetchMatchPlayers(fixture) {
    var MAX_PROJECTED = 11;

    try {
      var lineupData = await fetchLineups(fixture.id);
      var parsed = parseLineupPlayers(lineupData, fixture);

      if (parsed.confirmed && parsed.players.length) {
        var confirmedPlayers = await enrichPlayersWithClubStats(parsed.players, 22, fixture);
        logFixtureStats('match-players:confirmed', {
          fixtureId: fixture.id,
          count: confirmedPlayers.length,
          withClubStats: confirmedPlayers.filter(function (p) { return p.clubStatsAvailable; }).length,
        });
        return {
          mode: 'confirmed',
          label: 'Confirmed Lineups',
          disclaimer: '',
          players: confirmedPlayers,
        };
      }
    } catch (e) {
      /* fall through to projected squads */
    }

    if (!fixture.homeId || !fixture.awayId) {
      return { mode: 'none', label: '', disclaimer: '', players: [] };
    }

    try {
      var homeData = await fetchSquad(fixture.homeId);
      var awayData = await fetchSquad(fixture.awayId);
      var homePlayers = parseSquadPlayers(homeData, 'home', fixture.home);
      var awayPlayers = parseSquadPlayers(awayData, 'away', fixture.away);

      homePlayers.sort(function (a, b) {
        return (a.number || 99) - (b.number || 99);
      });
      awayPlayers.sort(function (a, b) {
        return (a.number || 99) - (b.number || 99);
      });

      var projected = homePlayers.slice(0, MAX_PROJECTED).concat(awayPlayers.slice(0, MAX_PROJECTED));

      if (!projected.length) {
        return { mode: 'none', label: '', disclaimer: '', players: [] };
      }

      var enrichedProjected = await enrichPlayersWithClubStats(projected, projected.length, fixture);

      logFixtureStats('match-players:projected', {
        fixtureId: fixture.id,
        count: enrichedProjected.length,
        withClubStats: enrichedProjected.filter(function (p) { return p.clubStatsAvailable; }).length,
      });

      return {
        mode: 'projected',
        label: 'Projected Players',
        disclaimer: 'Projected players are based on recent national team data and will update when official lineups are released.',
        players: enrichedProjected,
      };
    } catch (e) {
      return { mode: 'error', label: '', disclaimer: '', players: [], error: e.message };
    }
  }

  var HOMEPAGE_INSIGHT_PLAYER_LIMIT = 26;

  function getPlayerInsightStats(player) {
    if (player.clubPremium) return player.clubPremium;
    if (player.nationalPremium) return player.nationalPremium;
    return null;
  }

  function formatUpcomingMatchLabel(fixture) {
    if (!fixture) return null;
    return fixture.home + ' vs ' + fixture.away;
  }

  function buildGoalscorerInsight(players) {
    var ranked = players.filter(function (player) {
      var stats = getPlayerInsightStats(player);
      return stats && ((stats.goals != null && stats.goals > 0) || (stats.assists != null && stats.assists > 0));
    }).sort(function (a, b) {
      var statsA = getPlayerInsightStats(a) || {};
      var statsB = getPlayerInsightStats(b) || {};
      var goalsDiff = (statsB.goals || 0) - (statsA.goals || 0);
      if (goalsDiff !== 0) return goalsDiff;
      return (statsB.assists || 0) - (statsA.assists || 0);
    });

    if (!ranked.length) return { hasData: false, items: [] };

    var top = ranked[0];
    var stats = getPlayerInsightStats(top);
    var items = [];

    if (stats.goals != null) items.push({ text: stats.goals + ' Goals' });
    if (stats.assists != null) items.push({ text: stats.assists + ' Assists' });
    if (
      (top.recentGoals != null && top.recentGoals > 0)
      || top.recentFormRating != null
      || (stats.goals != null && stats.goals > 0)
    ) {
      items.push({ text: 'Strong attacking form' });
    }

    return { hasData: items.length > 0, items: items };
  }

  function buildCardRiskInsight(players) {
    var ranked = players.filter(function (player) {
      var stats = getPlayerInsightStats(player);
      return stats && (
        (stats.foulsCommitted != null && stats.foulsCommitted > 0)
        || (stats.cards != null && stats.cards > 0)
      );
    }).sort(function (a, b) {
      var statsA = getPlayerInsightStats(a) || {};
      var statsB = getPlayerInsightStats(b) || {};
      var riskA = (statsA.foulsCommitted || 0) + (statsA.cards || 0);
      var riskB = (statsB.foulsCommitted || 0) + (statsB.cards || 0);
      if (riskB !== riskA) return riskB - riskA;
      return (statsB.foulsCommitted || 0) - (statsA.foulsCommitted || 0);
    });

    if (!ranked.length) return { hasData: false, items: [] };

    var stats = getPlayerInsightStats(ranked[0]);
    var items = [];

    if (stats.foulsCommitted != null) items.push({ text: stats.foulsCommitted + ' Fouls' });
    if (stats.cards != null) items.push({ text: stats.cards + ' Cards' });
    if ((stats.foulsCommitted || 0) + (stats.cards || 0) > 0) {
      items.push({ text: 'High disciplinary risk' });
    }

    return { hasData: items.length > 0, items: items };
  }

  function buildSetpieceInsight(players) {
    var ranked = players.filter(function (player) {
      var stats = getPlayerInsightStats(player);
      return stats && (
        (stats.chancesCreated != null && stats.chancesCreated > 0)
        || (stats.cornersInvolved != null && stats.cornersInvolved > 0)
      );
    }).sort(function (a, b) {
      var statsA = getPlayerInsightStats(a) || {};
      var statsB = getPlayerInsightStats(b) || {};
      var threatA = (statsA.chancesCreated || 0) + (statsA.cornersInvolved || 0);
      var threatB = (statsB.chancesCreated || 0) + (statsB.cornersInvolved || 0);
      if (threatB !== threatA) return threatB - threatA;
      return (statsB.chancesCreated || 0) - (statsA.chancesCreated || 0);
    });

    if (!ranked.length) return { hasData: false, items: [] };

    var stats = getPlayerInsightStats(ranked[0]);
    var items = [];

    if (stats.chancesCreated != null) items.push({ text: stats.chancesCreated + ' Chances Created' });
    if (stats.cornersInvolved != null && stats.cornersInvolved > 0) {
      items.push({ text: 'Corner threat' });
    }
    if (stats.chancesCreated != null && stats.chancesCreated > 0) {
      items.push({ text: 'Key attacking contributor' });
    }

    return { hasData: items.length > 0, items: items };
  }

  function buildEmptyHomepageInsights() {
    return {
      goalscorer: { hasData: false, items: [] },
      cardRisk: { hasData: false, items: [] },
      setpiece: { hasData: false, items: [] },
    };
  }

  async function fetchTodaysBestInsights() {
    var fixtures = await fetchWorldCupFixtures({ next: 10 });
    var upcoming = null;

    for (var i = 0; i < fixtures.length; i++) {
      if (fixtures[i].status === 'upcoming') {
        upcoming = fixtures[i];
        break;
      }
    }

    if (!upcoming && fixtures.length) upcoming = fixtures[0];

    if (!upcoming || !upcoming.homeId || !upcoming.awayId) {
      return { match: null, insights: buildEmptyHomepageInsights() };
    }

    var players = [];

    try {
      var homeData = await fetchSquad(upcoming.homeId);
      var awayData = await fetchSquad(upcoming.awayId);
      players = parseSquadPlayers(homeData, 'home', upcoming.home)
        .concat(parseSquadPlayers(awayData, 'away', upcoming.away));
    } catch (e) {
      return {
        match: formatUpcomingMatchLabel(upcoming),
        insights: buildEmptyHomepageInsights(),
      };
    }

    if (!players.length) {
      return {
        match: formatUpcomingMatchLabel(upcoming),
        insights: buildEmptyHomepageInsights(),
      };
    }

    var enriched = await enrichPlayersWithClubStats(
      players,
      Math.min(players.length, HOMEPAGE_INSIGHT_PLAYER_LIMIT)
    );

    return {
      match: formatUpcomingMatchLabel(upcoming),
      insights: {
        goalscorer: buildGoalscorerInsight(enriched),
        cardRisk: buildCardRiskInsight(enriched),
        setpiece: buildSetpieceInsight(enriched),
      },
    };
  }

  async function enrichSinglePlayerForDetail(player, fixture) {
    if (!player || !player.id) return player;
    var enriched = await enrichPlayersWithClubStats([player], 1, fixture);
    return enriched[0] || player;
  }

  global.ApiFootball = {
    fetchWorldCupFixtures: fetchWorldCupFixtures,
    fetchAllWorldCupFixtures: fetchAllWorldCupFixtures,
    fetchCompletedFixtures: fetchCompletedFixtures,
    fetchTopScorers: fetchTopScorers,
    fetchMatchPlayers: fetchMatchPlayers,
    fetchMatchTeamQuickStats: fetchMatchTeamQuickStats,
    fetchPremiumPreviewRankings: fetchPremiumPreviewRankings,
    HOMEPAGE_RANKINGS_URL: HOMEPAGE_RANKINGS_URL,
    HOMEPAGE_RANKINGS_VERSION: HOMEPAGE_RANKINGS_VERSION,
    fetchTodaysBestInsights: fetchTodaysBestInsights,
    normalizeFixture: normalizeFixture,
    normalizeTopScorer: normalizeTopScorer,
    WORLD_CUP_LEAGUE: WORLD_CUP_LEAGUE,
    WORLD_CUP_SEASON: WORLD_CUP_SEASON,
    enableFixtureStatsDebug: enableFixtureStatsDebug,
    enableRankingsDebug: enableRankingsDebug,
    enrichSinglePlayerForDetail: enrichSinglePlayerForDetail,
    enrichPlayersWithClubStats: enrichPlayersWithClubStats,
  };
})(window);
