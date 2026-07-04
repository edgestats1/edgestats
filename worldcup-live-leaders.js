/**
 * World Cup Live Leaders — homepage section (knockout stage layout).
 */
(function (global) {
  'use strict';

  var API_URL = '/api/worldcup-leaderboards?limit=10';
  var RANK_CLASSES = ['gold', 'silver', 'bronze', ''];

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatValue(value) {
    if (value == null || value === '') return '—';
    if (typeof value === 'number' && value % 1 !== 0) {
      return String(Math.round(value * 10) / 10);
    }
    return String(value);
  }

  function renderLoading() {
    return (
      '<div class="wc-leaders-state">' +
        '<div class="fixtures-spinner" aria-hidden="true"></div>' +
        '<p>Loading World Cup live leaders…</p>' +
      '</div>'
    );
  }

  function renderError(message) {
    return (
      '<div class="wc-leaders-state wc-leaders-state--error">' +
        '<p class="wc-leaders-state__title">Couldn’t load live leaders</p>' +
        '<p class="wc-leaders-state__desc">' + escapeHtml(message || 'Please try again later.') + '</p>' +
      '</div>'
    );
  }

  function renderEmpty(title) {
    return (
      '<div class="wc-leaders-empty">' +
        '<p>No ' + escapeHtml(title) + ' data yet from completed matches.</p>' +
      '</div>'
    );
  }

  function renderTableHead(cells) {
    return (
      '<div class="wc-leaders-table__head">' +
        '<span class="wc-leaders-table__rank wc-leaders-table__rank--head">' + escapeHtml(cells[0]) + '</span>' +
        cells.slice(1).map(function (cell, index) {
          var cls = index === 0 ? ' wc-leaders-table__col--primary' : '';
          return '<span class="wc-leaders-table__col' + cls + '">' + escapeHtml(cell) + '</span>';
        }).join('') +
      '</div>'
    );
  }

  function renderRow(cells, rank) {
    var rankClass = RANK_CLASSES[(rank || 1) - 1] || '';
    return (
      '<div class="wc-leaders-table__row">' +
        '<span class="wc-leaders-table__rank ' + rankClass + '">' + escapeHtml(rank) + '</span>' +
        cells.slice(1).map(function (cell, index) {
          var cls = index === 0 ? ' wc-leaders-table__col--primary' : '';
          return '<span class="wc-leaders-table__col' + cls + '">' + escapeHtml(formatValue(cell)) + '</span>';
        }).join('') +
      '</div>'
    );
  }

  function renderGoldenBoot(rows) {
    if (!rows.length) return renderEmpty('goal scorer');
    var html = renderTableHead(['#', 'Player', 'Country', 'G', 'A']);
    rows.forEach(function (row) {
      html += renderRow([row.rank, row.playerName, row.team, row.goals, row.assists], row.rank);
    });
    return html;
  }

  function renderTopAssists(rows) {
    if (!rows.length) return renderEmpty('assist');
    var html = renderTableHead(['#', 'Player', 'Country', 'A', 'G']);
    rows.forEach(function (row) {
      html += renderRow([row.rank, row.playerName, row.team, row.assists, row.goals], row.rank);
    });
    return html;
  }

  function renderCornersByCountry(rows) {
    if (!rows.length) return renderEmpty('corners');
    var html = renderTableHead(['#', 'Country', 'Corners', 'MP', 'Avg']);
    rows.forEach(function (row) {
      html += renderRow([row.rank, row.team, row.totalCorners, row.matchesPlayed, row.averageCornersPerMatch], row.rank);
    });
    return html;
  }

  function renderTeamWinPct(rows) {
    if (!rows.length) return renderEmpty('win percentage');
    var html = renderTableHead(['#', 'Country', 'Win %', 'MP', 'W-D-L']);
    rows.forEach(function (row) {
      html += renderRow([row.rank, row.team, row.winPercentage != null ? row.winPercentage + '%' : null, row.matchesPlayed, row.record], row.rank);
    });
    return html;
  }

  function renderCupWinner(prediction) {
    if (!prediction || !prediction.team) {
      return (
        '<div class="wc-leaders-empty">' +
          '<p>Cup winner prediction unavailable — power rankings export not loaded.</p>' +
        '</div>'
      );
    }
    return (
      '<div class="wc-cup-winner">' +
        '<p class="wc-cup-winner__team">' + escapeHtml(prediction.team) + '</p>' +
        '<div class="wc-cup-winner__stats">' +
          (prediction.powerRating != null
            ? '<span class="wc-cup-winner__stat">Power ' + escapeHtml(prediction.powerRating) + '</span>'
            : '') +
          (prediction.rank != null
            ? '<span class="wc-cup-winner__stat">Rank #' + escapeHtml(prediction.rank) + '</span>'
            : '') +
        '</div>' +
        '<p class="wc-cup-winner__reason">' + escapeHtml(prediction.reason || '') + '</p>' +
      '</div>'
    );
  }

  function renderCard(title, subtitle, bodyHtml, wide) {
    return (
      '<article class="wc-leaders-card' + (wide ? ' wc-leaders-card--wide' : '') + '">' +
        '<header class="wc-leaders-card__head">' +
          '<h3 class="wc-leaders-card__title">' + escapeHtml(title) + '</h3>' +
          (subtitle ? '<p class="wc-leaders-card__sub">' + escapeHtml(subtitle) + '</p>' : '') +
        '</header>' +
        '<div class="wc-leaders-table">' + bodyHtml + '</div>' +
      '</article>'
    );
  }

  function renderLeaderboards(data) {
    return (
      '<div class="wc-leaders-grid">' +
        renderCard('WC Top Goal Scorers', 'Tournament goals only', renderGoldenBoot(data.goldenBoot || [])) +
        renderCard('WC Top Assists', 'Tournament assists only', renderTopAssists(data.topAssists || [])) +
        renderCard('WC Team Corners', 'Total corners won', renderCornersByCountry(data.cornersByCountry || [])) +
        renderCard('WC Team Win %', 'Tournament record', renderTeamWinPct(data.teamWinPercentage || [])) +
        renderCard('EdgeStats World Cup Favourite', 'Current #1 from power rankings', renderCupWinner(data.cupWinnerPrediction), true) +
      '</div>'
    );
  }

  function updateMeta(root, data) {
    var updated = root.querySelector('#wc-leaders-updated');
    var matches = root.querySelector('#wc-leaders-matches');
    if (updated) {
      updated.textContent = data.exportedAtFormatted
        ? 'Last updated: ' + data.exportedAtFormatted
        : 'Last updated: —';
    }
    if (matches && data.meta && data.meta.completedMatchesProcessed != null) {
      matches.textContent = data.meta.completedMatchesProcessed + ' completed tournament matches in dataset';
    }
  }

  function init() {
    var root = document.getElementById('world-cup-live-leaders');
    var mount = document.getElementById('wc-leaders-mount');
    if (!root || !mount) return;

    mount.innerHTML = renderLoading();

    fetch(API_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Leaderboards unavailable (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.message) || 'Invalid leaderboard response');
        mount.innerHTML = renderLeaderboards(data);
        updateMeta(root, data);
      })
      .catch(function (err) {
        mount.innerHTML = renderError(err.message);
      });
  }

  global.WorldCupLiveLeaders = { init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(typeof window !== 'undefined' ? window : globalThis));
