/**
 * Coordinates premium unlock UI when auth state changes.
 */
(function (global) {
  'use strict';

  var lastRankingData = null;

  function isPremium() {
    return global.EdgeStatsAuth && typeof global.EdgeStatsAuth.isPremium === 'function'
      && global.EdgeStatsAuth.isPremium();
  }

  function setLastRankingData(data) {
    lastRankingData = data || null;
  }

  function clearLastRankingData() {
    lastRankingData = null;
  }

  function getLastRankingData() {
    return lastRankingData;
  }

  function refreshRankings() {
    var grid = document.getElementById('premium-preview-grid');
    var watchGrid = document.getElementById('players-to-watch-grid');
    var premium = isPremium();

    if (typeof global.updatePremiumCTAVisibility === 'function') {
      global.updatePremiumCTAVisibility(premium);
    }

    if (grid && global.PremiumPreview && lastRankingData) {
      global.PremiumPreview.updateAll(grid, lastRankingData, premium);
    }

    if (watchGrid && global.PlayersToWatch && lastRankingData) {
      global.PlayersToWatch.updateAll(watchGrid, lastRankingData, premium);
      global.PlayersToWatch.bindCards(watchGrid, premium);
    }

    updatePremiumCards(premium);
    refreshMatchCentreIfOpen();

    if (typeof global.PredictionOfTheDay !== 'undefined' && typeof global.refreshPredictionOfTheDay === 'function') {
      global.refreshPredictionOfTheDay();
    }
  }

  function updatePremiumCards(isPremiumUser) {
    document.querySelectorAll('.premium-preview-card').forEach(function (card) {
      card.classList.toggle('premium-preview-card--unlocked', isPremiumUser);
      var lock = card.querySelector('.premium-preview-lock');
      if (lock) lock.classList.toggle('hidden', isPremiumUser);
    });

    document.querySelectorAll('.premium-ranking-unlock-hint').forEach(function (hint) {
      hint.classList.toggle('hidden', isPremiumUser);
    });
  }

  function refreshMatchCentreIfOpen() {
    var detail = document.getElementById('match-detail');
    if (!detail || detail.classList.contains('hidden')) return;
    if (typeof global.refreshOpenMatchCentre === 'function') {
      global.refreshOpenMatchCentre();
    }
  }

  function bindStripeLinks() {
    document.querySelectorAll('a[href*="buy.stripe.com"]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        startCheckoutFromCTA();
      });
    });
  }

  function startCheckoutFromCTA() {
    if (isPremium()) return;

    if (!global.EdgeStatsAuth || typeof global.EdgeStatsAuth.startCheckout !== 'function') {
      window.location.href = 'https://buy.stripe.com/9B69AU60xb3E2WaaUC4ko00';
      return;
    }

    global.EdgeStatsAuth.startCheckout().catch(function (err) {
      if (typeof global.showPremiumToast === 'function') {
        global.showPremiumToast(err.message || 'Unable to start checkout.');
      } else {
        alert(err.message || 'Unable to start checkout.');
      }
    });
  }

  function init() {
    bindStripeLinks();

    if (global.EdgeStatsAuth && typeof global.EdgeStatsAuth.onChange === 'function') {
      global.EdgeStatsAuth.onChange(function () {
        refreshRankings();
      });
    }
  }

  global.PremiumAccess = {
    init: init,
    isPremium: isPremium,
    setLastRankingData: setLastRankingData,
    getLastRankingData: getLastRankingData,
    clearLastRankingData: clearLastRankingData,
    refreshRankings: refreshRankings,
    startCheckoutFromCTA: startCheckoutFromCTA,
  };
})(window);
