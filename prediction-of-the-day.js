/**
 * Prediction of the Day — next upcoming knockout match on homepage.
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtPct(value) {
    if (value == null) return '—';
    return Math.round(value * 1000) / 10 + '%';
  }

  function isPremiumUser() {
    if (global.EdgeStatsAuth && typeof global.EdgeStatsAuth.isPremium === 'function') {
      return global.EdgeStatsAuth.isPremium();
    }
    return document.body.classList.contains('edgestats-premium');
  }

  async function getAuthToken() {
    if (!global.EdgeStatsAuth || typeof global.EdgeStatsAuth.getAccessToken !== 'function') return null;
    return global.EdgeStatsAuth.getAccessToken();
  }

  function formatKickoff(iso) {
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

  function renderLoading() {
    return (
      '<div class="potd-state">' +
        '<div class="fixtures-spinner" aria-hidden="true"></div>' +
        '<p>Loading prediction of the day…</p>' +
      '</div>'
    );
  }

  function renderEmpty(message) {
    return (
      '<div class="potd-state">' +
        '<p>' + escapeHtml(message || 'No upcoming knockout fixtures found.') + '</p>' +
      '</div>'
    );
  }

  function renderTeams(fixture) {
    return (
      '<div class="potd-teams">' +
        '<div class="potd-team">' +
          '<span class="potd-team-name">' + escapeHtml(fixture.home) + '</span>' +
        '</div>' +
        '<span class="potd-vs">vs</span>' +
        '<div class="potd-team">' +
          '<span class="potd-team-name">' + escapeHtml(fixture.away) + '</span>' +
        '</div>' +
      '</div>'
    );
  }

  function renderLocked(fixture) {
    return (
      '<div class="potd-card potd-card--locked">' +
        '<div class="potd-card__meta">' +
          '<span class="potd-round">' + escapeHtml(fixture.group || fixture.round || 'Knockout') + '</span>' +
          '<span class="potd-kickoff">' + escapeHtml(formatKickoff(fixture.dateRaw || fixture.kickoffUTC)) + '</span>' +
        '</div>' +
        renderTeams(fixture) +
        '<div class="potd-locked-panel">' +
          '<span class="potd-locked-icon" aria-hidden="true">🔒</span>' +
          '<p class="potd-locked-label">Prediction locked</p>' +
          '<p class="potd-locked-desc">Unlock Premium to see projected winner, scoreline and probabilities.</p>' +
          '<button type="button" class="btn btn-primary" data-potd-unlock>Unlock Predictions</button>' +
        '</div>' +
        '<div class="potd-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" data-potd-view-match>View Match</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderUnlocked(fixture, data) {
    var p = data.prediction;
    var pred = p.prediction;

    return (
      '<div class="potd-card potd-card--unlocked">' +
        '<div class="potd-card__meta">' +
          '<span class="potd-round">' + escapeHtml(fixture.group || fixture.round || 'Knockout') + '</span>' +
          '<span class="potd-kickoff">' + escapeHtml(formatKickoff(fixture.dateRaw || fixture.kickoffUTC)) + '</span>' +
        '</div>' +
        renderTeams(fixture) +
        '<div class="potd-result">' +
          '<p class="potd-result__label">Projected result</p>' +
          '<p class="potd-result__score">' + escapeHtml(pred.score) + '</p>' +
          '<p class="potd-result__winner">Winner: ' + escapeHtml(String(pred.winner)) + '</p>' +
          '<p class="potd-result__confidence">Confidence ' + escapeHtml(String(pred.confidence)) + '/10</p>' +
        '</div>' +
        '<div class="potd-probs">' +
          '<div class="potd-prob"><span>' + escapeHtml(p.homeTeam) + ' win</span><span>' + fmtPct(pred.winProbability) + '</span></div>' +
          '<div class="potd-prob"><span>Draw</span><span>' + fmtPct(pred.drawProbability) + '</span></div>' +
          '<div class="potd-prob"><span>' + escapeHtml(p.awayTeam) + ' win</span><span>' + fmtPct(pred.lossProbability) + '</span></div>' +
        '</div>' +
        '<div class="potd-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" data-potd-view-match>View Match</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-potd-breakdown>View Full Breakdown</button>' +
        '</div>' +
      '</div>'
    );
  }

  async function fetchPrediction(home, away) {
    var token = await getAuthToken();
    var headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;

    var res = await fetch(
      '/api/predict?home=' + encodeURIComponent(home) + '&away=' + encodeURIComponent(away),
      { headers: headers },
    );
    var data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Prediction request failed');
    }
    return data;
  }

  function bindActions(mount, fixture) {
    var unlock = mount.querySelector('[data-potd-unlock]');
    if (unlock) {
      unlock.addEventListener('click', function () {
        if (typeof global.goToStripeCheckout === 'function') {
          global.goToStripeCheckout();
        } else if (typeof global.openPremiumModal === 'function') {
          global.openPremiumModal();
        }
      });
    }

    mount.querySelectorAll('[data-potd-view-match]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (typeof global.openKnockoutFixture === 'function') {
          global.openKnockoutFixture(fixture);
        }
      });
    });

    var breakdown = mount.querySelector('[data-potd-breakdown]');
    if (breakdown) {
      breakdown.addEventListener('click', function () {
        if (typeof global.openKnockoutFixture === 'function') {
          global.openKnockoutFixture(fixture, { scrollToPrediction: true });
        }
      });
    }
  }

  async function render(mount, fixture) {
    if (!mount) return;
    if (!fixture) {
      mount.innerHTML = renderEmpty();
      return;
    }

    if (!isPremiumUser()) {
      mount.innerHTML = renderLocked(fixture);
      bindActions(mount, fixture);
      return;
    }

    mount.innerHTML = renderLoading();

    try {
      var data = await fetchPrediction(fixture.home, fixture.away);
      if (data.locked) {
        mount.innerHTML = renderLocked(fixture);
      } else {
        mount.innerHTML = renderUnlocked(fixture, data);
      }
      bindActions(mount, fixture);
    } catch (err) {
      mount.innerHTML = (
        '<div class="potd-state potd-state--error">' +
          '<p>Could not load prediction: ' + escapeHtml(err.message) + '</p>' +
          '<button type="button" class="btn btn-outline btn-sm" data-potd-retry>Try again</button>' +
        '</div>'
      );
      var retry = mount.querySelector('[data-potd-retry]');
      if (retry) retry.addEventListener('click', function () { render(mount, fixture); });
      bindActions(mount, fixture);
    }
  }

  global.PredictionOfTheDay = {
    render: render,
    refresh: function (mount, fixture) {
      return render(mount, fixture);
    },
  };
}(typeof window !== 'undefined' ? window : globalThis));
