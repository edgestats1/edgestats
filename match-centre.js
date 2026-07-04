/**
 * Match Centre UI — betting-focused layout with compact player lists.
 */
(function (global) {
  'use strict';

  function isPremiumUser() {
    if (global.EdgeStatsAuth
      && typeof global.EdgeStatsAuth.isPremium === 'function'
      && global.EdgeStatsAuth.isPremium()) {
      return true;
    }
    return document.body.classList.contains('edgestats-premium');
  }

  /** Knockout stage: general match stats are free; Prediction Generator stays premium. */
  function matchStatsArePublic() {
    return true;
  }

  function showFullMatchStats() {
    return matchStatsArePublic() || isPremiumUser();
  }

  function logPlayerPremiumDebug(player) {
    var profile = global.EdgeStatsAuth && typeof global.EdgeStatsAuth.getProfile === 'function'
      ? global.EdgeStatsAuth.getProfile()
      : null;
    var clubPremium = player && player.clubPremium;
    var hasClubSeasonStats = !!(clubPremium && (
      clubPremium.goals != null
      || clubPremium.assists != null
      || clubPremium.shots != null
      || clubPremium.fouls != null
      || clubPremium.cards != null
      || clubPremium.minutes != null
      || clubPremium.appearances != null
    ));

    console.info('[EdgeStats:PlayerDetail]', {
      userRole: profile && profile.role ? profile.role : 'unknown',
      isPremium: isPremiumUser(),
      authIsPremium: global.EdgeStatsAuth && global.EdgeStatsAuth.isPremium
        ? global.EdgeStatsAuth.isPremium()
        : null,
      bodyPremiumClass: document.body.classList.contains('edgestats-premium'),
      playerId: player && player.id,
      playerName: player && player.name,
      clubId: player && player.clubTeamId,
      clubName: player && player.club,
      clubSeason: player && (player.clubSeasonUsed || player.clubSeason),
      clubStatsAvailable: !!(player && player.clubStatsAvailable),
      clubSeasonStatsReturned: hasClubSeasonStats,
      clubPremium: clubPremium,
      last5Count: player && player.lastFiveCount,
      last5LogLength: player && player.lastFiveMatchLog ? player.lastFiveMatchLog.length : 0,
      last5FixturesReturned: !!(player && player.lastFiveMatchLog && player.lastFiveMatchLog.length),
      recentFormSource: player && player.recentFormSource,
      lastFiveDiagnosis: player && player.lastFiveDiagnosis,
    });
  }

  var PREMIUM_TOAST =
    'Unlock the EdgeStats Prediction Generator to generate match predictions — winner, scoreline, xG, shots, corners and more.';

  var QUICK_STAT_ROWS = [
    { key: 'goalsFor', label: 'Goals For' },
    { key: 'goalsAgainst', label: 'Goals Against' },
    { key: 'cornersFor', label: 'Corners For' },
    { key: 'cornersAgainst', label: 'Corners Against' },
    { key: 'fouls', label: 'Fouls' },
    { key: 'cards', label: 'Cards' },
    { key: 'throwIns', label: 'Throw-ins' },
    { key: 'shots', label: 'Shots' },
    { key: 'shotsOnTarget', label: 'Shots on Target' },
  ];

  var PREMIUM_TEASERS = [
    { id: 'player-goals', title: 'Player Goals', icon: 'goal' },
    { id: 'player-assists', title: 'Player Assists', icon: 'pass' },
    { id: 'fouls', title: 'Fouls', icon: 'foul' },
    { id: 'cards', title: 'Cards', icon: 'card' },
    { id: 'corners', title: 'Corners', icon: 'corner' },
    { id: 'team-trends', title: 'Team Trends', icon: 'team' },
    { id: 'match-insights', title: 'Match Insights', icon: 'insights' },
  ];

  var MATCH_CENTRE_PREMIUM = [
    { id: 'player-goals', title: 'Player Goals', icon: 'goal', section: 'player' },
    { id: 'player-assists', title: 'Player Assists', icon: 'pass', section: 'player' },
    { id: 'fouls', title: 'Fouls', icon: 'foul', section: 'player' },
    { id: 'cards', title: 'Cards', icon: 'card', section: 'player' },
    { id: 'shots', title: 'Shots', icon: 'shot', section: 'player' },
    { id: 'shots-on-target', title: 'Shots on Target', icon: 'shot', section: 'player' },
    { id: 'corner-trends', title: 'Corner Trends', icon: 'corner', section: 'match' },
    { id: 'goal-trends', title: 'Goal Trends', icon: 'goal', section: 'match' },
    { id: 'team-analytics', title: 'Team Analytics', icon: 'team', section: 'match' },
    { id: 'match-insights', title: 'Match Insights', icon: 'insights', section: 'match' },
  ];

  var PREMIUM_PLAYER_FIELDS = [
    { key: 'goals', label: 'Goals' },
    { key: 'assists', label: 'Assists' },
    { key: 'shots', label: 'Shots' },
    { key: 'fouls', label: 'Fouls' },
    { key: 'cards', label: 'Cards' },
    { key: 'chancesCreated', label: 'Chances Created' },
    { key: 'cornersInvolved', label: 'Corners / Crosses' },
    { key: 'minutes', label: 'Minutes Played' },
    { key: 'appearances', label: 'Appearances' },
    { key: 'lastFiveCount', label: 'Last 5 Matches', format: formatLastFiveMatches },
    { key: 'formRating', label: 'Form Rating', format: formatFormRating },
  ];

  var ICONS = {
    stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 6-10"/></svg>',
    rating: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    foul: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>',
    tackle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M10 20H4v-6M20 4l-8 8M4 20l8-8"/></svg>',
    intercept: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="14" height="18" rx="2"/><rect x="8" y="2" width="14" height="18" rx="2"/></svg>',
    shot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>',
    pass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    goal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>',
    corner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M21 3L3 21"/></svg>',
    insights: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/></svg>',
  };

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function displayVal(val, options) {
    var opts = options || {};
    if (val == null || val === '') {
      if (opts.premium && isPremiumUser()) {
        return escapeHtml(opts.emptyLabel || 'Club form data loading soon');
      }
      return '—';
    }
    return escapeHtml(val);
  }

  function getStatsSourceLabel(source) {
    switch (source) {
      case 'club-season': return 'Club season stats';
      case 'national-season': return 'National team season stats';
      case 'club-team-fixtures': return 'Last 5 club matches';
      case 'national-team-fixtures': return 'Last 5 national team matches';
      case 'club-last5': return 'Last 5 club matches';
      case 'any-last5': return 'Last 5 recent matches';
      case 'club-squad-aggregate': return 'Squad club form (avg per player)';
      case 'recent-international': return 'Recent international form';
      case 'tournament': return 'Tournament statistics';
      case 'match-day': return 'Live match statistics';
      default: return 'Pre-match club form';
    }
  }

  function lockIconSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
  }

  function renderPremiumSectionLockPanel(title, description, skeletonHtml) {
    return (
      '<div class="match-centre-lock-panel">' +
        '<div class="match-centre-lock-panel__blur" aria-hidden="true">' +
          (skeletonHtml || (
            '<div class="blur-row"></div><div class="blur-row"></div><div class="blur-row"></div>'
          )) +
        '</div>' +
        '<div class="match-centre-lock-panel__overlay">' +
          lockIconSvg() +
          '<p class="match-centre-lock-panel__title">' + escapeHtml(title) + '</p>' +
          (description ? '<p class="match-centre-lock-panel__desc">' + escapeHtml(description) + '</p>' : '') +
          '<button type="button" class="btn btn-outline btn-sm" data-match-centre-upgrade>Unlock Premium</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderQuickStatsSkeletonCols(homeName, awayName) {
    function col(teamName) {
      var rows = QUICK_STAT_ROWS.map(function (row) {
        return (
          '<div class="match-centre-quick-stat match-centre-quick-stat--locked">' +
            '<span class="match-centre-quick-stat__label">' + escapeHtml(row.label) + '</span>' +
            '<span class="match-centre-quick-stat__value match-centre-quick-stat__value--locked">—</span>' +
          '</div>'
        );
      }).join('');

      return (
        '<div class="match-centre-quick-stats-col">' +
          '<h4 class="match-centre-quick-stats-col__title">' + escapeHtml(teamName) + '</h4>' +
          '<div class="match-centre-quick-stats-col__grid">' + rows + '</div>' +
        '</div>'
      );
    }

    return col(homeName) + col(awayName);
  }

  function renderLockedQuickStatsSection(fixture) {
    return (
      '<section class="match-centre-quick-stats match-centre-section--locked" aria-label="Team quick stats">' +
        '<div class="match-centre-quick-stats__head">' +
          '<h3>Quick Stats</h3>' +
          '<span class="premium-lock-badge">Premium</span>' +
        '</div>' +
        '<p class="match-centre-section__desc">Upgrade to unlock team goals, corners, fouls, cards, shots and more.</p>' +
        renderPremiumSectionLockPanel(
          'Unlock team stats',
          'See goals, corners, fouls, cards, shots and shots on target for both teams.',
          '<div class="match-centre-quick-stats__cols">' + renderQuickStatsSkeletonCols(fixture.home, fixture.away) + '</div>'
        ) +
      '</section>'
    );
  }

  function renderLockedPlayersToWatchSection(fixture) {
    return (
      '<section class="match-centre-section match-centre-watch match-centre-section--locked" aria-label="Players to watch">' +
        '<div class="match-centre-section__head">' +
          '<h3>Players To Watch 🔒</h3>' +
          '<span class="premium-lock-badge">Premium</span>' +
        '</div>' +
        '<p class="match-centre-section__desc">Unlock form and threat indicators for key players in this match.</p>' +
        renderPremiumSectionLockPanel(
          'Unlock Players To Watch',
          'See attacking threats, discipline risks and set-piece specialists.',
          '<div class="match-centre-watch__cols">' +
            '<div class="match-centre-watch-col"><h4>' + escapeHtml(fixture.home) + '</h4><div class="blur-row"></div><div class="blur-row"></div></div>' +
            '<div class="match-centre-watch-col"><h4>' + escapeHtml(fixture.away) + '</h4><div class="blur-row"></div><div class="blur-row"></div></div>' +
          '</div>'
        ) +
      '</section>'
    );
  }

  function renderLockedPlayerListsSection(fixture) {
    return (
      '<section class="match-centre-section match-centre-section--players match-centre-section--locked">' +
        '<div class="match-centre-section__head">' +
          '<h3>Squad Lists</h3>' +
          '<span class="premium-lock-badge">Premium</span>' +
        '</div>' +
        '<p class="match-centre-section__desc">Upgrade to browse squads and open full player stats.</p>' +
        renderPremiumSectionLockPanel(
          'Unlock player stats',
          'Browse confirmed or projected lineups with club-season form and player detail.',
          '<div class="match-centre-player-lists">' +
            '<div class="match-centre-player-list"><h4>' + escapeHtml(fixture.home) + '</h4><div class="blur-row"></div><div class="blur-row"></div><div class="blur-row"></div></div>' +
            '<div class="match-centre-player-list"><h4>' + escapeHtml(fixture.away) + '</h4><div class="blur-row"></div><div class="blur-row"></div><div class="blur-row"></div></div>' +
          '</div>'
        ) +
      '</section>'
    );
  }

  function renderLockCard(stat, context) {
    var ctx = context || {};
    var summary = buildAdvancedStatSummary(stat, ctx);

    if (showFullMatchStats()) {
      return (
        '<div class="premium-lock-card match-centre-lock-card match-centre-lock-card--unlocked" data-premium-stat="' + stat.id + '">' +
          '<div class="premium-lock-card__header">' +
            '<span class="premium-lock-card__icon">' + (ICONS[stat.icon] || '') + '</span>' +
            '<span class="premium-lock-card__title">' + stat.title + '</span>' +
            '<span class="premium-lock-badge premium-lock-badge--active">Unlocked</span>' +
          '</div>' +
          '<div class="premium-lock-card__preview premium-lock-card__preview--unlocked">' +
            '<p class="match-centre-unlocked-copy">' + escapeHtml(summary) + '</p>' +
          '</div>' +
        '</div>'
      );
    }

    return (
      '<button type="button" class="premium-lock-card match-centre-lock-card" data-premium-stat="' + stat.id + '">' +
        '<div class="premium-lock-card__header">' +
          '<span class="premium-lock-card__icon">' + (ICONS[stat.icon] || '') + '</span>' +
          '<span class="premium-lock-card__title">' + stat.title + '</span>' +
          '<span class="premium-lock-badge">Premium</span>' +
        '</div>' +
        '<div class="premium-lock-card__preview">' +
          '<div class="premium-lock-blur" aria-hidden="true">' +
            '<div class="blur-row"></div><div class="blur-row"></div><div class="blur-row"></div>' +
          '</div>' +
          '<div class="premium-lock-overlay">' + lockIconSvg() + '<span>Locked</span></div>' +
        '</div>' +
      '</button>'
    );
  }

  function renderPremiumTeaserCard(teaser) {
    if (showFullMatchStats()) {
      return (
        '<div class="match-centre-teaser-card match-centre-lock-card match-centre-lock-card--unlocked" data-premium-stat="' + teaser.id + '">' +
          '<span class="match-centre-teaser-card__icon">' + (ICONS[teaser.icon] || '') + '</span>' +
          '<span class="match-centre-teaser-card__title">' + escapeHtml(teaser.title) + '</span>' +
        '</div>'
      );
    }

    return (
      '<button type="button" class="match-centre-teaser-card match-centre-lock-card" data-premium-stat="' + teaser.id + '">' +
        '<span class="match-centre-teaser-card__icon">' + (ICONS[teaser.icon] || '') + '</span>' +
        '<span class="match-centre-teaser-card__title">' + escapeHtml(teaser.title) + '</span>' +
        '<span class="match-centre-teaser-card__lock" aria-hidden="true">🔒</span>' +
      '</button>'
    );
  }

  function renderPremiumLockGrid(section, context) {
    return MATCH_CENTRE_PREMIUM.filter(function (s) {
      return s.section === section;
    }).map(function (stat) {
      return renderLockCard(stat, context);
    }).join('');
  }

  function getTopPlayerByMetric(players, scorer) {
    if (!players || !players.length) return null;
    return players.slice().sort(function (a, b) {
      return (scorer(b) || 0) - (scorer(a) || 0);
    })[0];
  }

  function buildAdvancedStatSummary(stat, context) {
    var players = (context.bundle && context.bundle.players) || [];
    var quickStats = context.quickStats || {};
    var homeStats = quickStats.home || {};
    var awayStats = quickStats.away || {};

    function playerLine(player, text) {
      if (!player) return text;
      return (player.name || 'Player') + ': ' + text;
    }

    switch (stat.id) {
      case 'player-goals': {
        var top = getTopPlayerByMetric(players, function (p) {
          var s = getPlayerWatchStats(p);
          return s && s.goals != null ? s.goals : 0;
        });
        var gs = top && getPlayerWatchStats(top);
        if (gs && gs.goals != null) return playerLine(top, gs.goals + ' season goals');
        return 'Club form data loading soon';
      }
      case 'player-assists': {
        var ap = getTopPlayerByMetric(players, function (p) {
          var s = getPlayerWatchStats(p);
          return s && s.assists != null ? s.assists : 0;
        });
        var as = ap && getPlayerWatchStats(ap);
        if (as && as.assists != null) return playerLine(ap, as.assists + ' season assists');
        return 'Club form data loading soon';
      }
      case 'fouls': {
        var fp = getTopPlayerByMetric(players, function (p) {
          var s = getPlayerWatchStats(p);
          return s ? ((s.foulsCommitted || s.fouls || 0)) : 0;
        });
        var fs = fp && getPlayerWatchStats(fp);
        if (fs && (fs.foulsCommitted != null || fs.fouls != null)) {
          return playerLine(fp, (fs.foulsCommitted != null ? fs.foulsCommitted : fs.fouls) + ' fouls this season');
        }
        if (homeStats.fouls != null || awayStats.fouls != null) {
          return 'Avg fouls — Home: ' + (homeStats.fouls != null ? homeStats.fouls : '—')
            + ', Away: ' + (awayStats.fouls != null ? awayStats.fouls : '—');
        }
        return 'Club form data loading soon';
      }
      case 'cards': {
        var cp = getTopPlayerByMetric(players, function (p) {
          var s = getPlayerWatchStats(p);
          return s && s.cards != null ? s.cards : 0;
        });
        var cs = cp && getPlayerWatchStats(cp);
        if (cs && cs.cards != null) return playerLine(cp, cs.cards + ' cards this season');
        if (homeStats.cards != null || awayStats.cards != null) {
          return 'Avg cards — Home: ' + (homeStats.cards != null ? homeStats.cards : '—')
            + ', Away: ' + (awayStats.cards != null ? awayStats.cards : '—');
        }
        return 'Club form data loading soon';
      }
      case 'shots':
      case 'shots-on-target': {
        var sp = getTopPlayerByMetric(players, function (p) {
          var s = getPlayerWatchStats(p);
          return s && s.shots != null ? s.shots : 0;
        });
        var ss = sp && getPlayerWatchStats(sp);
        if (ss && ss.shots != null) return playerLine(sp, ss.shots + ' shots this season');
        if (homeStats.shots != null || awayStats.shots != null) {
          return 'Avg shots — Home: ' + (homeStats.shots != null ? homeStats.shots : '—')
            + ', Away: ' + (awayStats.shots != null ? awayStats.shots : '—');
        }
        return 'Club form data loading soon';
      }
      case 'corner-trends':
        if (homeStats.cornersFor != null || awayStats.cornersFor != null) {
          return 'Avg corners for — Home: ' + (homeStats.cornersFor != null ? homeStats.cornersFor : '—')
            + ', Away: ' + (awayStats.cornersFor != null ? awayStats.cornersFor : '—');
        }
        return 'Not enough recent match data available';
      case 'goal-trends':
        if (homeStats.goalsFor != null || awayStats.goalsFor != null) {
          return 'Goals for — Home: ' + (homeStats.goalsFor != null ? homeStats.goalsFor : '—')
            + ', Away: ' + (awayStats.goalsFor != null ? awayStats.goalsFor : '—');
        }
        return 'Club form data loading soon';
      case 'team-analytics':
        return getStatsSourceLabel(quickStats.statsSource) + ' — pre-match team indicators loaded.';
      case 'match-insights':
        return players.length
          ? 'Pre-match insights from ' + players.length + ' squad players with club season stats.'
          : 'Not enough recent match data available';
      default:
        return 'Club form data loading soon';
    }
  }

  function formatLastFiveMatches(value) {
    if (value == null) return '—';
    return value + ' played';
  }

  function formatFormRating(value) {
    if (value == null) return '—';
    return String(value);
  }

  function formatPremiumValue(field, premium, unlocked, player) {
    var source = buildPremiumDisplaySource(premium, player);
    var raw = source[field.key];
    var formatted;

    if (field.format) {
      formatted = field.format(raw);
    } else if (raw == null || raw === '') {
      formatted = null;
    } else {
      formatted = String(raw);
    }

    if (formatted == null || formatted === '—') {
      return '—';
    }

    return formatted;
  }

  function buildPremiumDisplaySource(premium, player) {
    var source = Object.assign({}, premium || {});

    if (player && player.effectivePremium) {
      source = Object.assign({}, player.effectivePremium, source);
    }

    if (!player) return source;

    if (source.goals == null && player.recentGoals != null) source.goals = player.recentGoals;
    if (source.assists == null && player.recentAssists != null) source.assists = player.recentAssists;
    if (source.formRating == null && player.recentFormRating != null) source.formRating = player.recentFormRating;
    if (source.rating == null && player.recentFormRating != null) source.rating = player.recentFormRating;
    if (source.fouls == null && player.recentFouls != null) source.fouls = player.recentFouls;
    if (source.cards == null && player.recentCards != null) source.cards = player.recentCards;
    if (source.shots == null && player.recentShots != null) source.shots = player.recentShots;
    if (source.minutes == null && player.clubMinutes != null) source.minutes = player.clubMinutes;
    if (source.minutes == null && player.nationalMinutes != null) source.minutes = player.nationalMinutes;
    if (source.appearances == null && player.clubAppearances != null) source.appearances = player.clubAppearances;
    if (source.appearances == null && player.nationalAppearances != null) source.appearances = player.nationalAppearances;
    if (source.lastFiveCount == null && player.lastFiveCount != null) source.lastFiveCount = player.lastFiveCount;

    var premiumBlocks = [player.clubPremium, player.nationalPremium];
    premiumBlocks.forEach(function (block) {
      if (!block) return;
      if (source.lastFiveCount == null && block.lastFiveCount != null) source.lastFiveCount = block.lastFiveCount;
      if (source.formRating == null && block.formRating != null) source.formRating = block.formRating;
      if (source.goals == null && block.goals != null) source.goals = block.goals;
      if (source.assists == null && block.assists != null) source.assists = block.assists;
      if (source.shots == null && block.shots != null) source.shots = block.shots;
      if (source.fouls == null && block.fouls != null) source.fouls = block.fouls;
      if (source.foulsCommitted == null && block.foulsCommitted != null) source.foulsCommitted = block.foulsCommitted;
      if (source.cards == null && block.cards != null) source.cards = block.cards;
      if (source.chancesCreated == null && block.chancesCreated != null) source.chancesCreated = block.chancesCreated;
      if (source.cornersInvolved == null && block.cornersInvolved != null) source.cornersInvolved = block.cornersInvolved;
      if (source.minutes == null && block.minutes != null) source.minutes = block.minutes;
      if (source.appearances == null && block.appearances != null) source.appearances = block.appearances;
    });

    return source;
  }

  function renderLastFiveMatchLog(player) {
    var log = (player && player.lastFiveMatchLog) || [];
    if (!log.length) {
      var reason = player && player.lastFiveDiagnosis
        ? player.lastFiveDiagnosis
        : 'Not enough recent match data available';
      return (
        '<div class="player-profile-last-five">' +
          '<p class="player-profile-last-five__title">Last 5 match log</p>' +
          '<p class="player-profile-last-five__empty">' + escapeHtml(reason) + '</p>' +
        '</div>'
      );
    }

    var rows = log.map(function (entry) {
      var parts = [];
      if (entry.goals != null) parts.push(entry.goals + ' G');
      if (entry.assists != null) parts.push(entry.assists + ' A');
      if (entry.rating != null) parts.push('Rating ' + entry.rating);
      if (entry.minutes != null) parts.push(entry.minutes + ' min');
      var statLine = parts.length ? parts.join(' · ') : 'Played';

      return (
        '<div class="player-profile-last-five__row">' +
          '<span class="player-profile-last-five__match">' + escapeHtml(entry.match || 'Match') + '</span>' +
          '<span class="player-profile-last-five__stats">' + escapeHtml(statLine) + '</span>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="player-profile-last-five">' +
        '<p class="player-profile-last-five__title">Last 5 match log</p>' +
        rows +
      '</div>'
    );
  }

  function renderPremiumFieldRow(field, premium, unlocked, player) {
    var displayValue = formatPremiumValue(field, premium, unlocked, player);

    if (unlocked) {
      return (
        '<div class="player-profile-premium-field">' +
          '<span class="player-profile-premium-field__label">' + escapeHtml(field.label) + '</span>' +
          '<span class="player-profile-premium-field__value player-profile-premium-field__value--unlocked">' +
            escapeHtml(displayValue) +
          '</span>' +
        '</div>'
      );
    }

    return (
      '<div class="player-profile-premium-field">' +
        '<span class="player-profile-premium-field__label">' + escapeHtml(field.label) + '</span>' +
        '<span class="player-profile-premium-field__value" aria-hidden="true">' +
          '<span class="player-profile-premium-field__blur">' + escapeHtml(displayValue) + '</span>' +
        '</span>' +
      '</div>'
    );
  }

  function renderPremiumPlayerBlock(premium, player) {
    var unlocked = showFullMatchStats();
    var statRows = PREMIUM_PLAYER_FIELDS.map(function (field) {
      return renderPremiumFieldRow(field, premium, unlocked, player);
    }).join('');

    var sourceLabel = player && (player.recentFormSource || (player.effectivePremium && player.effectivePremium.statsSource))
      ? getStatsSourceLabel(player.recentFormSource || player.effectivePremium.statsSource)
      : 'Pre-match club form';
    var lastFiveLog = unlocked ? renderLastFiveMatchLog(player) : '';

    if (unlocked) {
      return (
        '<div class="player-profile-premium player-profile-premium--unlocked">' +
          '<p class="player-profile-premium-source">' + escapeHtml(sourceLabel) + '</p>' +
          '<div class="player-profile-premium-stats">' + statRows + '</div>' +
          lastFiveLog +
        '</div>'
      );
    }

    return (
      '<div class="player-profile-premium">' +
        '<span class="player-profile-premium-label">Premium</span>' +
        '<div class="player-profile-premium-blur">' + statRows + '</div>' +
        '<button type="button" class="player-profile-premium-lock" data-premium-player-lock>' +
          lockIconSvg() + '<span>Unlock with Premium</span>' +
        '</button>' +
      '</div>'
    );
  }

  function renderFreeField(label, value) {
    return (
      '<div class="player-profile-field">' +
        '<span class="player-profile-field__label">' + escapeHtml(label) + '</span>' +
        '<span class="player-profile-field__value">' + displayVal(value) + '</span>' +
      '</div>'
    );
  }

  function renderPlayerAvatar(player, sizeClass) {
    var cls = 'player-profile-avatar' + (sizeClass ? ' ' + sizeClass : '');
    var photo = player.photo || (player.clubLastMatchDetail && player.clubLastMatchDetail.photo);
    if (photo) {
      return '<img class="' + cls + ' player-profile-avatar--photo" src="' + escapeHtml(photo) + '" alt="" loading="lazy" width="48" height="48">';
    }
    return '<div class="' + cls + '" aria-hidden="true">' + escapeHtml((player.name || '?').charAt(0)) + '</div>';
  }

  function renderNationalColumn(player) {
    var position = player.nationalPosition || player.position;
    var age = player.age != null ? player.age : player.clubAge;
    var appearances = player.nationalStatsAvailable ? player.nationalAppearances : null;
    var minutes = player.nationalStatsAvailable ? player.nationalMinutes : null;

    if (player.source === 'lineup' && minutes == null) {
      minutes = 'Match day';
    }

    return (
      '<div class="player-profile-col player-profile-col--national">' +
        '<h5 class="player-profile-col__title">Country / National Team</h5>' +
        '<div class="player-profile-free">' +
          renderFreeField('National Team', player.nationalTeam) +
          renderFreeField('Position', position) +
          renderFreeField('Age', age) +
          renderFreeField('Appearances', appearances) +
          renderFreeField('Minutes Played', minutes) +
        '</div>' +
        renderPremiumPlayerBlock(player.nationalPremium, player) +
      '</div>'
    );
  }

  function renderClubColumn(player) {
    var clubHeader = player.clubStatsAvailable && player.clubLogo
      ? '<div class="player-profile-club-head">' +
          '<img class="player-profile-club-logo" src="' + escapeHtml(player.clubLogo) + '" alt="" loading="lazy" width="28" height="28">' +
          '<span class="player-profile-club-name">' + escapeHtml(player.club) + '</span>' +
        '</div>'
      : '';

    var freeFields = player.clubStatsAvailable
      ? (
          renderFreeField('Club Team', player.club) +
          renderFreeField('Position', player.clubPosition) +
          renderFreeField('Age', player.clubAge) +
          renderFreeField('Appearances', player.clubAppearances) +
          renderFreeField('Minutes Played', player.clubMinutes)
        )
      : (
          renderFreeField('Club Team', '—') +
          renderFreeField('Position', '—') +
          renderFreeField('Age', player.age != null ? player.age : player.clubAge) +
          renderFreeField('Appearances', '—') +
          renderFreeField('Minutes Played', '—')
        );

    var unavailableNote = player.clubStatsAvailable
      ? ''
      : '<p class="player-profile-club-unavailable">Club stats unavailable</p>';

    return (
      '<div class="player-profile-col player-profile-col--club">' +
        '<h5 class="player-profile-col__title">Club Season Stats</h5>' +
        unavailableNote +
        clubHeader +
        '<div class="player-profile-free">' + freeFields + '</div>' +
        renderPremiumPlayerBlock(player.clubPremium, player) +
      '</div>'
    );
  }

  function renderPlayerDetailPanel(player) {
    var numberBadge = player.number
      ? '<span class="player-profile-number">#' + escapeHtml(player.number) + '</span>'
      : '';

    var metaParts = [player.nationalTeam, player.clubStatsAvailable ? player.club : null, player.position]
      .filter(Boolean)
      .map(escapeHtml);

    return (
      '<div class="match-centre-player-detail">' +
        '<div class="match-centre-player-detail__toolbar">' +
          '<h3 class="match-centre-player-detail__title">Player Profile</h3>' +
          '<button type="button" class="match-centre-player-detail__close" data-close-player-detail aria-label="Close player profile">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>' +
        '</div>' +
        '<article class="player-profile-card">' +
          '<div class="player-profile-card__head">' +
            renderPlayerAvatar(player) +
            '<div class="player-profile-card__identity">' +
              numberBadge +
              '<h4 class="player-profile-card__name">' + escapeHtml(player.name) + '</h4>' +
              '<p class="player-profile-card__meta">' + metaParts.join(' · ') + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="player-profile-columns">' +
            renderNationalColumn(player) +
            renderClubColumn(player) +
          '</div>' +
        '</article>' +
      '</div>'
    );
  }

  function buildTeamIndicatorContext(players) {
    var maxForm = null;

    players.forEach(function (player) {
      var rating = player.recentFormRating;
      if (rating == null || isNaN(Number(rating))) return;
      var numeric = Number(rating);
      if (maxForm == null || numeric > maxForm) maxForm = numeric;
    });

    return { maxForm: maxForm };
  }

  function isTopRecentForm(player, teamContext) {
    if (teamContext.maxForm == null) return false;
    if (player.recentFormRating == null) return false;
    return Number(player.recentFormRating) === teamContext.maxForm;
  }

  function renderPlayerFormIndicators(player, teamContext) {
    var badges = [];

    if (isTopRecentForm(player, teamContext)) {
      badges.push({
        icon: '🔥',
        label: 'Recent Form',
        modifier: 'form',
      });
    }
    if (player.recentGoals != null && player.recentGoals > 0) {
      badges.push({
        icon: '⚽',
        label: 'Goal Threat',
        modifier: 'goal',
      });
    }
    if (player.recentAssists != null && player.recentAssists > 0) {
      badges.push({
        icon: '🎯',
        label: 'Assist Threat',
        modifier: 'assist',
      });
    }

    if (!badges.length) return '';

    return (
      '<span class="match-centre-player-row__badges">' +
        badges.map(function (badge) {
          return (
            '<span class="match-centre-player-badge match-centre-player-badge--' + badge.modifier + '" title="' + escapeHtml(badge.label) + '">' +
              badge.icon +
            '</span>'
          );
        }).join('') +
      '</span>'
    );
  }

  function renderCompactPlayerRow(player, teamContext) {
    var number = player.number != null ? escapeHtml(player.number) : '—';
    var indicators = renderPlayerFormIndicators(player, teamContext || { maxForm: null });

    return (
      '<button type="button" class="match-centre-player-row" data-player-id="' + escapeHtml(player.id) + '">' +
        renderPlayerAvatar(player, 'player-profile-avatar--sm') +
        '<span class="match-centre-player-row__number">' + number + '</span>' +
        '<span class="match-centre-player-row__name">' +
          '<span class="match-centre-player-row__name-text">' + escapeHtml(player.name) + '</span>' +
          indicators +
        '</span>' +
        '<span class="match-centre-player-row__pos">' + escapeHtml(player.position) + '</span>' +
      '</button>'
    );
  }

  function renderQuickStatsLoading() {
    return (
      '<div class="match-centre-quick-stats match-centre-quick-stats--loading">' +
        '<div class="fixtures-spinner" aria-hidden="true"></div>' +
        '<p>Loading team stats…</p>' +
      '</div>'
    );
  }

  function getQuickStatsBadgeLabel(stats) {
    if (stats.isMatchDay) return 'Match Stats';
    if (stats.statsSource === 'tournament') return 'Tournament Statistics';
    if (stats.statsSource === 'recent-international') return 'Recent International Form';
    if (stats.statsSource === 'club-squad-aggregate') return 'Squad Club Form (Pre-match)';
    if (stats.statsSource === 'mixed') return 'Pre-match Form (Mixed Sources)';
    if (stats.statsSource === 'match-day') return 'Live Match Statistics';
    if (stats.statsSource === 'none') return 'Pre-match Club Form';
    return 'Pre-match Club Form';
  }

  var INTERNATIONAL_ONLY_QUICK_STATS = ['throwIns', 'shots', 'shotsOnTarget'];

  function getTeamQuickStatDisplayValue(value, rowKey, teamStats) {
    if (value != null && value !== '') return escapeHtml(value);
    if (INTERNATIONAL_ONLY_QUICK_STATS.indexOf(rowKey) !== -1) {
      if (rowKey === 'throwIns') return '—';
      var intlCount = teamStats && teamStats.intlFixturesUsed != null ? teamStats.intlFixturesUsed : 0;
      return intlCount > 0 ? '—' : 'Not enough international data';
    }
    return '—';
  }

  function renderQuickStatsSection(stats, fixture) {
    if (!stats) return renderQuickStatsLoading();

    var label = getQuickStatsBadgeLabel(stats);
    var homeName = escapeHtml(fixture.home);
    var awayName = escapeHtml(fixture.away);

    function teamColumn(side, teamName) {
      var teamStats = stats[side] || {};
      var rows = QUICK_STAT_ROWS.map(function (row) {
        return (
          '<div class="match-centre-quick-stat">' +
            '<span class="match-centre-quick-stat__label">' + escapeHtml(row.label) + '</span>' +
            '<span class="match-centre-quick-stat__value">' + getTeamQuickStatDisplayValue(teamStats[row.key], row.key, teamStats) + '</span>' +
          '</div>'
        );
      }).join('');

      return (
        '<div class="match-centre-quick-stats-col">' +
          '<h4 class="match-centre-quick-stats-col__title">' + teamName + '</h4>' +
          '<div class="match-centre-quick-stats-col__grid">' + rows + '</div>' +
        '</div>'
      );
    }

    return (
      '<section class="match-centre-quick-stats" aria-label="Team quick stats">' +
        '<div class="match-centre-quick-stats__head">' +
          '<h3>Quick Stats</h3>' +
          '<span class="match-centre-quick-stats__badge">' + escapeHtml(label) + '</span>' +
        '</div>' +
        '<div class="match-centre-quick-stats__cols">' +
          teamColumn('home', homeName) +
          teamColumn('away', awayName) +
        '</div>' +
      '</section>'
    );
  }

  function renderPlayersLoading() {
    return (
      '<div class="match-centre-players-loading">' +
        '<div class="fixtures-spinner" aria-hidden="true"></div>' +
        '<p>Loading lineups and squad data…</p>' +
      '</div>'
    );
  }

  function renderPlayersEmpty() {
    return (
      '<div class="match-centre-players-empty">' +
        '<p class="match-centre-players-empty__title">Player data not available yet</p>' +
        '<p class="match-centre-players-empty__desc">Squad and lineup information will appear here when API-Football publishes data for this match.</p>' +
      '</div>'
    );
  }

  function renderPlayerLists(bundle, fixture) {
    if (!bundle || bundle.loading) return renderPlayersLoading();

    if (bundle.mode === 'error') {
      return (
        '<div class="match-centre-players-empty">' +
          '<p class="match-centre-players-empty__title">Could not load player data</p>' +
          '<p class="match-centre-players-empty__desc">' + escapeHtml(bundle.error || 'Unknown error') + '</p>' +
        '</div>'
      );
    }

    if (bundle.mode === 'none' || !bundle.players || !bundle.players.length) {
      return renderPlayersEmpty();
    }

    var badgeClass = bundle.mode === 'confirmed' ? 'lineup-badge--confirmed' : 'lineup-badge--projected';
    var disclaimer = bundle.disclaimer
      ? '<p class="match-centre-disclaimer">' + escapeHtml(bundle.disclaimer) + '</p>'
      : '';

    var homePlayers = bundle.players.filter(function (p) { return p.side === 'home'; });
    var awayPlayers = bundle.players.filter(function (p) { return p.side === 'away'; });

    function teamList(title, players) {
      var teamContext = buildTeamIndicatorContext(players);

      return (
        '<div class="match-centre-player-list">' +
          '<h4 class="match-centre-player-list__title">' + escapeHtml(title) + '</h4>' +
          '<div class="match-centre-player-list__rows">' +
            (players.length
              ? players.map(function (player) {
                  return renderCompactPlayerRow(player, teamContext);
                }).join('')
              : '<p class="match-centre-player-list__empty">—</p>') +
          '</div>' +
        '</div>'
      );
    }

    return (
      '<section class="match-centre-section match-centre-section--players">' +
        '<div class="match-centre-section__head">' +
          '<h3>Squad Lists</h3>' +
          '<span class="lineup-badge ' + badgeClass + '">' + escapeHtml(bundle.label) + '</span>' +
        '</div>' +
        disclaimer +
        '<p class="match-centre-section__desc">Tap a player to view country and club stats.</p>' +
        '<div class="match-centre-player-lists">' +
          teamList('Home', homePlayers) +
          teamList('Away', awayPlayers) +
        '</div>' +
      '</section>'
    );
  }

  var PLAYERS_TO_WATCH_ROWS = [
    {
      id: 'attacking',
      label: 'Top attacking threat',
      hasData: function (stats) {
        return stats && (stats.goals != null || stats.assists != null);
      },
      pickPlayer: function (players) {
        return getWatchPlayerPool(players).slice().sort(function (a, b) {
          var statsA = getPlayerWatchStats(a) || {};
          var statsB = getPlayerWatchStats(b) || {};
          var scoreA = (statsA.goals || 0) + (statsA.assists || 0);
          var scoreB = (statsB.goals || 0) + (statsB.assists || 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          return (statsB.assists || 0) - (statsA.assists || 0);
        })[0];
      },
      formatStats: function (stats) {
        if (!stats) return null;
        return (stats.goals != null ? stats.goals : 0) + ' goals, '
          + (stats.assists != null ? stats.assists : 0) + ' assists';
      },
    },
    {
      id: 'discipline',
      label: 'Discipline risk',
      hasData: function (stats) {
        return stats && (
          stats.foulsCommitted != null
          || stats.fouls != null
          || stats.cards != null
        );
      },
      pickPlayer: function (players) {
        return getWatchPlayerPool(players).slice().sort(function (a, b) {
          var statsA = getPlayerWatchStats(a) || {};
          var statsB = getPlayerWatchStats(b) || {};
          var riskA = (statsA.foulsCommitted || statsA.fouls || 0) + (statsA.cards || 0);
          var riskB = (statsB.foulsCommitted || statsB.fouls || 0) + (statsB.cards || 0);
          if (riskB !== riskA) return riskB - riskA;
          return (statsB.foulsCommitted || statsB.fouls || 0) - (statsA.foulsCommitted || statsA.fouls || 0);
        })[0];
      },
      formatStats: function (stats) {
        if (!stats) return null;
        var fouls = stats.foulsCommitted != null ? stats.foulsCommitted : (stats.fouls != null ? stats.fouls : 0);
        return fouls + ' fouls, ' + (stats.cards != null ? stats.cards : 0) + ' cards';
      },
    },
    {
      id: 'setpiece',
      label: 'Set-piece / corner threat',
      hasData: function (stats) {
        return stats && (stats.chancesCreated != null || stats.cornersInvolved != null);
      },
      pickPlayer: function (players) {
        return getWatchPlayerPool(players).slice().sort(function (a, b) {
          var statsA = getPlayerWatchStats(a) || {};
          var statsB = getPlayerWatchStats(b) || {};
          var threatA = (statsA.chancesCreated || 0) + (statsA.cornersInvolved || 0);
          var threatB = (statsB.chancesCreated || 0) + (statsB.cornersInvolved || 0);
          if (threatB !== threatA) return threatB - threatA;
          return (statsB.chancesCreated || 0) - (statsA.chancesCreated || 0);
        })[0];
      },
      formatStats: function (stats) {
        if (!stats) return null;
        return (stats.chancesCreated != null ? stats.chancesCreated : 0) + ' chances created, '
          + (stats.cornersInvolved != null ? stats.cornersInvolved : 0) + ' corners involved';
      },
    },
  ];

  function getPlayerWatchStats(player) {
    if (player.clubPremium) return player.clubPremium;
    if (player.effectivePremium) return player.effectivePremium;
    if (player.nationalPremium) return player.nationalPremium;
    return null;
  }

  function getWatchPlayerPool(players) {
    var withClub = players.filter(function (p) {
      return p.clubStatsAvailable && p.clubPremium;
    });
    if (withClub.length) return withClub;
    var withStats = players.filter(function (p) {
      return getPlayerWatchStats(p);
    });
    return withStats.length ? withStats : players;
  }

  function logPlayersToWatchDebug(teamLabel, category, candidate, stats) {
    console.info('[EdgeStats:PlayersToWatch]', {
      team: teamLabel,
      category: category.id,
      categoryLabel: category.label,
      selectedPlayerId: candidate && candidate.id,
      selectedPlayerName: candidate && candidate.name,
      sourceStats: stats,
      clubId: candidate && candidate.clubTeamId,
      clubSeason: candidate && (candidate.clubSeasonUsed || candidate.clubSeason),
      clubStatsAvailable: !!(candidate && candidate.clubStatsAvailable),
      isPremium: isPremiumUser(),
    });
  }

  function buildWatchRow(category, players, teamLabel) {
    var pool = getWatchPlayerPool(players);
    var candidate = category.pickPlayer(pool);
    var stats = candidate ? getPlayerWatchStats(candidate) : null;
    var premium = showFullMatchStats();

    if (premium) {
      logPlayersToWatchDebug(teamLabel, category, candidate, stats);
      return {
        label: category.label,
        statsText: candidate && stats ? category.formatStats(stats) : '—',
        locked: false,
        player: candidate || null,
      };
    }

    if (!candidate || !category.hasData(stats)) {
      return { label: category.label, statsText: null, locked: true, player: null };
    }

    return {
      label: category.label,
      statsText: category.formatStats(stats),
      locked: true,
      player: candidate,
    };
  }

  function buildTeamWatchRows(players, teamLabel) {
    return PLAYERS_TO_WATCH_ROWS.map(function (category) {
      return buildWatchRow(category, players, teamLabel);
    });
  }

  function renderWatchLockedIdentity() {
    return (
      '<span class="match-centre-watch-row__identity">' +
        '<span class="match-centre-watch-row__avatar" aria-hidden="true"></span>' +
        '<span class="match-centre-watch-row__name" aria-hidden="true"></span>' +
        '<span class="match-centre-watch-row__identity-lock" aria-hidden="true">' + lockIconSvg() + '</span>' +
      '</span>'
    );
  }

  function renderWatchSkeletonStats() {
    return (
      '<span class="match-centre-watch-row__stats match-centre-watch-row__stats--locked" aria-label="Stats locked">' +
        '<span class="match-centre-watch-row__stats-placeholder" aria-hidden="true"></span>' +
        '<span class="match-centre-watch-row__stats-lock" aria-hidden="true">' + lockIconSvg() + '</span>' +
      '</span>'
    );
  }

  function renderWatchUnlockedIdentity(player) {
    var photo = player && player.photo
      ? '<img class="match-centre-watch-row__avatar" src="' + escapeHtml(player.photo) + '" alt="" loading="lazy">'
      : '<span class="match-centre-watch-row__avatar" aria-hidden="true"></span>';

    return (
      '<span class="match-centre-watch-row__identity match-centre-watch-row__identity--unlocked">' +
        photo +
        '<span class="match-centre-watch-row__name">' + escapeHtml(player && player.name ? player.name : 'Unknown') + '</span>' +
      '</span>'
    );
  }

  function renderWatchRow(row) {
    var premium = showFullMatchStats();
    var statsHtml = row.statsText
      ? '<span class="match-centre-watch-row__stats">' + escapeHtml(row.statsText) + '</span>'
      : renderWatchSkeletonStats();

    var showIdentity = premium ? !!row.player : (row.player && !row.locked);
    var identityHtml = showIdentity
      ? renderWatchUnlockedIdentity(row.player)
      : renderWatchLockedIdentity();

    var tag = (!premium && row.locked) ? 'button' : 'div';
    var attrs = (!premium && row.locked)
      ? ' type="button" class="match-centre-watch-row" data-premium-watch-row'
      : ' class="match-centre-watch-row match-centre-watch-row--unlocked"';

    return (
      '<' + tag + attrs + '>' +
        '<span class="match-centre-watch-row__label">' + escapeHtml(row.label) + '</span>' +
        '<span class="match-centre-watch-row__content">' +
          identityHtml +
          '<span class="match-centre-watch-row__sep" aria-hidden="true">—</span>' +
          statsHtml +
        '</span>' +
      '</' + tag + '>'
    );
  }

  function renderWatchTeamColumn(title, rows) {
    return (
      '<div class="match-centre-watch-col">' +
        '<h4 class="match-centre-watch-col__title">' + escapeHtml(title) + '</h4>' +
        '<div class="match-centre-watch-col__rows">' +
          rows.map(renderWatchRow).join('') +
        '</div>' +
      '</div>'
    );
  }

  function renderPlayersToWatchLoading() {
    return (
      '<div class="match-centre-watch match-centre-watch--loading">' +
        '<div class="fixtures-spinner" aria-hidden="true"></div>' +
        '<p>Loading players to watch…</p>' +
      '</div>'
    );
  }

  function renderPlayersToWatchSection(fixture, bundle) {
    var premium = showFullMatchStats();
    var sectionTitle = 'Players To Watch';

    if (!bundle || bundle.loading) return renderPlayersToWatchLoading();

    if (bundle.mode === 'error' || bundle.mode === 'none' || !bundle.players || !bundle.players.length) {
      var emptyRows = PLAYERS_TO_WATCH_ROWS.map(function (category) {
        return { label: category.label, statsText: null, locked: true, player: null };
      });

      return (
        '<section class="match-centre-section match-centre-watch' + (premium ? ' match-centre-watch--unlocked' : '') + '" aria-label="Players to watch">' +
          '<div class="match-centre-section__head">' +
            '<h3>' + sectionTitle + '</h3>' +
            (premium ? '' : '<span class="premium-lock-badge">Premium</span>') +
          '</div>' +
          '<p class="match-centre-section__desc">' + (premium
            ? 'Form and threat indicators with player identities unlocked.'
            : 'Unlock player identities behind these form and threat indicators.') + '</p>' +
          '<div class="match-centre-watch__cols">' +
            renderWatchTeamColumn(fixture.home + ' Players To Watch', emptyRows) +
            renderWatchTeamColumn(fixture.away + ' Players To Watch', emptyRows) +
          '</div>' +
        '</section>'
      );
    }

    var homePlayers = bundle.players.filter(function (p) { return p.side === 'home'; });
    var awayPlayers = bundle.players.filter(function (p) { return p.side === 'away'; });

    return (
      '<section class="match-centre-section match-centre-watch' + (premium ? ' match-centre-watch--unlocked' : '') + '" aria-label="Players to watch">' +
        '<div class="match-centre-section__head">' +
          '<h3>' + sectionTitle + '</h3>' +
          (premium ? '' : '<span class="premium-lock-badge">Premium</span>') +
        '</div>' +
        '<p class="match-centre-section__desc">' + (premium
          ? 'Form and threat indicators with player identities unlocked.'
          : 'Unlock player identities behind these form and threat indicators.') + '</p>' +
        '<div class="match-centre-watch__cols">' +
          renderWatchTeamColumn(fixture.home + ' Players To Watch', buildTeamWatchRows(homePlayers, fixture.home)) +
          renderWatchTeamColumn(fixture.away + ' Players To Watch', buildTeamWatchRows(awayPlayers, fixture.away)) +
        '</div>' +
      '</section>'
    );
  }

  function renderSectionNav() {
    return (
      '<nav class="match-centre-nav" aria-label="Match Centre sections">' +
        '<button type="button" class="match-centre-nav__btn" data-scroll-section="match-centre-quick-stats">Team Stats</button>' +
        '<button type="button" class="match-centre-nav__btn" data-scroll-section="match-centre-players">Squad Lists</button>' +
        '<button type="button" class="match-centre-nav__btn" data-scroll-section="match-centre-premium">Advanced Stats</button>' +
        '<button type="button" class="match-centre-nav__btn" data-scroll-section="match-centre-prediction">Prediction</button>' +
      '</nav>'
    );
  }

  function renderMatchCentre(fixture, helpers) {
    var score = helpers.getScoreDisplay(fixture);
    var statusClass = fixture.status === 'live' ? ' live' : '';
    var statusText = fixture.status === 'live'
      ? (fixture.statusLabel || 'Live')
      : fixture.status === 'completed'
        ? (fixture.statusLabel || 'Full Time')
        : (fixture.statusLabel || 'Scheduled');

    var teamLogo = helpers.renderTeamLogo;

    return (
      '<div class="match-centre">' +
        '<div class="match-centre-badge">Match Centre</div>' +

        '<header class="match-centre-hero">' +
          '<div class="match-centre-hero__teams">' +
            '<div class="match-centre-hero__team">' +
              teamLogo(fixture.homeLogo, fixture.home) +
              '<span class="match-centre-hero__team-name">' + escapeHtml(fixture.home) + '</span>' +
            '</div>' +
            '<div class="match-centre-hero__score match-detail-score ' + score.className + '">' + score.html + '</div>' +
            '<div class="match-centre-hero__team">' +
              teamLogo(fixture.awayLogo, fixture.away) +
              '<span class="match-centre-hero__team-name">' + escapeHtml(fixture.away) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="match-centre-hero__meta">' +
            '<span class="match-centre-hero__meta-item">' + escapeHtml(fixture.date) + '</span>' +
            '<span class="match-centre-hero__meta-sep">·</span>' +
            '<span class="match-centre-hero__meta-item">' + escapeHtml(fixture.venue) + '</span>' +
            '<span class="match-centre-hero__meta-sep">·</span>' +
            '<span class="match-centre-hero__meta-item match-detail-status' + statusClass + '">' + escapeHtml(statusText) + '</span>' +
          '</div>' +
          '<span class="match-detail-round">' + escapeHtml(fixture.group) + '</span>' +
        '</header>' +

        renderSectionNav() +

        '<div id="match-centre-quick-stats">' + renderQuickStatsLoading() + '</div>' +

        '<div id="match-centre-players-to-watch">' + renderPlayersToWatchLoading() + '</div>' +

        '<div class="match-centre-advanced-bar">' +
          '<button type="button" class="btn btn-outline btn-sm match-centre-advanced-btn" data-scroll-premium>Advanced Stats</button>' +
          '<div class="match-centre-premium-teasers">' +
            PREMIUM_TEASERS.map(renderPremiumTeaserCard).join('') +
          '</div>' +
        '</div>' +

        '<section class="match-centre-section match-centre-premium-section match-centre-premium-section--unlocked" id="match-centre-premium">' +
          '<div class="match-centre-section__head">' +
            '<h3>Advanced Stats</h3>' +
            '<span class="premium-lock-badge premium-lock-badge--active">Unlocked</span>' +
          '</div>' +
          '<p class="match-centre-section__desc">Betting insights — player goals, assists, fouls, cards, corners and team trends.</p>' +
          '<div class="premium-lock-grid match-centre-premium-grid">' +
            renderPremiumLockGrid('player') +
            renderPremiumLockGrid('match') +
          '</div>' +
        '</section>' +

        (global.PredictionGenerator ? global.PredictionGenerator.renderShell() : '') +

        '<div id="match-centre-players">' + renderPlayersLoading() + '</div>' +
        '<div id="match-centre-player-detail" class="match-centre-player-detail-wrap hidden" aria-hidden="true"></div>' +
      '</div>'
    );
  }

  function bindPremiumInteractions(container, callbacks) {
    container.querySelectorAll('[data-prediction-unlock], [data-match-centre-upgrade]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (callbacks.onJoinPremium) callbacks.onJoinPremium();
        else if (callbacks.onPremiumClick) callbacks.onPremiumClick(PREMIUM_TOAST);
      });
    });

    var scrollBtn = container.querySelector('[data-scroll-premium]');
    if (scrollBtn) {
      scrollBtn.addEventListener('click', function () {
        var target = container.querySelector('#match-centre-premium');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function loadPredictionSection(container, fixture, callbacks) {
    if (!fixture || !global.PredictionGenerator) return;
    var body = container.querySelector('#match-centre-prediction-body');
    if (!body) return;
    global.PredictionGenerator.loadInto(body, fixture.home, fixture.away, {
      onUnlock: callbacks.onJoinPremium || function () {
        if (callbacks.onPremiumClick) callbacks.onPremiumClick(PREMIUM_TOAST);
      },
    });
  }

  function bindPlayerList(container, bundle, callbacks, fixture) {
    if (!bundle || !bundle.players) return;

    function bindDetailClose(detailWrap) {
      var closeBtn = detailWrap.querySelector('[data-close-player-detail]');
      if (!closeBtn) return;
      closeBtn.addEventListener('click', function () {
        detailWrap.classList.add('hidden');
        detailWrap.setAttribute('aria-hidden', 'true');
        detailWrap.innerHTML = '';
        container.querySelectorAll('.match-centre-player-row').forEach(function (r) {
          r.classList.remove('is-active');
        });
      });
    }

    function openPlayerDetail(player) {
      var detailWrap = container.querySelector('#match-centre-player-detail');
      if (!detailWrap) return;

      logPlayerPremiumDebug(player);
      detailWrap.innerHTML = renderPlayerDetailPanel(player);
      detailWrap.classList.remove('hidden');
      detailWrap.setAttribute('aria-hidden', 'false');
      bindPremiumInteractions(detailWrap, callbacks);
      bindDetailClose(detailWrap);
      detailWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      if (!fixture || !global.ApiFootball
        || typeof global.ApiFootball.enrichSinglePlayerForDetail !== 'function') {
        return;
      }

      global.ApiFootball.enrichSinglePlayerForDetail(player, fixture).then(function (fresh) {
        if (!fresh || !detailWrap.isConnected) return;
        logPlayerPremiumDebug(fresh);
        detailWrap.innerHTML = renderPlayerDetailPanel(fresh);
        bindPremiumInteractions(detailWrap, callbacks);
        bindDetailClose(detailWrap);
      }).catch(function (err) {
        console.warn('[EdgeStats:PlayerDetail] enrich failed:', err.message);
      });
    }

    container.querySelectorAll('.match-centre-player-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var playerId = Number(row.getAttribute('data-player-id'));
        var player = bundle.players.find(function (p) {
          return Number(p.id) === playerId;
        });
        if (!player) return;

        container.querySelectorAll('.match-centre-player-row').forEach(function (r) {
          r.classList.remove('is-active');
        });
        row.classList.add('is-active');
        openPlayerDetail(player);
      });
    });
  }

  function bindSectionNav(container) {
    container.querySelectorAll('[data-scroll-section]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sectionId = btn.getAttribute('data-scroll-section');
        var target = container.querySelector('#' + sectionId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function bindMatchCentre(container, callbacks, fixture) {
    if (!container) return;
    container._matchCentreFixture = fixture || container._matchCentreFixture || null;
    bindSectionNav(container);
    bindPremiumInteractions(container, callbacks);
    loadPredictionSection(container, container._matchCentreFixture, callbacks);
  }

  function updateQuickStatsSection(container, stats, fixture) {
    var el = container.querySelector('#match-centre-quick-stats');
    if (!el) return;
    container._matchCentreQuickStats = stats;
    el.innerHTML = renderQuickStatsSection(stats, fixture);
    updateAdvancedStatsSection(container, container._matchCentrePlayerBundle || null, stats, fixture);
  }

  function updatePlayersToWatchSection(container, bundle, fixture) {
    var el = container.querySelector('#match-centre-players-to-watch');
    if (!el || !fixture) return;
    el.innerHTML = renderPlayersToWatchSection(fixture, bundle);
  }

  function updateAdvancedStatsSection(container, bundle, quickStats, fixture) {
    if (!fixture) return;
    var grid = container.querySelector('.match-centre-premium-grid');
    if (!grid) return;

    var context = {
      bundle: bundle,
      quickStats: quickStats || container._matchCentreQuickStats || {},
      fixture: fixture,
    };

    grid.innerHTML =
      renderPremiumLockGrid('player', context) +
      renderPremiumLockGrid('match', context);
  }

  function updatePlayersSection(container, bundle, callbacks, fixture) {
    container._matchCentrePlayerBundle = bundle;
    updatePlayersToWatchSection(container, bundle, fixture);

    var el = container.querySelector('#match-centre-players');
    if (!el) return;
    el.innerHTML = renderPlayerLists(bundle, fixture);
    bindPremiumInteractions(container, callbacks);
    bindPlayerList(container, bundle, callbacks, fixture);
    updateAdvancedStatsSection(container, bundle, container._matchCentreQuickStats || null, fixture);
  }

  global.MatchCentre = {
    render: renderMatchCentre,
    bind: bindMatchCentre,
    updatePlayers: updatePlayersSection,
    updateQuickStats: updateQuickStatsSection,
    updatePlayersToWatch: updatePlayersToWatchSection,
    updateAdvancedStats: updateAdvancedStatsSection,
    loadPrediction: loadPredictionSection,
    PREMIUM_TOAST: PREMIUM_TOAST,
  };
})(window);
