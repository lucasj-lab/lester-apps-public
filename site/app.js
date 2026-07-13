const WORKER_URL = 'https://lester-apps-auth.jllester-email.workers.dev';
const login = document.querySelector('#login');
const workspace = document.querySelector('#workspace');
const signOut = document.querySelector('#sign-out');
const loginButton = document.querySelector('#login-button');
const loginError = document.querySelector('#login-error');
const dataEl = document.querySelector('#data');
const dataError = document.querySelector('#data-error');
const loading = document.querySelector('#loading');

async function api(path, options = {}) {
  const response = await fetch(`${WORKER_URL}${path}`, {...options, credentials: 'include'});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

async function loadApp(name) {
  loading.hidden = false; dataEl.textContent = ''; dataError.textContent = '';
  try { dataEl.textContent = JSON.stringify(await api(`/api/${name}`), null, 2); }
  catch (error) { dataError.textContent = error.message; }
  finally { loading.hidden = true; }
}

function showUser(user) {
  login.hidden = true; workspace.hidden = false; signOut.hidden = false;
  document.querySelector('#welcome').textContent = `Signed in as ${user.email}`;
  loadApp('dashboard');
}

let googleReady = false;
let googleClientId = '';
let googleSdkPromise;

function loadGoogleSdk(forceReload = false) {
  if (globalThis.google?.accounts?.id) return Promise.resolve();
  if (forceReload) {
    document.querySelector('#google-identity-sdk')?.remove();
    googleSdkPromise = null;
  }
  if (googleSdkPromise) return googleSdkPromise;
  googleSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'google-identity-sdk';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => globalThis.google?.accounts?.id ? resolve() : reject(new Error('Google Identity did not initialize.'));
    script.onerror = () => reject(new Error('Google Sign-In could not be downloaded.'));
    document.head.append(script);
  });
  return googleSdkPromise;
}

function handleCredential({credential}) {
  loginButton.disabled = true;
  loginError.textContent = '';
  api('/auth/google', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({credential})})
    .then(({user}) => showUser(user))
    .catch(error => { loginError.textContent = error.message; loginButton.disabled = false; });
}

async function openGoogleLogin() {
  if (!googleReady && googleClientId) {
    loginButton.disabled = true;
    loginError.textContent = 'Loading Google Sign-In…';
    try {
      await loadGoogleSdk();
      setupGoogle();
    } catch {
      try {
        await loadGoogleSdk(true);
        setupGoogle();
      } catch {
        loginError.textContent = 'Google Sign-In could not load. Check content blockers or network privacy settings, then try again.';
        loginButton.disabled = false;
        return;
      }
    }
    loginButton.disabled = false;
  }
  if (!googleReady) {
    loginError.textContent = 'Google Sign-In could not initialize. Refresh the page and try again.';
    return;
  }
  loginError.textContent = '';
  google.accounts.id.prompt(notification => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      loginError.textContent = 'Use the Google sign-in button below to choose an approved account.';
      document.querySelector('#google-signin').hidden = false;
    }
  });
}

function setupGoogle() {
  if (!globalThis.google?.accounts?.id) return false;
  google.accounts.id.initialize({client_id: googleClientId, callback: handleCredential});
  document.querySelector('#google-signin').replaceChildren();
  google.accounts.id.renderButton(document.querySelector('#google-signin'), {theme:'outline',size:'large',shape:'rectangular',width:320});
  googleReady = true;
  return true;
}

async function initialize() {
  if (WORKER_URL.includes('REPLACE_')) { loginError.textContent = 'Secure service configuration is pending.'; return; }
  try { showUser((await api('/auth/session')).user); return; } catch {}
  const config = await api('/config');
  googleClientId = config.googleClientId;
  try {
    await loadGoogleSdk();
    setupGoogle();
  } catch {
    loginError.textContent = 'Google Sign-In will load when you select Continue with Google.';
  }
}

document.querySelector('.journeys').addEventListener('click', event => {
  const button = event.target.closest('button[data-app]'); if (!button) return;
  document.querySelectorAll('.journeys button').forEach(item => item.classList.toggle('active', item === button));
  loadApp(button.dataset.app);
});
signOut.addEventListener('click', async () => { await api('/auth/logout',{method:'POST'}); location.reload(); });
loginButton.addEventListener('click', openGoogleLogin);
window.addEventListener('load', initialize);
