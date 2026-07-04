/**
 * EdgeStats Model Tracker — homepage accuracy section.
 */
(function (global) {
  'use strict';

  var API_URL = '/api/model-tracker';

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
    if (typeof value === 'number' && value <= 1) {
      return Math.round(value * 1000) / 10 + '%';
    }
    return String(value);
  }

  function renderLoading() {
    return (
      '<div class="model-tracker-state">' +
        '<div class="fixtures-spinner" aria-hidden="true"></div>' +
        '<p>Loading model tracker…</p>' +
      '</div>'
    );
  }

  function renderMetric(label, value) {
    return (
      '<div class="model-tracker-metric">' +
        '<span class="model-tracker-metric__value">' + escapeHtml(fmtPct(value)) + '</span>' +
        '<span class="model-tracker-metric__label">' + escapeHtml(label) + '</span>' +
      '</div>'
    );
  }

  function render(data) {
    if (!data || !data.ok) {
      return (
        '<div class="model-tracker-state model-tracker-state--error">' +
          '<p>Model tracker unavailable.</p>' +
        '</div>'
      );
    }

    if (!data.hasTrackingData) {
      return (
        '<div class="model-tracker-card model-tracker-card--pending">' +
          '<p class="model-tracker-message">' + escapeHtml(data.message || 'Model tracking begins from the knockout stage.') + '</p>' +
          '<div class="model-tracker-meta">' +
            '<span>Model version: <strong>' + escapeHtml(data.displayVersion || 'V2') + '</strong></span>' +
            (data.completedGroupMatches != null
              ? '<span>Training data: ' + escapeHtml(String(data.completedGroupMatches)) + ' group-stage matches</span>'
              : '') +
          '</div>' +
        '</div>'
      );
    }

    var m = data.metrics || {};
    return (
      '<div class="model-tracker-card">' +
        '<div class="model-tracker-grid">' +
          renderMetric('Winner prediction accuracy', m.winnerAccuracy) +
          renderMetric('Scoreline within 1 goal', m.scorelineWithinOneGoal) +
          renderMetric('Corner prediction accuracy', m.cornerAccuracy) +
          renderMetric('GK save prediction accuracy', m.goalkeeperSaveAccuracy) +
        '</div>' +
        '<div class="model-tracker-meta">' +
          '<span>Model version: <strong>' + escapeHtml(data.displayVersion || 'V2') + '</strong></span>' +
          (m.sampleSize != null ? '<span>Sample: ' + escapeHtml(String(m.sampleSize)) + ' knockout matches</span>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function init() {
    var mount = document.getElementById('model-tracker-mount');
    if (!mount) return;

    mount.innerHTML = renderLoading();

    fetch(API_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Model tracker unavailable (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        mount.innerHTML = render(data);
      })
      .catch(function () {
        mount.innerHTML = (
          '<div class="model-tracker-card model-tracker-card--pending">' +
            '<p class="model-tracker-message">Model tracking begins from the knockout stage.</p>' +
            '<div class="model-tracker-meta"><span>Model version: <strong>V2</strong></span></div>' +
          '</div>'
        );
      });
  }

  global.ModelTracker = { init: init, render: render };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(typeof window !== 'undefined' ? window : globalThis));
