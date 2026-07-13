const WORKER_URL = 'https://lester-apps-auth.jllester-email.workers.dev';
const login = document.querySelector('#login');
const workspace = document.querySelector('#workspace');
const signOut = document.querySelector('#sign-out');
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

async function initialize() {
  try { showUser((await api('/auth/session')).user); }
  catch { loginError.textContent = ''; }
}

document.querySelector('.journeys').addEventListener('click', event => {
  const button = event.target.closest('button[data-app]'); if (!button) return;
  document.querySelectorAll('.journeys button').forEach(item => item.classList.toggle('active', item === button));
  loadApp(button.dataset.app);
});
signOut.addEventListener('click', async () => { await api('/auth/logout',{method:'POST'}); location.reload(); });
window.addEventListener('load', initialize);
