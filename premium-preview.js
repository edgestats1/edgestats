/**
 * Premium preview rankings — visible stats, locked player identities.
 */
(function (global) {
  'use strict';

  var RANK_CLASSES = ['gold', 'silver', 'bronze', ''];
  var SKELETON_ROW_COUNT = 3;

  var UNIT_LABELS = {
    goals: 'goals',
    assists: 'assists',
    fouls: 'fouls won',
    cards: 'cards',
    corners: 'corners',
    'risk points': 'risk points',
    chances: 'chances',
  };

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

  function getUnitLabel(unit) {
    return UNIT_LABELS[unit] || unit || '';
  }

  function formatStatValue(value) {
    if (value == null || value === '') return '—';
    if (typeof value === 'number' && value % 1 !== 0) {
      return String(Math.round(value * 10) / 10);
    }
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

  function renderPlayerMeta(player) {
    var country = player && player.team ? escapeHtml(player.team) : '';
    var club = player && player.club ? escapeHtml(player.club) : '';
    if (country && club) return country + ' · ' + club;
    return country || club || '';
  }

  function renderUnlockedIdentity(player) {
    var photo = player && player.photo
      ? '<img class="premium-ranking-avatar" src="' + escapeHtml(player.photo) + '" alt="" loading="lazy">'
      : '<span class="premium-ranking-avatar premium-ranking-avatar--placeholder"></span>';

    return (
      '<div class="premium-ranking-identity-wrap">' +
        '<div class="premium-ranking-identity">' +
          photo +
          '<div class="premium-ranking-info">' +
            '<span class="premium-ranking-name">' + escapeHtml(player && player.name ? player.name : 'Unknown') + '</span>' +
            '<span class="premium-ranking-team">' + renderPlayerMeta(player) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderVisibleStat(value, unit) {
    var unitLabel = getUnitLabel(unit);

    return (
      '<span class="premium-ranking-stat">' +
        '<span class="premium-ranking-stat__value">' + escapeHtml(formatStatValue(value)) + '</span>' +
        (unitLabel ? '<span class="premium-ranking-stat__unit">' + escapeHtml(unitLabel) + '</span>' : '') +
      '</span>'
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

  function renderRankingRow(player, index, unit, isPremium, lockStats) {
    var rankClass = RANK_CLASSES[index] || '';

    return (
      '<div class="premium-ranking-row">' +
        '<span class="premium-ranking-rank ' + rankClass + '">' + (index + 1) + '</span>' +
        (isPremium ? renderUnlockedIdentity(player) : renderLockedIdentity()) +
        (lockStats ? renderLockedStatPlaceholder() : renderVisibleStat(player.value, unit)) +
      '</div>'
    );
  }

  function renderSkeletonRow(index) {
    var rankClass = RANK_CLASSES[index] || '';

    return (
      '<div class="premium-ranking-row premium-ranking-row--skeleton">' +
        '<span class="premium-ranking-rank ' + rankClass + '">' + (index + 1) + '</span>' +
        renderLockedIdentity() +
        renderLockedStatPlaceholder() +
      '</div>'
    );
  }

  function renderUnlockHint() {
    return (
      '<div class="premium-ranking-unlock-hint">' +
        lockIconSvg() +
        '<span>Unlock player identities with Premium</span>' +
      '</div>'
    );
  }

  function renderRankingLoading() {
    return (
      '<div class="premium-ranking-preview premium-ranking-preview--loading">' +
        '<div class="fixtures-spinner" aria-hidden="true"></div>' +
        '<p>Loading rankings…</p>' +
      '</div>'
    );
  }

  function renderLockedSkeletonRows() {
    var rows = [];
    for (var i = 0; i < SKELETON_ROW_COUNT; i++) {
      rows.push(renderSkeletonRow(i));
    }
    return rows.join('');
  }

  function renderRankingCategory(category, isPremium) {
    var players = category && category.players;
    var unit = category && category.unit;

    if (!players || !players.length) {
      return (
        '<div class="premium-ranking-preview premium-ranking-preview--skeleton">' +
          renderLockedSkeletonRows() +
          (isPremium ? '' : renderUnlockHint()) +
        '</div>'
      );
    }

    return (
      '<div class="premium-ranking-preview">' +
        players.map(function (player, index) {
          return renderRankingRow(player, index, unit, isPremium, false);
        }).join('') +
        (isPremium ? '' : renderUnlockHint()) +
      '</div>'
    );
  }

  function getCategoryAriaSlug(category) {
    var map = {
      'top-goalscorers': 'goalscorers',
      'top-assists': 'assist providers',
      'most-fouled': 'most fouled players',
      'discipline-risks': 'discipline risks',
      'chance-creators': 'chance creators',
    };
    return map[category && category.id] || (category && category.title ? category.title.toLowerCase() : 'rankings');
  }

  function buildCategoryAriaLabel(category, isPremium) {
    return (isPremium ? 'View' : 'Unlock') + ' top 10 ' + getCategoryAriaSlug(category);
  }

  function getCategoryCtaText(isPremium) {
    return isPremium ? 'View Top 10 →' : 'Unlock Top 10 →';
  }

  function updateCardCue(container, category, isPremium) {
    var card = container.querySelector('[data-premium-preview="' + category.id + '"]');
    if (!card) return;

    var premium = Boolean(isPremium);
    card.setAttribute('aria-label', buildCategoryAriaLabel(category, premium));

    var cta = card.querySelector('.premium-preview-card__cta');
    if (cta) cta.textContent = getCategoryCtaText(premium);
  }

  function renderCategoryCard(category, isPremium) {
    var premium = Boolean(isPremium);
    var ctaText = getCategoryCtaText(premium);
    var ariaLabel = buildCategoryAriaLabel(category, premium);

    return (
      '<button type="button" class="premium-preview-card' + (premium ? ' premium-preview-card--unlocked' : '') + '" data-premium-preview="' + escapeHtml(category.id) + '" aria-label="' + escapeHtml(ariaLabel) + '">' +
        '<div class="premium-preview-card__head">' +
          '<h3>' + escapeHtml(category.title) + '</h3>' +
          '<span class="premium-preview-lock' + (premium ? ' hidden' : '') + '" aria-hidden="true">' + lockIconSvg() + '</span>' +
        '</div>' +
        '<div class="premium-preview-card__body">' +
          '<div class="premium-ranking-mount" id="premium-ranking-' + escapeHtml(category.id) + '" data-ranking-id="' + escapeHtml(category.id) + '">' +
            renderRankingLoading() +
          '</div>' +
        '</div>' +
        '<span class="premium-preview-card__cta" aria-hidden="true">' + escapeHtml(ctaText) + '</span>' +
      '</button>'
    );
  }

  function renderGridSkeleton() {
    var skeletonCategories = [
      { id: 'top-goalscorers', title: 'Top Goalscorers' },
      { id: 'top-assists', title: 'Top Assist Providers' },
      { id: 'most-fouled', title: 'Most Fouled Players' },
      { id: 'discipline-risks', title: 'Discipline Risks' },
      { id: 'chance-creators', title: 'Chance Creators' },
    ];

    return skeletonCategories.map(function (category) {
      return renderCategoryCard(category, false);
    }).join('');
  }

  function updateCategory(container, category, isPremium) {
    var mount = container.querySelector('[data-ranking-id="' + category.id + '"]');
    if (!mount) return;
    mount.innerHTML = renderRankingCategory(category, isPremium);
    updateCardCue(container, category, isPremium);
  }

  function renderGrid(container, data, isPremium) {
    if (!container) return;
    container.innerHTML = (data.categories || []).map(function (category) {
      return renderCategoryCard(category, isPremium);
    }).join('');
  }

  function updateAll(container, data, isPremium) {
    if (!container || !data || !data.categories) return;

    data.categories.forEach(function (category) {
      updateCategory(container, category, Boolean(isPremium));
    });
  }

  function findCategory(data, categoryId) {
    if (!data || !data.categories) return null;
    for (var i = 0; i < data.categories.length; i++) {
      if (data.categories[i].id === categoryId) return data.categories[i];
    }
    return null;
  }

  function renderRankingModalBody(category, isPremium) {
    var players = (category && category.playersTop10) || (category && category.players) || [];
    var unit = category && category.unit;

    if (!players.length) {
      return '<p class="ranking-modal__empty">No ranking data available yet.</p>';
    }

    var rows = players.map(function (player, index) {
      return renderRankingRow(player, index, unit, isPremium, false);
    }).join('');

    var footer = isPremium
      ? ''
      : (
        '<div class="ranking-modal__cta">' +
          '<p>Unlock full player names, photos, countries and clubs with Premium.</p>' +
          '<button type="button" class="btn btn-primary btn-sm" id="ranking-modal-cta">Unlock Premium</button>' +
        '</div>'
      );

    return (
      '<div class="ranking-modal__list">' + rows + '</div>' +
      footer
    );
  }

  function closeRankingModal() {
    var modal = document.getElementById('ranking-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ranking-modal-open');
  }

  function openRankingModal(categoryId, isPremium) {
    var modal = document.getElementById('ranking-modal');
    if (!modal) return;

    var data = global.PremiumAccess && typeof global.PremiumAccess.getLastRankingData === 'function'
      ? global.PremiumAccess.getLastRankingData()
      : null;
    var category = findCategory(data, categoryId);
    if (!category) return;

    var titleEl = modal.querySelector('#ranking-modal-title');
    var bodyEl = modal.querySelector('#ranking-modal-body');
    if (titleEl) titleEl.textContent = category.title;
    if (bodyEl) bodyEl.innerHTML = renderRankingModalBody(category, Boolean(isPremium));

    var ctaBtn = modal.querySelector('#ranking-modal-cta');
    if (ctaBtn) {
      ctaBtn.onclick = function () {
        if (global.PremiumAccess && typeof global.PremiumAccess.startCheckoutFromCTA === 'function') {
          global.PremiumAccess.startCheckoutFromCTA();
        } else if (typeof global.openPremiumModal === 'function') {
          global.openPremiumModal();
        }
      };
    }

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ranking-modal-open');
  }

  function bindRankingModal() {
    var modal = document.getElementById('ranking-modal');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    var closeBtn = modal.querySelector('#ranking-modal-close');
    var backdrop = modal.querySelector('#ranking-modal-backdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeRankingModal);
    if (backdrop) backdrop.addEventListener('click', closeRankingModal);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        closeRankingModal();
      }
    });
  }

  bindRankingModal();

  global.PremiumPreview = {
    renderGridSkeleton: renderGridSkeleton,
    renderGrid: renderGrid,
    updateAll: updateAll,
    renderRankingLoading: renderRankingLoading,
    renderRankingCategory: renderRankingCategory,
    openRankingModal: openRankingModal,
    closeRankingModal: closeRankingModal,
    bindRankingModal: bindRankingModal,
  };
})(window);
