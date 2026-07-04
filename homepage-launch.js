/**
 * Homepage World Cup Launch Offer — insight cards with hidden identities.
 */
(function (global) {
  'use strict';

  var INSIGHT_CARDS = [
    {
      id: 'goalscorer',
      icon: '🔥',
      title: 'GOALSCORER ALERT',
      key: 'goalscorer',
    },
    {
      id: 'card-risk',
      icon: '⚠️',
      title: 'CARD RISK',
      key: 'cardRisk',
    },
    {
      id: 'setpiece',
      icon: '🎯',
      title: 'SET PIECE SPECIALIST',
      key: 'setpiece',
    },
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

  function renderLockedIdentity() {
    return (
      '<div class="homepage-insight-card__identity" aria-hidden="true">' +
        '<span class="homepage-insight-card__avatar"></span>' +
        '<span class="homepage-insight-card__name"></span>' +
        '<span class="homepage-insight-card__identity-lock">' + lockIconSvg() + '</span>' +
      '</div>'
    );
  }

  function renderInsightBullets(insight) {
    if (!insight || !insight.hasData || !insight.items || !insight.items.length) {
      return (
        '<ul class="homepage-insight-card__list homepage-insight-card__list--skeleton">' +
          '<li><span class="homepage-insight-card__bullet-placeholder"></span></li>' +
          '<li><span class="homepage-insight-card__bullet-placeholder"></span></li>' +
          '<li><span class="homepage-insight-card__bullet-placeholder"></span></li>' +
        '</ul>'
      );
    }

    return (
      '<ul class="homepage-insight-card__list">' +
        insight.items.map(function (item) {
          return '<li>' + escapeHtml(item.text) + '</li>';
        }).join('') +
      '</ul>'
    );
  }

  function renderInsightIntro(matchLabel) {
    if (matchLabel) {
      return 'A player in <strong>' + escapeHtml(matchLabel) + '</strong> has:';
    }
    return 'A player in an upcoming match has:';
  }

  function renderInsightCard(card, insight, matchLabel) {
    return (
      '<button type="button" class="homepage-insight-card" data-premium-upgrade data-insight-card="' + escapeHtml(card.id) + '">' +
        '<div class="homepage-insight-card__head">' +
          '<span class="homepage-insight-card__icon" aria-hidden="true">' + card.icon + '</span>' +
          '<h4 class="homepage-insight-card__title">' + escapeHtml(card.title) + '</h4>' +
          '<span class="premium-lock-badge">Premium</span>' +
        '</div>' +
        renderLockedIdentity() +
        '<p class="homepage-insight-card__intro">' + renderInsightIntro(matchLabel) + '</p>' +
        renderInsightBullets(insight) +
        '<span class="homepage-insight-card__cta">Unlock to reveal ' + lockIconSvg() + '</span>' +
      '</button>'
    );
  }

  function renderInsightsLoading() {
    return (
      '<div class="homepage-insights-loading">' +
        '<div class="fixtures-spinner" aria-hidden="true"></div>' +
        '<p>Loading today\'s insights…</p>' +
      '</div>'
    );
  }

  function renderInsights(data) {
    var insights = (data && data.insights) || {};
    var matchLabel = data && data.match;

    return INSIGHT_CARDS.map(function (card) {
      return renderInsightCard(card, insights[card.key], matchLabel);
    }).join('');
  }

  function updateInsights(container, data) {
    if (!container) return;
    container.innerHTML = renderInsights(data);
    bindUpgradeTriggers(container);
  }

  function bindUpgradeTriggers(container) {
    if (!container || (global.EdgeStatsAuth && global.EdgeStatsAuth.isPremium && global.EdgeStatsAuth.isPremium())) return;

    container.querySelectorAll('[data-premium-upgrade]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (global.EdgeStatsAuth && global.EdgeStatsAuth.isPremium && global.EdgeStatsAuth.isPremium()) return;
        if (typeof global.goToStripeCheckout === 'function') {
          global.goToStripeCheckout();
        } else if (typeof global.openPremiumModal === 'function') {
          global.openPremiumModal();
        }
      });
    });
  }

  function bindLaunchSection() {
    document.querySelectorAll('[data-premium-upgrade]').forEach(function (el) {
      if (el.closest('#homepage-insights')) return;
      if (el._premiumUpgradeBound) return;
      el._premiumUpgradeBound = true;
      el.addEventListener('click', function () {
        if (global.EdgeStatsAuth && global.EdgeStatsAuth.isPremium && global.EdgeStatsAuth.isPremium()) return;
        if (typeof global.goToStripeCheckout === 'function') {
          global.goToStripeCheckout();
        } else if (typeof global.openPremiumModal === 'function') {
          global.openPremiumModal();
        }
      });
    });
  }

  function initCountdown() {
    document.body.classList.add('launch-offer--underway');
  }

  global.HomepageLaunch = {
    renderInsightsLoading: renderInsightsLoading,
    renderInsights: renderInsights,
    updateInsights: updateInsights,
    bindLaunchSection: bindLaunchSection,
    initCountdown: initCountdown,
  };
})(window);
