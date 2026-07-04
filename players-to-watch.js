/**
 * Today's Best Insights — premium teaser cards using saved homepage rankings data,
 * filtered to players from teams in the displayed fixtures.
 */
(function (global) {
  'use strict';

  var RANK_CLASSES = ['gold', 'silver', 'bronze'];
  var ROW_LIMIT = 5;
  var fixtureTeamNames = [];

  var DEBUG_POOL_KEYS = {
    'top-goalscorers': 'top20Goalscorers',
    'top-assists': 'top20Assists',
    'most-fouled': 'top20FoulsWon',
    'discipline-risks': 'top20DisciplineRisks',
    'chance-creators': 'top20ChanceCreators',
  };

  /** Fixture API name ↔ saved rankings team name */
  var TEAM_ALIAS_GROUPS = [
    ['united states', 'usa'],
    ['czechia', 'czech republic'],
    ['bosnia and herzegovina', 'bosnia & herzegovina'],
    ['ivory coast', "cote d'ivoire", 'côte d\'ivoire'],
    ['cape verde', 'cape verde islands'],
    ['dr congo', 'congo dr', 'congo democratic'],
    ['türkiye', 'turkey'],
  ];

  var CARD_CONFIG = [
    { id: 'attacking-threat', title: 'Top Attacking Threat', build: buildAttackingThreat },
    { id: 'assist-threat', title: 'Best Assist Threat', build: buildAssistThreat },
    { id: 'physical-danger', title: 'Most Fouled / Physical Danger', build: buildMostFouled },
    { id: 'discipline-risk', title: 'Discipline Risk', build: buildDisciplineRisk },
    { id: 'chance-creator', title: 'Set-Piece / Chance Creator', build: buildChanceCreator },
  ];

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function lockIconSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
  }

  function resolvePremiumState(isPremium) {
    if (global.EdgeStatsAuth && typeof global.EdgeStatsAuth.isPremium === 'function' && global.EdgeStatsAuth.isPremium()) {
      return true;
    }
    if (global.PremiumAccess && typeof global.PremiumAccess.isPremium === 'function' && global.PremiumAccess.isPremium()) {
      return true;
    }
    return Boolean(isPremium);
  }

  function normalizeTeamKey(name) {
    return (name || '').toLowerCase().trim();
  }

  function teamKeysMatch(a, b) {
    var keyA = normalizeTeamKey(a);
    var keyB = normalizeTeamKey(b);
    if (!keyA || !keyB) return false;
    if (keyA === keyB) return true;
    if (keyA.indexOf(keyB) !== -1 || keyB.indexOf(keyA) !== -1) return true;

    for (var i = 0; i < TEAM_ALIAS_GROUPS.length; i++) {
      var group = TEAM_ALIAS_GROUPS[i];
      var aIn = false;
      var bIn = false;
      for (var j = 0; j < group.length; j++) {
        if (keyA === group[j] || keyA.indexOf(group[j]) !== -1 || group[j].indexOf(keyA) !== -1) aIn = true;
        if (keyB === group[j] || keyB.indexOf(group[j]) !== -1 || group[j].indexOf(keyB) !== -1) bIn = true;
      }
      if (aIn && bIn) return true;
    }

    return false;
  }

  function playerTeamMatchesFixturePool(teamName) {
    if (!fixtureTeamNames.length || !teamName) return false;
    for (var i = 0; i < fixtureTeamNames.length; i++) {
      if (teamKeysMatch(teamName, fixtureTeamNames[i])) return true;
    }
    return false;
  }

  function setFixtureTeams(teamNames) {
    fixtureTeamNames = (teamNames || []).filter(Boolean);
  }

  function findPlayerMetaInCategories(categories, name, team) {
    for (var i = 0; i < categories.length; i++) {
      var pools = [categories[i].playersTop10, categories[i].players];
      for (var p = 0; p < pools.length; p++) {
        var list = pools[p] || [];
        for (var j = 0; j < list.length; j++) {
          var player = list[j];
          if (!player) continue;
          if (name && player.name === name) return player;
          if (team && player.team && teamKeysMatch(player.team, team)) {
            if (!name || player.name === name) return player;
          }
        }
      }
    }
    return null;
  }

  function normalizeRankingPlayer(entry, categories) {
    if (!entry) return null;
    var team = entry.team || entry.country || null;
    var meta = findPlayerMetaInCategories(categories, entry.name, team) || {};
    var value = entry.value != null ? entry.value : entry.rawValue;

    return {
      id: entry.id || meta.id || entry.name,
      name: entry.name || meta.name,
      photo: entry.photo || meta.photo || null,
      team: team || meta.team || null,
      value: value,
      rawValue: entry.rawValue != null ? entry.rawValue : value,
    };
  }

  function expandCategoryPool(cat, debug, categories) {
    var pool = [];
    var seen = {};

    function playerKey(player) {
      return String(player.id || (normalizeTeamKey(player.name) + '|' + normalizeTeamKey(player.team)));
    }

    function addEntry(entry) {
      var normalized = normalizeRankingPlayer(entry, categories);
      if (!normalized || !normalized.name) return;
      var key = playerKey(normalized);
      if (seen[key]) return;
      seen[key] = true;
      pool.push(normalized);
    }

    (cat.playersTop10 || []).forEach(addEntry);
    (cat.players || []).forEach(addEntry);

    var debugKey = DEBUG_POOL_KEYS[cat.id];
    if (debugKey && debug && debug[debugKey]) {
      debug[debugKey].forEach(addEntry);
    }

    return pool
      .filter(function (p) { return p.value != null && p.value > 0; })
      .sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
  }

  function filterCategoriesForFixtures(data) {
    if (!fixtureTeamNames.length) return [];

    var categories = (data && data.categories) || [];
    var debug = (data && data.debug) || {};

    return categories.map(function (cat) {
      var pool = expandCategoryPool(cat, debug, categories).filter(function (p) {
        return p && playerTeamMatchesFixturePool(p.team);
      });

      return {
        id: cat.id,
        title: cat.title,
        unit: cat.unit,
        players: pool,
        playersTop10: pool,
      };
    });
  }

  function findCategory(categories, id) {
    if (!categories) return null;
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].id === id) return categories[i];
    }
    return null;
  }

  function buildFromCategory(categories, categoryId, unit) {
    var category = findCategory(categories, categoryId);
    if (!category || !category.players || !category.players.length) return [];

    return category.players.slice(0, ROW_LIMIT).map(function (p) {
      return {
        name: p.name,
        photo: p.photo,
        team: p.team,
        stats: [{ value: p.value, unit: unit }],
      };
    });
  }

  function buildAttackingThreat(categories) {
    return buildFromCategory(categories, 'top-goalscorers', 'goals');
  }

  function buildAssistThreat(categories) {
    return buildFromCategory(categories, 'top-assists', 'assists');
  }

  function buildMostFouled(categories) {
    return buildFromCategory(categories, 'most-fouled', 'fouls');
  }

  function buildDisciplineRisk(categories) {
    return buildFromCategory(categories, 'discipline-risks', 'risk points');
  }

  function buildChanceCreator(categories) {
    return buildFromCategory(categories, 'chance-creators', 'chances');
  }

  function formatStatValue(value) {
    if (value == null || value === '') return '—';
    return String(value);
  }

  function renderLockedIdentity() {
    return (
      '<div class="premium-ranking-identity-wrap">' +
        '<div class="premium-ranking-identity premium-ranking-identity--locked" aria-hidden="true">' +
          '<span class="premium-ranking-avatar premium-ranking-avatar--placeholder"></span>' +
          '<div class="premium-ranking-info">' +
            '<span class="premium-ranking-name premium-ranking-name--placeholder"></span>' +
            '<span class="premium-ranking-team premium-ranking-team--placeholder"></span>' +
          '</div>' +
        '</div>' +
        '<span class="premium-ranking-identity__lock" aria-hidden="true">' + lockIconSvg() + '</span>' +
      '</div>'
    );
  }

  function renderUnlockedIdentity(row) {
    var photo = row && row.photo
      ? '<img class="premium-ranking-avatar" src="' + escapeHtml(row.photo) + '" alt="" loading="lazy">'
      : '<span class="premium-ranking-avatar premium-ranking-avatar--placeholder"></span>';

    return (
      '<div class="premium-ranking-identity-wrap">' +
        '<div class="premium-ranking-identity">' +
          photo +
          '<div class="premium-ranking-info">' +
            '<span class="premium-ranking-name">' + escapeHtml(row && row.name ? row.name : 'Unknown') + '</span>' +
            '<span class="premium-ranking-team">' + escapeHtml(row && row.team ? row.team : '') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderInlineStats(stats) {
    var parts = stats.map(function (stat) {
      return (
        '<span class="premium-ranking-stat__value">' + escapeHtml(formatStatValue(stat.value)) + '</span>' +
        ' <span class="premium-ranking-stat__unit">' + escapeHtml(stat.unit) + '</span>'
      );
    });

    return (
      '<div class="premium-ranking-stat premium-ranking-stat--inline">' +
        parts.join('<span class="premium-ranking-stat__sep">, </span>') +
      '</div>'
    );
  }

  function renderLockedStatPlaceholder() {
    return (
      '<span class="premium-ranking-stat premium-ranking-stat--locked" aria-label="Stat locked">' +
        '<span class="premium-ranking-stat__placeholder" aria-hidden="true"></span>' +
        '<span class="premium-ranking-stat__lock" aria-hidden="true">' + lockIconSvg() + '</span>' +
      '</span>'
    );
  }

  function renderWatchRow(index, row, isPremium) {
    var rankClass = RANK_CLASSES[index] || '';

    return (
      '<div class="premium-ranking-row">' +
        '<span class="premium-ranking-rank ' + rankClass + '">' + (index + 1) + '</span>' +
        (isPremium ? renderUnlockedIdentity(row) : renderLockedIdentity()) +
        renderInlineStats(row.stats) +
      '</div>'
    );
  }

  function renderSkeletonRow(index, isPremium) {
    var rankClass = RANK_CLASSES[index] || '';

    return (
      '<div class="premium-ranking-row premium-ranking-row--skeleton">' +
        '<span class="premium-ranking-rank ' + rankClass + '">' + (index + 1) + '</span>' +
        (isPremium ? renderUnlockedIdentity({ name: '—', team: '' }) : renderLockedIdentity()) +
        (isPremium ? renderInlineStats([{ value: '—', unit: '' }], true) : renderLockedStatPlaceholder()) +
      '</div>'
    );
  }

  function renderSkeletonRows(isPremium) {
    var rows = [];
    for (var i = 0; i < ROW_LIMIT; i++) {
      rows.push(renderSkeletonRow(i, isPremium));
    }
    return rows.join('');
  }

  function renderEmptyPremium() {
    return (
      '<div class="premium-ranking-preview premium-ranking-preview--empty">' +
        '<p>No saved club-form players from upcoming fixture teams in this category.</p>' +
      '</div>'
    );
  }

  function renderCardBody(rows, isPremium) {
    if (!rows || !rows.length) {
      if (isPremium) {
        return renderEmptyPremium();
      }
      return (
        '<div class="premium-ranking-preview premium-ranking-preview--skeleton">' +
          renderSkeletonRows(false) +
        '</div>'
      );
    }

    return (
      '<div class="premium-ranking-preview">' +
        rows.map(function (row, index) {
          return renderWatchRow(index, row, isPremium);
        }).join('') +
      '</div>'
    );
  }

  function renderTeaserCard(config, rows, isPremium) {
    var tag = isPremium ? 'div' : 'button';
    var typeAttr = isPremium ? '' : ' type="button"';

    return (
      '<' + tag + typeAttr + ' class="premium-preview-card' + (isPremium ? ' premium-preview-card--unlocked' : '') + '" data-players-to-watch="' + escapeHtml(config.id) + '">' +
        '<div class="premium-preview-card__head">' +
          '<h3>' + escapeHtml(config.title) + '</h3>' +
          (isPremium ? '' : '<span class="premium-preview-lock" aria-hidden="true">' + lockIconSvg() + '</span>') +
        '</div>' +
        '<div class="premium-preview-card__body">' +
          '<div class="players-to-watch-mount" data-watch-id="' + escapeHtml(config.id) + '">' +
            renderCardBody(rows, isPremium) +
          '</div>' +
        '</div>' +
      '</' + tag + '>'
    );
  }

  function renderGridLoading() {
    return CARD_CONFIG.map(function (config) {
      return (
        '<button type="button" class="premium-preview-card" data-players-to-watch="' + escapeHtml(config.id) + '">' +
          '<div class="premium-preview-card__head">' +
            '<h3>' + escapeHtml(config.title) + '</h3>' +
            '<span class="premium-preview-lock" aria-hidden="true">' + lockIconSvg() + '</span>' +
          '</div>' +
          '<div class="premium-preview-card__body">' +
            '<div class="players-to-watch-mount" data-watch-id="' + escapeHtml(config.id) + '">' +
              '<div class="premium-ranking-preview premium-ranking-preview--loading">' +
                '<div class="fixtures-spinner" aria-hidden="true"></div>' +
                '<p>Loading insights…</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</button>'
      );
    }).join('');
  }

  function renderGrid(data, isPremium) {
    var premium = resolvePremiumState(isPremium);
    var filtered = filterCategoriesForFixtures(data || {});
    return CARD_CONFIG.map(function (config) {
      return renderTeaserCard(config, config.build(filtered), premium);
    }).join('');
  }

  function updateAll(container, data, isPremium) {
    if (!container) return;
    container.innerHTML = renderGrid(data, isPremium);
  }

  function bindCards(container, isPremium) {
    if (!container) return;
    var premium = resolvePremiumState(isPremium);

    container.querySelectorAll('[data-players-to-watch]').forEach(function (el) {
      if (premium) return;

      el.addEventListener('click', function () {
        if (resolvePremiumState()) return;

        if (typeof global.PremiumAccess !== 'undefined' && typeof global.PremiumAccess.startCheckoutFromCTA === 'function') {
          global.PremiumAccess.startCheckoutFromCTA();
          return;
        }

        if (typeof global.goToStripeCheckout === 'function') {
          global.goToStripeCheckout();
        } else if (typeof global.openPremiumModal === 'function') {
          global.openPremiumModal();
        }
      });
    });
  }

  global.PlayersToWatch = {
    renderGridLoading: renderGridLoading,
    renderGrid: renderGrid,
    updateAll: updateAll,
    bindCards: bindCards,
    setFixtureTeams: setFixtureTeams,
  };
})(window);
