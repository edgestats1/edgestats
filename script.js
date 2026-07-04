(function () {
  'use strict';

  // Live fixtures loaded from API-Football via /api/fixtures (logo enrichment)
  var liveFixtures = [];
  var knockoutFixtures = [];
  var nextPotdFixture = null;
  var allSeasonFixtures = [];
  var completedFixtures = [];
  var currentFixtureFilter = 'all';
  var currentMatchCentreIndex = null;
  var premiumToastTimer = null;
  var lastInsightsRankingData = null;

  // ── Helpers ──
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function setDashValue(id, text, small) {
    var el = $(id);
    el.textContent = text;
    el.classList.toggle('dash-card-value--sm', Boolean(small));
  }

  function setDashChange(id, text, className) {
    var el = $(id);
    el.textContent = text;
    el.className = 'dash-card-change' + (className ? ' ' + className : '');
  }

  function buildGroupProgress(allFixtures) {
    var groups = {};

    allFixtures.forEach(function (f) {
      if (f.group.indexOf('Group') !== 0) return;
      if (!groups[f.group]) groups[f.group] = { played: 0, total: 0 };
      groups[f.group].total++;
      if (f.status === 'completed') groups[f.group].played++;
    });

    return Object.keys(groups).sort().map(function (name) {
      return { group: name, played: groups[name].played, total: groups[name].total };
    });
  }

  function sumGoalsFromCompleted(completed) {
    return completed.reduce(function (sum, f) {
      if (f.homeScore === null || f.awayScore === null) return sum;
      return sum + f.homeScore + f.awayScore;
    }, 0);
  }

  function renderDashboardEmpty() {
    setDashValue('#dash-matches-played', '0', false);
    setDashChange('#dash-matches-change', 'Starts June 12', 'neutral');

    setDashValue('#dash-total-goals', 'Available after kickoff', true);
    setDashChange('#dash-goals-avg', '', '');

    setDashValue('#dash-avg-goals', 'Available after first match', true);
    setDashChange('#dash-goals-trend', '', '');

    setDashValue('#dash-avg-corners', 'Premium stat after matches begin', true);
    setDashChange('#dash-corners-trend', '', 'premium-hint');

    $('#dashboard-group-section').classList.add('hidden');
  }

  function renderDashboardFromApi(allFixtures, completed) {
    if (!completed.length) {
      renderDashboardEmpty();
      return;
    }

    var totalGoals = sumGoalsFromCompleted(completed);
    var avgGoals = (totalGoals / completed.length).toFixed(1);

    setDashValue('#dash-matches-played', String(completed.length), false);
    setDashChange('#dash-matches-change', completed.length + ' completed', 'positive');

    setDashValue('#dash-total-goals', String(totalGoals), false);
    setDashChange('#dash-goals-avg', 'From ' + completed.length + ' match' + (completed.length === 1 ? '' : 'es'), 'neutral');

    setDashValue('#dash-avg-goals', avgGoals, false);
    setDashChange('#dash-goals-trend', totalGoals + ' total goals', 'neutral');

    setDashValue('#dash-avg-corners', 'Premium stat', true);
    setDashChange('#dash-corners-trend', 'Unlock with EdgeStats Premium', 'premium-hint');

    var groupData = buildGroupProgress(allFixtures);
    var groupSection = $('#dashboard-group-section');
    var progressEl = $('#group-progress');

    if (!groupData.length) {
      groupSection.classList.add('hidden');
      return;
    }

    groupSection.classList.remove('hidden');
    progressEl.innerHTML = groupData.map(function (g) {
      var pct = g.total ? Math.round((g.played / g.total) * 100) : 0;
      return (
        '<div class="progress-item">' +
          '<div class="progress-label">' +
            '<span>' + g.group + '</span>' +
            '<span>' + g.played + '/' + g.total + ' played</span>' +
          '</div>' +
          '<div class="progress-track">' +
            '<div class="progress-fill" data-width="' + pct + '%"></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    requestAnimationFrame(function () {
      progressEl.querySelectorAll('.progress-fill').forEach(function (bar) {
        var w = bar.getAttribute('data-width');
        if (w) bar.style.width = w;
      });
    });
  }

  async function loadDashboard() {
    setDashValue('#dash-matches-played', '…', false);
    setDashChange('#dash-matches-change', 'Loading…', 'neutral');

    try {
      allSeasonFixtures = await ApiFootball.fetchAllWorldCupFixtures();
      completedFixtures = allSeasonFixtures.filter(function (f) {
        return f.status === 'completed';
      });
      renderDashboardFromApi(allSeasonFixtures, completedFixtures);
    } catch (err) {
      renderDashboardEmpty();
    }
  }

  function animateBars() {
    requestAnimationFrame(function () {
      $$('.progress-fill, .chart-bar-fill, .team-stat-bar-fill').forEach(function (bar) {
        var w = bar.getAttribute('data-width');
        if (w) bar.style.width = w;
      });
    });
  }

  // ── Fixtures UI states ──
  function showFixturesState(state) {
    var loading = $('#fixtures-loading');
    var error = $('#fixtures-error');
    var empty = $('#fixtures-empty');
    var grid = $('#fixtures-grid');
    var filters = $('#fixtures-filters');

    loading.classList.toggle('hidden', state !== 'loading');
    error.classList.toggle('hidden', state !== 'error');
    empty.classList.toggle('hidden', state !== 'empty');
    grid.classList.toggle('hidden', state !== 'ready');
    filters.hidden = state !== 'ready';
  }

  function setFixturesError(message) {
    $('#fixtures-error-message').textContent = message;
    showFixturesState('error');
  }

  function setApiStatus(message, isError) {
    var el = $('#api-status');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden', 'api-status--ok', 'api-status--error');
    el.classList.add(isError ? 'api-status--error' : 'api-status--ok');
  }

  function clearApiStatus() {
    var el = $('#api-status');
    if (el) el.classList.add('hidden');
  }

  function extractFixtureTeamNames(fixtures) {
    var names = [];
    (fixtures || []).forEach(function (fixture) {
      if (fixture.home) names.push(fixture.home);
      if (fixture.away) names.push(fixture.away);
    });
    return names;
  }

  function applyFixtureTeamsToInsights() {
    if (typeof PlayersToWatch === 'undefined' || !PlayersToWatch.setFixtureTeams) return;
    PlayersToWatch.setFixtureTeams(extractFixtureTeamNames(liveFixtures));
  }

  function refreshTodaysBestInsights(isPremium) {
    var watchGrid = $('#players-to-watch-grid');
    if (!watchGrid || typeof PlayersToWatch === 'undefined' || !lastInsightsRankingData) return;
    PlayersToWatch.updateAll(watchGrid, lastInsightsRankingData, Boolean(isPremium));
    PlayersToWatch.bindCards(watchGrid, Boolean(isPremium));
  }

  function formatKnockoutDate(iso) {
    if (!iso) return 'TBD';
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch (e) {
      return iso;
    }
  }

  function mapKnockoutStatus(status) {
    if (!status || status === 'NS' || status === 'TBD') return 'upcoming';
    if (status === 'FT' || status === 'AET' || status === 'PEN') return 'completed';
    if (status === '1H' || status === '2H' || status === 'HT' || status === 'ET' || status === 'LIVE') return 'live';
    return 'upcoming';
  }

  function normalizeKnockoutRow(row) {
    return {
      id: row.fixtureId,
      group: row.round || row.stage || 'Knockout',
      home: row.homeTeam,
      homeId: row.homeTeamId,
      homeLogo: null,
      away: row.awayTeam,
      awayId: row.awayTeamId,
      awayLogo: null,
      homeScore: null,
      awayScore: null,
      status: mapKnockoutStatus(row.status),
      statusLabel: row.stage || row.round || 'Knockout',
      statusShort: row.status || 'NS',
      date: formatKnockoutDate(row.kickoffUTC),
      dateRaw: row.kickoffUTC,
      venue: row.venue || 'TBD',
      city: row.city || '',
      source: 'knockout-export',
    };
  }

  function enrichFixtureLogos(fixture) {
    if (!fixture || !liveFixtures.length) return fixture;
    var match = liveFixtures.find(function (f) {
      return f.id === fixture.id
        || (f.home === fixture.home && f.away === fixture.away);
    });
    if (match) {
      fixture.homeLogo = match.homeLogo || fixture.homeLogo;
      fixture.awayLogo = match.awayLogo || fixture.awayLogo;
    }
    return fixture;
  }

  function findNextPotdFixture(fixtures) {
    var upcoming = (fixtures || []).filter(function (f) {
      return f.status === 'upcoming' || f.status === 'live';
    });
    upcoming.sort(function (a, b) {
      return new Date(a.dateRaw || 0) - new Date(b.dateRaw || 0);
    });
    return upcoming[0] || null;
  }

  function refreshPredictionOfTheDay() {
    var mount = $('#potd-mount');
    if (!mount || typeof PredictionOfTheDay === 'undefined') return;
    PredictionOfTheDay.refresh(mount, nextPotdFixture);
  }

  // ── Knockout Fixtures (static export + optional API logos) ──
  function showKnockoutFixturesState(state) {
    $('#knockout-fixtures-loading').classList.toggle('hidden', state !== 'loading');
    $('#knockout-fixtures-error').classList.toggle('hidden', state !== 'error');
    $('#knockout-fixtures-empty').classList.toggle('hidden', state !== 'empty');
    $('#knockout-fixtures-mount').classList.toggle('hidden', state !== 'ready');
  }

  function setKnockoutFixturesError(message) {
    $('#knockout-fixtures-error-message').textContent = message;
    showKnockoutFixturesState('error');
  }

  async function loadKnockoutFixtures() {
    showKnockoutFixturesState('loading');
    clearApiStatus();

    try {
      var res = await fetch('/api/knockout-fixtures');
      var data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Knockout fixtures unavailable');
      }

      knockoutFixtures = (data.fixtures || []).map(normalizeKnockoutRow);
      knockoutFixtures.sort(function (a, b) {
        return new Date(a.dateRaw || 0) - new Date(b.dateRaw || 0);
      });

      if (!knockoutFixtures.length) {
        showKnockoutFixturesState('empty');
        refreshPredictionOfTheDay();
        return;
      }

      enrichKnockoutFromLiveApi();
      nextPotdFixture = findNextPotdFixture(knockoutFixtures);
      showKnockoutFixturesState('ready');
      renderKnockoutFixtures();
      refreshPredictionOfTheDay();
      setApiStatus('Loaded ' + knockoutFixtures.length + ' knockout fixture' + (knockoutFixtures.length === 1 ? '' : 's') + '.', false);
    } catch (err) {
      var message = err && err.message ? err.message : 'Unable to load knockout fixtures.';
      setKnockoutFixturesError(message);
      setApiStatus(message, true);
    }
  }

  async function enrichKnockoutFromLiveApi() {
    if (typeof ApiFootball === 'undefined' || !ApiFootball.fetchWorldCupFixtures) return;
    try {
      liveFixtures = await ApiFootball.fetchWorldCupFixtures({ next: 32 });
      knockoutFixtures = knockoutFixtures.map(enrichFixtureLogos);
      nextPotdFixture = findNextPotdFixture(knockoutFixtures);
      if (!$('#knockout-fixtures-mount').classList.contains('hidden')) {
        renderKnockoutFixtures();
        refreshPredictionOfTheDay();
      }
    } catch (e) {
      /* Logo enrichment optional */
    }
  }

  function renderKnockoutFixtures() {
    var mount = $('#knockout-fixtures-mount');
    if (!mount) return;

    var byRound = {};
    knockoutFixtures.forEach(function (f) {
      var round = f.group || 'Knockout';
      if (!byRound[round]) byRound[round] = [];
      byRound[round].push(f);
    });

    var rounds = Object.keys(byRound);
    var html = rounds.map(function (round) {
      return (
        '<div class="knockout-round">' +
          '<h3 class="knockout-round__title">' + round + '</h3>' +
          '<div class="fixtures-grid">' +
            byRound[round].map(function (f, idx) {
              var globalIdx = knockoutFixtures.indexOf(f);
              var isUpcoming = f.status === 'upcoming' || f.status === 'live';
              return (
                '<article class="fixture-card fixture-card--knockout" data-knockout-index="' + globalIdx + '">' +
                  '<div class="fixture-meta">' +
                    '<span class="fixture-group">' + f.group + '</span>' +
                    '<span class="fixture-status' + (f.status === 'live' ? ' live' : '') + '">' + f.date + '</span>' +
                  '</div>' +
                  '<div class="fixture-teams">' +
                    '<div class="fixture-team">' +
                      renderTeamLogo(f.homeLogo, f.home) +
                      '<div class="fixture-team-name">' + f.home + '</div>' +
                    '</div>' +
                    '<div class="fixture-score upcoming">vs</div>' +
                    '<div class="fixture-team">' +
                      renderTeamLogo(f.awayLogo, f.away) +
                      '<div class="fixture-team-name">' + f.away + '</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="fixture-footer">' +
                    '<span>' + f.venue + (f.city ? ', ' + f.city : '') + '</span>' +
                  '</div>' +
                  '<div class="fixture-card-actions">' +
                    '<button type="button" class="btn btn-outline btn-sm" data-knockout-view="' + globalIdx + '">View Match</button>' +
                    (isUpcoming
                      ? '<button type="button" class="btn btn-primary btn-sm" data-knockout-predict="' + globalIdx + '">Generate Prediction</button>'
                      : '') +
                  '</div>' +
                '</article>'
              );
            }).join('') +
          '</div>' +
        '</div>'
      );
    }).join('');

    mount.innerHTML = html;
    bindKnockoutFixtureClicks();
  }

  function bindKnockoutFixtureClicks() {
    var mount = $('#knockout-fixtures-mount');
    if (!mount || mount._knockoutBound) return;
    mount._knockoutBound = true;

    mount.addEventListener('click', function (e) {
      var predictBtn = e.target.closest('[data-knockout-predict]');
      if (predictBtn) {
        e.preventDefault();
        var idx = parseInt(predictBtn.getAttribute('data-knockout-predict'), 10);
        openKnockoutFixture(knockoutFixtures[idx], { scrollToPrediction: true });
        return;
      }
      var viewBtn = e.target.closest('[data-knockout-view]');
      if (viewBtn) {
        e.preventDefault();
        var vIdx = parseInt(viewBtn.getAttribute('data-knockout-view'), 10);
        openKnockoutFixture(knockoutFixtures[vIdx]);
      }
    });
  }

  function openKnockoutFixture(fixture, options) {
    if (!fixture) return;
    var enriched = enrichFixtureLogos(Object.assign({}, fixture));
    openMatchCentreByFixture(enriched, options);
  }

  window.openKnockoutFixture = openKnockoutFixture;
  window.refreshPredictionOfTheDay = refreshPredictionOfTheDay;

  function openMatchCentreByFixture(fixture, options) {
    options = options || {};
    if (!fixture || typeof MatchCentre === 'undefined') return;

    currentMatchCentreIndex = knockoutFixtures.indexOf(fixture);
    if (currentMatchCentreIndex < 0) {
      currentMatchCentreIndex = null;
    }

    var body = $('#match-detail-body');
    var callbacks = {
      onPremiumClick: showPremiumPreviewToast,
      onJoinPremium: scrollToPremium,
    };

    body.innerHTML = MatchCentre.render(fixture, {
      getScoreDisplay: getScoreDisplay,
      renderTeamLogo: renderTeamLogo,
    });

    MatchCentre.bind(body, callbacks, fixture);

    var modal = $('#match-detail');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('match-detail-open');
    $('#match-detail-close').focus();

    if (typeof ApiFootball !== 'undefined' && ApiFootball.fetchMatchPlayers) {
      var playersPromise = ApiFootball.fetchMatchPlayers(fixture);
      var statsPromise = ApiFootball.fetchMatchTeamQuickStats
        ? ApiFootball.fetchMatchTeamQuickStats(fixture)
        : Promise.resolve(null);

      statsPromise
        .then(function (stats) {
          if (body.querySelector('.match-centre') && typeof MatchCentre.updateQuickStats === 'function') {
            MatchCentre.updateQuickStats(body, stats, fixture);
          }
        })
        .catch(function () {
          if (body.querySelector('.match-centre') && typeof MatchCentre.updateQuickStats === 'function') {
            MatchCentre.updateQuickStats(body, {
              home: {},
              away: {},
              isMatchDay: fixture.status === 'completed' || fixture.status === 'live',
              statsSource: 'recent',
            }, fixture);
          }
        });

      playersPromise
        .then(function (bundle) {
          if (body.querySelector('.match-centre')) {
            MatchCentre.updatePlayers(body, bundle, callbacks, fixture);
          }
        })
        .catch(function (err) {
          MatchCentre.updatePlayers(body, {
            mode: 'error',
            error: err.message || 'Failed to load player data.',
          }, callbacks, fixture);
        });
    } else {
      MatchCentre.updatePlayers(body, { mode: 'none', players: [] }, callbacks, fixture);
    }

    if (options.scrollToPrediction) {
      setTimeout(function () {
        var target = body.querySelector('#match-centre-prediction');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (!getPremiumState()) {
          showPremiumPreviewToast();
        }
      }, 350);
    }
  }

  // ── Fixtures (legacy API — logo enrichment only) ──
  async function loadFixtures() {
    return loadKnockoutFixtures();
  }

  function renderTeamLogo(logo, name) {
    if (logo) {
      return '<img class="fixture-team-logo" src="' + logo + '" alt="' + name + '" loading="lazy" width="40" height="40">';
    }
    return '<div class="fixture-team-logo fixture-team-logo--placeholder" aria-hidden="true">' + name.charAt(0) + '</div>';
  }

  function renderFixtures(filter) {
    currentFixtureFilter = filter || 'all';
    var list = liveFixtures;

    if (filter === 'upcoming') {
      list = liveFixtures.filter(function (f) { return f.status === 'upcoming'; });
    } else if (filter === 'completed') {
      list = liveFixtures.filter(function (f) { return f.status === 'completed'; });
    }

    var grid = $('#fixtures-grid');

    if (!list.length) {
      grid.innerHTML = '<p class="fixtures-inline-empty">No matches match this filter.</p>';
      return;
    }

    grid.innerHTML = list.map(function (f) {
      var scoreHtml;
      if (f.status === 'upcoming') {
        scoreHtml = '<div class="fixture-score upcoming">vs</div>';
      } else if (f.homeScore !== null && f.awayScore !== null) {
        scoreHtml = '<div class="fixture-score">' + f.homeScore + ' – ' + f.awayScore + '</div>';
      } else {
        scoreHtml = '<div class="fixture-score upcoming">–</div>';
      }

      var statusText;
      if (f.status === 'live') {
        statusText = f.statusLabel || 'Live';
      } else if (f.status === 'completed') {
        statusText = f.statusLabel || 'Full Time';
      } else {
        statusText = f.date;
      }

      return (
        '<button type="button" class="fixture-card fixture-card--clickable" data-fixture-index="' + liveFixtures.indexOf(f) + '" data-status="' + f.status + '" aria-label="View ' + f.home + ' vs ' + f.away + '">' +
          '<div class="fixture-meta">' +
            '<span class="fixture-group">' + f.group + '</span>' +
            '<span class="fixture-status' + (f.status === 'live' ? ' live' : '') + '">' + statusText + '</span>' +
          '</div>' +
          '<div class="fixture-teams">' +
            '<div class="fixture-team">' +
              renderTeamLogo(f.homeLogo, f.home) +
              '<div class="fixture-team-name">' + f.home + '</div>' +
            '</div>' +
            scoreHtml +
            '<div class="fixture-team">' +
              renderTeamLogo(f.awayLogo, f.away) +
              '<div class="fixture-team-name">' + f.away + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="fixture-footer">' +
            '<span>' + f.venue + (f.city ? ', ' + f.city : '') + '</span>' +
            (f.status === 'upcoming'
              ? '<button type="button" class="btn btn-outline btn-sm fixture-predict-btn" data-fixture-predict="' + liveFixtures.indexOf(f) + '">Prediction</button>'
              : '') +
          '</div>' +
          '<span class="fixture-card-hint">Open Match Centre →</span>' +
        '</button>'
      );
    }).join('');

    bindFixtureClicks();
  }

  function bindFixtureClicks() {
    var grid = $('#fixtures-grid');
    if (!grid || grid._bound) return;
    grid._bound = true;

    grid.addEventListener('click', function (e) {
      var predictBtn = e.target.closest('[data-fixture-predict]');
      if (predictBtn) {
        e.preventDefault();
        e.stopPropagation();
        openMatchCentre(parseInt(predictBtn.getAttribute('data-fixture-predict'), 10), { scrollToPrediction: true });
        return;
      }
      var card = e.target.closest('[data-fixture-index]');
      if (!card) return;
      var index = parseInt(card.getAttribute('data-fixture-index'), 10);
      openMatchCentre(index);
    });
  }

  function getScoreDisplay(fixture) {
    if (fixture.status === 'upcoming') {
      return { html: 'vs', className: 'upcoming' };
    }
    if (fixture.homeScore !== null && fixture.awayScore !== null) {
      return { html: fixture.homeScore + ' – ' + fixture.awayScore, className: '' };
    }
    return { html: '–', className: 'upcoming' };
  }

  function openMatchCentre(index, options) {
    options = options || {};
    var fixture = liveFixtures[index];
    if (!fixture) return;
    openMatchCentreByFixture(fixture, options);
  }

  function closeMatchCentre() {
    var modal = $('#match-detail');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('match-detail-open');
    currentMatchCentreIndex = null;
  }

  function refreshOpenMatchCentre() {
    if (currentMatchCentreIndex == null) return;
    var fixture = knockoutFixtures[currentMatchCentreIndex];
    if (fixture) {
      openKnockoutFixture(fixture);
    }
    refreshPredictionOfTheDay();
  }

  function showPremiumToast(message, options) {
    var toast = $('#premium-toast');
    var msgEl = $('#premium-toast-message');
    var joinBtn = $('#premium-toast-join');
    var opts = options || {};
    var isPremium = opts.isPremium != null ? opts.isPremium : getPremiumState();
    var hideJoin = isPremium || opts.successOnly === true;

    if (joinBtn) {
      joinBtn.classList.toggle('hidden', hideJoin);
    }

    if (msgEl) {
      msgEl.textContent = message || (isPremium ? 'Premium unlocked' : getDefaultPremiumToastMessage());
    }

    toast.classList.remove('hidden');
    clearTimeout(premiumToastTimer);
    premiumToastTimer = setTimeout(function () {
      toast.classList.add('hidden');
    }, opts.successOnly ? 5000 : 8000);
  }

  function showPremiumSuccessToast(message) {
    showPremiumToast(message || 'Premium unlocked', { successOnly: true, isPremium: true });
  }

  function getDefaultPremiumToastMessage() {
    return (typeof MatchCentre !== 'undefined' && MatchCentre.PREMIUM_TOAST)
      ? MatchCentre.PREMIUM_TOAST
      : 'Upgrade to EdgeStats Premium to unlock full player form, club season stats and match insights.';
  }

  function updatePremiumCTAVisibility(isPremium) {
    var premium = typeof isPremium === 'boolean'
      ? isPremium
      : getPremiumState();

    document.body.classList.toggle('edgestats-premium', premium);
    document.body.classList.toggle('edgestats-free', !premium);

    var joinBtn = $('#premium-toast-join');
    if (joinBtn) joinBtn.classList.toggle('hidden', premium);
  }

  function showPremiumPreviewToast() {
    if (getPremiumState()) return;
    showPremiumToast(getDefaultPremiumToastMessage());
  }

  function hidePremiumToast() {
    $('#premium-toast').classList.add('hidden');
    clearTimeout(premiumToastTimer);
  }

  function goToStripeCheckout() {
    if (getPremiumState()) return;

    hidePremiumToast();
    closeMatchCentre();
    closePremiumModal();

    if (window.EdgeStatsAuth && typeof window.EdgeStatsAuth.startCheckout === 'function') {
      window.EdgeStatsAuth.startCheckout().catch(function (err) {
        showPremiumToast(err.message || 'Unable to start checkout.');
      });
      return;
    }

    if (typeof PremiumAccess !== 'undefined' && typeof PremiumAccess.startCheckoutFromCTA === 'function') {
      PremiumAccess.startCheckoutFromCTA();
      return;
    }

    window.location.href = 'https://buy.stripe.com/9B69AU60xb3E2WaaUC4ko00';
  }

  function scrollToPremium() {
    goToStripeCheckout();
  }

  function openPremiumModal() {
    goToStripeCheckout();
  }

  function closePremiumModal() {
    var modal = $('#premium-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('premium-modal-open');
  }

  function initPremiumModal() {
    var closeBtn = $('#premium-modal-close');
    var backdrop = $('#premium-modal-backdrop');

    if (closeBtn) closeBtn.addEventListener('click', closePremiumModal);
    if (backdrop) backdrop.addEventListener('click', closePremiumModal);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#premium-modal') && !$('#premium-modal').classList.contains('hidden')) {
        closePremiumModal();
      }
    });
  }

  window.goToStripeCheckout = goToStripeCheckout;
  window.showPremiumToast = showPremiumToast;
  window.showPremiumSuccessToast = showPremiumSuccessToast;
  window.updatePremiumCTAVisibility = updatePremiumCTAVisibility;
  window.refreshOpenMatchCentre = refreshOpenMatchCentre;

  window.openPremiumModal = openPremiumModal;
  window.closePremiumModal = closePremiumModal;

  function initMatchCentre() {
    $('#match-detail-close').addEventListener('click', closeMatchCentre);
    $('#match-detail-backdrop').addEventListener('click', closeMatchCentre);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#match-detail').classList.contains('hidden')) {
        closeMatchCentre();
      }
    });
  }

  function bindPremiumPreviewCards() {
    $$('.premium-preview-card[data-premium-preview]').forEach(function (card) {
      card.addEventListener('click', function () {
        var categoryId = card.getAttribute('data-premium-preview');
        if (!categoryId) return;

        if (typeof PremiumPreview !== 'undefined' && typeof PremiumPreview.openRankingModal === 'function') {
          PremiumPreview.openRankingModal(categoryId, getPremiumState());
        }
      });
    });
  }

  function getPremiumState() {
    return window.EdgeStatsAuth && typeof window.EdgeStatsAuth.isPremium === 'function'
      && window.EdgeStatsAuth.isPremium();
  }

  function initPremiumUI() {
    var joinBtn = $('#join-premium-btn');
    if (joinBtn) {
      joinBtn.addEventListener('click', function () {
        hidePremiumToast();
        closeMatchCentre();
        openPremiumModal();
        joinBtn.classList.add('btn-pulse');
        setTimeout(function () { joinBtn.classList.remove('btn-pulse'); }, 600);
      });
    }
    $('#premium-toast-join').addEventListener('click', goToStripeCheckout);
    $('#premium-toast-dismiss').addEventListener('click', hidePremiumToast);

    bindPremiumPreviewCards();

    if (typeof HomepageLaunch !== 'undefined' && HomepageLaunch.bindLaunchSection) {
      HomepageLaunch.bindLaunchSection();
    }
  }

  async function loadHomepageInsights() {
    var container = $('#homepage-insights');
    if (!container || typeof HomepageLaunch === 'undefined') return;

    if (typeof ApiFootball === 'undefined' || !ApiFootball.fetchTodaysBestInsights) {
      container.innerHTML = HomepageLaunch.renderInsights({ match: null, insights: {} });
      HomepageLaunch.bindLaunchSection();
      return;
    }

    try {
      var data = await ApiFootball.fetchTodaysBestInsights();
      HomepageLaunch.updateInsights(container, data);
      HomepageLaunch.bindLaunchSection();
    } catch (err) {
      container.innerHTML = (
        '<div class="homepage-insights-loading">' +
          '<p>Could not load insights. ' + (err.message || 'Please try again later.') + '</p>' +
        '</div>'
      );
    }
  }

  async function loadPremiumPreviewRankings() {
    var grid = $('#premium-preview-grid');
    var watchGrid = $('#players-to-watch-grid');
    if (!grid || typeof PremiumPreview === 'undefined') return;

    if (typeof PremiumAccess !== 'undefined' && typeof PremiumAccess.setLastRankingData === 'function') {
      PremiumAccess.setLastRankingData(null);
    }

    grid.innerHTML = PremiumPreview.renderGridSkeleton();
    grid.setAttribute('data-rankings-loading', 'true');
    grid.removeAttribute('data-rankings-version');
    grid.removeAttribute('data-rankings-built-at');

    if (watchGrid && typeof PlayersToWatch !== 'undefined') {
      watchGrid.innerHTML = PlayersToWatch.renderGridLoading();
    }

    if (typeof ApiFootball === 'undefined' || !ApiFootball.fetchPremiumPreviewRankings) {
      if (watchGrid && typeof PlayersToWatch !== 'undefined') {
        PlayersToWatch.updateAll(watchGrid, { categories: [] });
        PlayersToWatch.bindCards(watchGrid);
      }
      return;
    }

    try {
      var data = await ApiFootball.fetchPremiumPreviewRankings();
      var isPremium = getPremiumState();

      if (typeof PremiumAccess !== 'undefined' && typeof PremiumAccess.setLastRankingData === 'function') {
        PremiumAccess.setLastRankingData(data);
      }

      if (data && data.debug) {
        console.info('[EdgeStats:HomepageRankings:loaded]', {
          version: data.version,
          builtAt: data.builtAt,
          totalTeamsProcessed: data.debug.totalTeamsProcessed,
          totalPlayersWithVerifiedClubStats: data.debug.totalPlayersWithVerifiedClubStats,
          topGoalscorer: data.categories[0] && data.categories[0].players && data.categories[0].players[0]
            ? data.categories[0].players[0].name
            : null,
        });
      }

      PremiumPreview.renderGrid(grid, data, isPremium);
      PremiumPreview.updateAll(grid, data, isPremium);
      grid.removeAttribute('data-rankings-loading');
      if (data.version) grid.setAttribute('data-rankings-version', data.version);
      if (data.builtAt) grid.setAttribute('data-rankings-built-at', data.builtAt);
      bindPremiumPreviewCards();

      lastInsightsRankingData = data;
      applyFixtureTeamsToInsights();

      if (watchGrid && typeof PlayersToWatch !== 'undefined') {
        PlayersToWatch.updateAll(watchGrid, data, isPremium);
        PlayersToWatch.bindCards(watchGrid, isPremium);
      }
    } catch (err) {
      grid.removeAttribute('data-rankings-loading');
      lastInsightsRankingData = null;
      grid.innerHTML = (
        '<div class="premium-ranking-preview premium-ranking-preview--empty premium-ranking-preview--error">' +
          '<p>Could not load premium previews. ' + (err.message || 'Please try again later.') + '</p>' +
        '</div>'
      );

      if (watchGrid && typeof PlayersToWatch !== 'undefined') {
        PlayersToWatch.updateAll(watchGrid, { categories: [] });
        PlayersToWatch.bindCards(watchGrid);
      }
    }
  }

  // ── Top Scorers (live API) ──
  function showTopScorersState(state) {
    $('#top-scorers-loading').classList.toggle('hidden', state !== 'loading');
    $('#top-scorers-error').classList.toggle('hidden', state !== 'error');
    $('#top-scorers-empty').classList.toggle('hidden', state !== 'empty');
    $('#top-scorers').classList.toggle('hidden', state !== 'ready');
  }

  function renderTopScorers(scorers) {
    var rankClasses = ['gold', 'silver', 'bronze'];

    $('#top-scorers').innerHTML = scorers.map(function (s, i) {
      var rankClass = i < 3 ? rankClasses[i] : '';
      return (
        '<li class="leaderboard-item">' +
          '<span class="leaderboard-rank ' + rankClass + '">' + (i + 1) + '</span>' +
          '<span class="leaderboard-name">' + s.name + ' <small style="color:var(--gray-400)">' + s.team + '</small></span>' +
          '<span class="leaderboard-value">' + s.goals + '</span>' +
        '</li>'
      );
    }).join('');
  }

  async function loadTopScorers() {
    showTopScorersState('loading');

    try {
      var scorers = await ApiFootball.fetchTopScorers();

      if (!scorers.length) {
        showTopScorersState('empty');
        return;
      }

      renderTopScorers(scorers);
      showTopScorersState('ready');
    } catch (err) {
      $('#top-scorers-error-message').textContent = err.message || 'Could not load top scorers.';
      showTopScorersState('error');
    }
  }

  function initTopScorersRetry() {
    var retryBtn = $('#top-scorers-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', loadTopScorers);
    }
  }

  // ── Nav ──
  function initNav() {
    var toggle = $('.nav-toggle');
    var links = $('.nav-links');

    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });

    $$('.nav-links a').forEach(function (link) {
      link.addEventListener('click', function () {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ── Filter Tabs ──
  function initFilters() {
    var retryBtn = $('#knockout-fixtures-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', loadKnockoutFixtures);
    }
  }

  // ── Scroll Animations ──
  function initScrollAnimations() {
    if (!('IntersectionObserver' in window)) {
      animateBars();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('.progress-fill, .chart-bar-fill, .team-stat-bar-fill').forEach(function (bar) {
            var w = bar.getAttribute('data-width');
            if (w) bar.style.width = w;
          });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    $$('.dashboard-bar-section, .stats-panel').forEach(function (el) {
      observer.observe(el);
    });
  }

  // ── Init ──
  function init() {
    loadKnockoutFixtures();
    initNav();
    initFilters();
    initMatchCentre();
    initPremiumModal();
    initPremiumUI();
    if (typeof PremiumAccess !== 'undefined' && typeof PremiumAccess.init === 'function') {
      PremiumAccess.init();
    }
    if (window.EdgeStatsAuth && typeof window.EdgeStatsAuth.onChange === 'function') {
      window.EdgeStatsAuth.onChange(function (state) {
        updatePremiumCTAVisibility(state && state.isPremium);
        refreshPredictionOfTheDay();
      });
    }
    updatePremiumCTAVisibility(getPremiumState());
    if (typeof HomepageLaunch !== 'undefined' && HomepageLaunch.initCountdown) {
      HomepageLaunch.initCountdown();
    }
    initScrollAnimations();

    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        loadKnockoutFixtures();
      }
    });
  }

  window.loadPremiumPreviewRankings = loadPremiumPreviewRankings;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
