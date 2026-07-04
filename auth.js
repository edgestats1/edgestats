import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

var supabase = null;
var currentSession = null;
var currentProfile = null;
var initPromise = null;
var authMode = 'login';
var listeners = [];

function notify() {
  listeners.forEach(function (fn) {
    try {
      fn({
        session: currentSession,
        profile: currentProfile,
        isPremium: isPremium(),
      });
    } catch (err) {
      console.error('EdgeStatsAuth listener error:', err);
    }
  });
}

function isPremium() {
  return currentProfile && currentProfile.role === 'premium';
}

function getAccessToken() {
  return currentSession && currentSession.access_token ? currentSession.access_token : null;
}

async function fetchProfileFromApi() {
  var token = getAccessToken();
  if (!token) {
    currentProfile = null;
    return null;
  }

  var response = await fetch('/api/profile', {
    headers: {
      Authorization: 'Bearer ' + token,
    },
  });

  if (!response.ok) {
    throw new Error('Unable to load account profile.');
  }

  var payload = await response.json();
  currentProfile = payload.profile || null;
  return currentProfile;
}

async function applySession(session) {
  currentSession = session;
  if (!session) {
    currentProfile = null;
    notify();
    updateAccountUI();
    if (typeof window.updatePremiumCTAVisibility === 'function') {
      window.updatePremiumCTAVisibility(false);
    }
    return;
  }

  try {
    await fetchProfileFromApi();
  } catch (err) {
    console.error(err);
    currentProfile = {
      id: session.user.id,
      email: session.user.email,
      role: 'free',
    };
  }

  notify();
  updateAccountUI();
  if (typeof window.updatePremiumCTAVisibility === 'function') {
    window.updatePremiumCTAVisibility(isPremium());
  }
}

async function initAuth() {
  if (initPromise) return initPromise;

  initPromise = (async function () {
    var configResponse = await fetch('/api/public-config');
    if (!configResponse.ok) {
      throw new Error('Unable to load auth configuration.');
    }

    var config = await configResponse.json();
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    var result = await supabase.auth.getSession();
    await applySession(result.data.session || null);

    supabase.auth.onAuthStateChange(async function (_event, session) {
      await applySession(session);
    });

    handleCheckoutReturn();
    bindAuthModal();
    updateAccountUI();
  })();

  return initPromise;
}

function onChange(callback) {
  listeners.push(callback);
  callback({
    session: currentSession,
    profile: currentProfile,
    isPremium: isPremium(),
  });
  return function () {
    listeners = listeners.filter(function (fn) { return fn !== callback; });
  };
}

async function refreshProfile() {
  if (!currentSession) return null;
  await fetchProfileFromApi();
  notify();
  updateAccountUI();
  if (typeof window.updatePremiumCTAVisibility === 'function') {
    window.updatePremiumCTAVisibility(isPremium());
  }
  return currentProfile;
}

async function signUp(email, password) {
  if (!supabase) await initAuth();

  var result = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (result.error) throw result.error;
  return result.data;
}

async function signIn(email, password) {
  if (!supabase) await initAuth();

  var result = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (result.error) throw result.error;
  await applySession(result.data.session);
  updateAccountUI();
  return result.data;
}

async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  currentSession = null;
  currentProfile = null;
  notify();
  updateAccountUI();

  if (typeof window.updatePremiumCTAVisibility === 'function') {
    window.updatePremiumCTAVisibility(isPremium());
  }
}

function openAuthModal(mode, message) {
  authMode = mode || 'login';
  var modal = document.getElementById('auth-modal');
  if (!modal) return;

  setAuthMode(authMode);
  setAuthMessage(message || '');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('auth-modal-open');

  var emailInput = document.getElementById('auth-email');
  if (emailInput) emailInput.focus();
}

function closeAuthModal() {
  var modal = document.getElementById('auth-modal');
  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('auth-modal-open');
  clearAuthFeedback();
}

function setAuthMode(mode) {
  authMode = mode;
  var loginTab = document.getElementById('auth-tab-login');
  var signupTab = document.getElementById('auth-tab-signup');
  var submitBtn = document.getElementById('auth-submit-btn');
  var title = document.getElementById('auth-modal-title');

  if (loginTab) loginTab.classList.toggle('is-active', mode === 'login');
  if (signupTab) signupTab.classList.toggle('is-active', mode === 'signup');
  if (submitBtn) submitBtn.textContent = mode === 'signup' ? 'Create account' : 'Log in';
  if (title) title.textContent = mode === 'signup' ? 'Create your EdgeStats account' : 'Log in to EdgeStats';
}

function setAuthMessage(message) {
  var el = document.getElementById('auth-modal-message');
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function setAuthFeedback(message, type) {
  var el = document.getElementById('auth-feedback');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'auth-feedback' + (type ? ' auth-feedback--' + type : '');
  el.classList.toggle('hidden', !message);
}

function clearAuthFeedback() {
  setAuthFeedback('', '');
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  clearAuthFeedback();

  var email = document.getElementById('auth-email').value.trim();
  var password = document.getElementById('auth-password').value;

  if (!email || !password) {
    setAuthFeedback('Enter your email and password.', 'error');
    return;
  }

  if (password.length < 8) {
    setAuthFeedback('Password must be at least 8 characters.', 'error');
    return;
  }

  var submitBtn = document.getElementById('auth-submit-btn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    if (authMode === 'signup') {
      await signUp(email, password);
      setAuthFeedback('Account created. Log in to continue.', 'success');
      setAuthMode('login');
    } else {
      await signIn(email, password);
      closeAuthModal();
    }
  } catch (err) {
    setAuthFeedback(err.message || 'Authentication failed.', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function bindAuthModal() {
  var form = document.getElementById('auth-form');
  var closeBtn = document.getElementById('auth-modal-close');
  var backdrop = document.getElementById('auth-modal-backdrop');
  var loginTab = document.getElementById('auth-tab-login');
  var signupTab = document.getElementById('auth-tab-signup');
  var authBtn = document.getElementById('nav-auth-btn');
  var logoutBtn = document.getElementById('nav-logout-btn');

  if (form) form.addEventListener('submit', handleAuthSubmit);
  if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
  if (backdrop) backdrop.addEventListener('click', closeAuthModal);
  if (loginTab) loginTab.addEventListener('click', function () { setAuthMode('login'); });
  if (signupTab) signupTab.addEventListener('click', function () { setAuthMode('signup'); });

  if (authBtn) {
    authBtn.addEventListener('click', function () {
      openAuthModal(currentSession ? 'login' : 'login');
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      signOut();
    });
  }

  document.addEventListener('keydown', function (event) {
    var modal = document.getElementById('auth-modal');
    if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closeAuthModal();
    }
  });
}

function updateAccountUI() {
  var badge = document.getElementById('nav-account-badge');
  var authBtn = document.getElementById('nav-auth-btn');
  var logoutBtn = document.getElementById('nav-logout-btn');
  var emailEl = document.getElementById('nav-account-email');

  var loggedIn = Boolean(currentSession && currentSession.user);
  var premium = isPremium();

  if (badge) {
    badge.textContent = premium ? 'Premium' : 'Free';
    badge.className = 'nav-account-badge ' + (premium ? 'nav-account-badge--premium' : 'nav-account-badge--free');
  }

  if (emailEl) {
    if (loggedIn && currentSession.user.email) {
      emailEl.textContent = currentSession.user.email;
      emailEl.classList.remove('hidden');
    } else {
      emailEl.textContent = '';
      emailEl.classList.add('hidden');
    }
  }

  if (authBtn) {
    authBtn.textContent = loggedIn ? 'Account' : 'Log in';
    authBtn.classList.toggle('hidden', false);
  }

  if (logoutBtn) {
    logoutBtn.classList.toggle('hidden', !loggedIn);
  }

  document.body.classList.toggle('edgestats-premium', premium);
  document.body.classList.toggle('edgestats-free', !premium);
}

function handleCheckoutReturn() {
  var params = new URLSearchParams(window.location.search);
  var checkout = params.get('checkout');

  if (!checkout) return;

  if (checkout === 'success') {
    var attempts = 0;

    function pollProfile() {
      refreshProfile().then(function () {
        if (isPremium()) {
          if (typeof window.showPremiumSuccessToast === 'function') {
            window.showPremiumSuccessToast('Premium unlocked');
          } else if (typeof window.showPremiumToast === 'function') {
            window.showPremiumToast('Premium unlocked', { successOnly: true, isPremium: true });
          }
          if (typeof window.updatePremiumCTAVisibility === 'function') {
            window.updatePremiumCTAVisibility(true);
          }
          return;
        }

        attempts += 1;
        if (attempts < 6) {
          setTimeout(pollProfile, 2000);
          return;
        }

        if (typeof window.showPremiumToast === 'function') {
          window.showPremiumToast('Payment received. Premium access will unlock shortly once confirmation completes.', { isPremium: false });
        }
      });
    }

    pollProfile();
  }

  params.delete('checkout');
  var nextQuery = params.toString();
  var nextUrl = window.location.pathname + (nextQuery ? '?' + nextQuery : '') + window.location.hash;
  window.history.replaceState({}, '', nextUrl);
}

async function startCheckout() {
  await initAuth();

  if (!currentSession) {
    openAuthModal('login', 'Log in or create an account before upgrading to Premium.');
    return false;
  }

  if (isPremium()) {
    if (typeof window.updatePremiumCTAVisibility === 'function') {
      window.updatePremiumCTAVisibility(true);
    }
    return false;
  }

  var response = await fetch('/api/create-checkout', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + getAccessToken(),
    },
  });

  var payload = await response.json();
  if (!response.ok) {
    var detail = payload.message ? payload.message : '';
    var errorText = payload.error || 'Unable to start checkout.';
    throw new Error(detail ? errorText + ' ' + detail : errorText);
  }

  window.location.href = payload.url;
  return true;
}

window.EdgeStatsAuth = {
  init: initAuth,
  onChange: onChange,
  isPremium: isPremium,
  getProfile: function () { return currentProfile; },
  getSession: function () { return currentSession; },
  getAccessToken: getAccessToken,
  refreshProfile: refreshProfile,
  signIn: signIn,
  signUp: signUp,
  signOut: signOut,
  openAuthModal: openAuthModal,
  closeAuthModal: closeAuthModal,
  startCheckout: startCheckout,
};

initAuth().catch(function (err) {
  console.error('EdgeStats auth init failed:', err);
});
