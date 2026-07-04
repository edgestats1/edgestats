/**
 * Prediction Generator — premium-gated match predictions on the public site.
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

  function fmtNum(value) {
    if (value == null) return '—';
    return String(value);
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

  function renderLocked() {
    return (
      '<div class="prediction-gen prediction-gen--locked">' +
        '<div class="prediction-gen__lock-icon" aria-hidden="true">🔒</div>' +
        '<h3 class="prediction-gen__title">Unlock the EdgeStats Prediction Generator</h3>' +
        '<p class="prediction-gen__desc">Generate match predictions powered by the EdgeStats model — winner, scoreline, xG, shots, corners, cards and more.</p>' +
        '<div class="prediction-gen__teaser">' +
          '<div class="prediction-gen__teaser-row"><span>Predicted winner</span><span class="prediction-gen__hidden">Hidden</span></div>' +
          '<div class="prediction-gen__teaser-row"><span>Projected score</span><span class="prediction-gen__hidden">Hidden</span></div>' +
          '<div class="prediction-gen__teaser-row"><span>Confidence</span><span class="prediction-gen__hidden">Hidden</span></div>' +
        '</div>' +
        '<button type="button" class="btn btn-primary" data-prediction-unlock>Unlock Predictions</button>' +
      '</div>'
    );
  }

  function renderLoading() {
    return (
      '<div class="prediction-gen prediction-gen--loading">' +
        '<div class="fixtures-spinner" aria-hidden="true"></div>' +
        '<p>Generating match prediction…</p>' +
      '</div>'
    );
  }

  function renderError(message) {
    return (
      '<div class="prediction-gen prediction-gen--error">' +
        '<p class="prediction-gen__error">' + escapeHtml(message) + '</p>' +
        '<button type="button" class="btn btn-outline btn-sm" data-prediction-retry>Try again</button>' +
      '</div>'
    );
  }

  function renderScorelineModel(sl, diag) {
    if (!sl) return '';
    return (
      '<details class="prediction-gen__scoreline-details">' +
        '<summary>Scoreline model</summary>' +
        '<div class="prediction-gen__scoreline-body">' +
          '<p><strong>Raw Poisson most likely:</strong> ' + escapeHtml(sl.rawPoissonMostLikely || '—') + '</p>' +
          '<p><strong>Representative scoreline:</strong> ' + escapeHtml(sl.representativeScoreline || sl.selectedScoreline || '—') + '</p>' +
          '<p><strong>Selection reason:</strong> ' + escapeHtml(sl.selectionReason || diag?.selectionReason || '—') + '</p>' +
        '</div>' +
      '</details>'
    );
  }

  function renderFull(data) {
    var p = data.prediction;
    var pred = p.prediction;
    var stats = p.expectedStats;
    var sl = p.scoreline;

    var probRows = [
      { label: p.homeTeam + ' win', value: pred.winProbability },
      { label: 'Draw', value: pred.drawProbability },
      { label: p.awayTeam + ' win', value: pred.lossProbability },
    ];

    var homeShots = stats.shots[p.homeTeam] || {};
    var awayShots = stats.shots[p.awayTeam] || {};

    return (
      '<div class="prediction-gen prediction-gen--unlocked">' +
        '<div class="prediction-gen__hero">' +
          '<p class="prediction-gen__label">Projected result</p>' +
          '<p class="prediction-gen__score">' + escapeHtml(pred.score) + '</p>' +
          '<p class="prediction-gen__winner">Winner: ' + escapeHtml(String(pred.winner)) + '</p>' +
          '<p class="prediction-gen__confidence">Confidence ' + fmtNum(pred.confidence) + '/10</p>' +
        '</div>' +
        '<div class="prediction-gen__probs">' +
          probRows.map(function (row) {
            return (
              '<div class="prediction-gen__prob-row">' +
                '<span>' + escapeHtml(row.label) + '</span>' +
                '<span>' + fmtPct(row.value) + '</span>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
        '<div class="prediction-gen__stats-grid">' +
          '<div class="prediction-gen__stat-block"><h4>Expected goals</h4><p>' + fmtNum(stats.expectedGoals.home) + ' – ' + fmtNum(stats.expectedGoals.away) + '</p></div>' +
          '<div class="prediction-gen__stat-block"><h4>Shots (SoT)</h4><p>' + p.homeTeam + ': ' + fmtNum(homeShots.total) + ' (' + fmtNum(homeShots.onTarget) + ')<br>' + p.awayTeam + ': ' + fmtNum(awayShots.total) + ' (' + fmtNum(awayShots.onTarget) + ')</p></div>' +
          '<div class="prediction-gen__stat-block"><h4>Corners</h4><p>' + p.homeTeam + ': ' + fmtNum(stats.corners[p.homeTeam]) + '<br>' + p.awayTeam + ': ' + fmtNum(stats.corners[p.awayTeam]) + '</p></div>' +
          '<div class="prediction-gen__stat-block"><h4>Cards</h4><p>Total: ' + fmtNum(stats.cards.total) + '</p></div>' +
          '<div class="prediction-gen__stat-block"><h4>GK saves</h4><p>' + Object.entries(stats.saves || {}).map(function (e) { return escapeHtml(e[0]) + ': ' + fmtNum(e[1]); }).join('<br>') + '</p></div>' +
        '</div>' +
        (p.keyPlayerThreats ? (
          '<div class="prediction-gen__threats">' +
            '<h4>Key player threats</h4>' +
            '<div class="prediction-gen__threats-cols">' +
              '<div><strong>' + escapeHtml(p.homeTeam) + '</strong><ul>' +
                (p.keyPlayerThreats.home || []).slice(0, 3).map(function (t) {
                  return '<li>' + escapeHtml(t.name) + ' (' + fmtNum(t.worldCupGoals) + ' G, ' + fmtNum(t.worldCupAssists) + ' A)</li>';
                }).join('') +
              '</ul></div>' +
              '<div><strong>' + escapeHtml(p.awayTeam) + '</strong><ul>' +
                (p.keyPlayerThreats.away || []).slice(0, 3).map(function (t) {
                  return '<li>' + escapeHtml(t.name) + ' (' + fmtNum(t.worldCupGoals) + ' G, ' + fmtNum(t.worldCupAssists) + ' A)</li>';
                }).join('') +
              '</ul></div>' +
            '</div>' +
          '</div>'
        ) : '') +
        (p.breakdown ? '<p class="prediction-gen__breakdown">' + escapeHtml(p.breakdown) + '</p>' : '') +
        renderScorelineModel(sl, p.scorelineDiagnostics) +
        (p.statConsistencyScore != null
          ? '<p class="prediction-gen__consistency">Stat consistency score: ' + fmtNum(p.statConsistencyScore) + '/100</p>'
          : '') +
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

  async function loadInto(container, home, away, callbacks) {
    if (!container) return;

    if (!isPremiumUser()) {
      container.innerHTML = renderLocked();
      var unlockBtn = container.querySelector('[data-prediction-unlock]');
      if (unlockBtn && callbacks && callbacks.onUnlock) {
        unlockBtn.addEventListener('click', callbacks.onUnlock);
      }
      return;
    }

    container.innerHTML = renderLoading();

    try {
      var data = await fetchPrediction(home, away);
      if (data.locked) {
        container.innerHTML = renderLocked();
        var btn = container.querySelector('[data-prediction-unlock]');
        if (btn && callbacks && callbacks.onUnlock) btn.addEventListener('click', callbacks.onUnlock);
        return;
      }
      container.innerHTML = renderFull(data);
    } catch (err) {
      container.innerHTML = renderError(err.message);
      var retry = container.querySelector('[data-prediction-retry]');
      if (retry) {
        retry.addEventListener('click', function () {
          loadInto(container, home, away, callbacks);
        });
      }
    }
  }

  function renderShell() {
    return (
      '<section class="match-centre-section prediction-gen-section" id="match-centre-prediction" aria-label="Prediction Generator">' +
        '<div class="match-centre-section__head">' +
          '<h3>Prediction Generator</h3>' +
          '<span class="premium-lock-badge">Premium</span>' +
        '</div>' +
        '<p class="match-centre-section__desc">EdgeStats model projection for this fixture.</p>' +
        '<div id="match-centre-prediction-body"></div>' +
      '</section>'
    );
  }

  global.PredictionGenerator = {
    renderShell: renderShell,
    loadInto: loadInto,
    isPremiumUser: isPremiumUser,
    refresh: function (container, home, away, callbacks) {
      return loadInto(container, home, away, callbacks);
    },
  };
}(typeof window !== 'undefined' ? window : globalThis));
