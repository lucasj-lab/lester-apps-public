const WORKER_URL = 'https://lester-apps-auth.jllester-email.workers.dev';
const $ = selector => document.querySelector(selector);
let activeApp = 'dashboard';
let savedActions = JSON.parse(localStorage.getItem('lester-actions') || '[]');

async function api(path, options = {}) {
  const response = await fetch(`${WORKER_URL}${path}`, {...options, credentials: 'include'});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const displayValue = value => typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—');

function renderMetrics(metrics = []) {
  $('#metrics').innerHTML = metrics.map((metric, index) => `
    <article class="metric-card">
      <div class="metric-icon tone-${index % 4}">${['↗','◎','✓','≡'][index % 4]}</div>
      <div><p>${escapeHtml(metric.label)}</p><strong>${escapeHtml(displayValue(metric.value))}</strong><span>${escapeHtml(metric.detail || '')}</span></div>
    </article>`).join('');
}

function normalizeSignals(data) {
  if (Array.isArray(data.signals)) return data.signals;
  if (Array.isArray(data.insights)) return data.insights;
  return [];
}

function renderSignals(data) {
  const signals = normalizeSignals(data);
  $('#signal-count').textContent = signals.length ? `${signals.length} current` : '';
  $('#signals-empty').hidden = signals.length > 0;
  $('#signals-body').innerHTML = signals.map((signal, index) => {
    const entries = Object.entries(signal || {});
    const label = signal.label || signal.title || signal.name || `Signal ${index + 1}`;
    const value = signal.value ?? signal.status ?? signal.count ?? 'Current';
    const detail = signal.detail || signal.description || entries.filter(([key]) => !['label','title','name','value','status','count'].includes(key)).map(([key,val]) => `${key}: ${displayValue(val)}`).join(' · ');
    return `<tr><td><span class="signal-dot tone-${index % 4}"></span><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(displayValue(value))}</td><td>${escapeHtml(detail || 'No additional context')}</td></tr>`;
  }).join('');
}

function renderDetails(data) {
  const omitted = new Set(['metrics','signals','insights','ok']);
  const rows = Object.entries(data).filter(([key]) => !omitted.has(key));
  $('#details-body').innerHTML = rows.map(([key,value]) => `<tr><td>${escapeHtml(key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()))}</td><td>${escapeHtml(displayValue(value))}</td></tr>`).join('');
}

const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value || 0));

function renderFinance(data) {
  const budget = data.budget || {};
  const rows = Array.isArray(budget.rows) ? budget.rows : [];
  const net = Number(budget.projectedTotal || 0) - Number(budget.actualTotal || 0);
  $('#finance-summary').innerHTML = [
    {label:'Projected budget',value:money(budget.projectedTotal),detail:'Planned monthly expenses'},
    {label:'Actual expenses',value:money(budget.actualTotal),detail:'Workbook actuals'},
    {label:'Budget remaining',value:money(budget.remainingTotal || net),detail:'Projected less actual',positive:Number(budget.remainingTotal || net) >= 0}
  ].map((item,index)=>`<article class="finance-card ${index===2?'net-card':''}"><div><p>${escapeHtml(item.label)}</p><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.detail)}</span></div></article>`).join('');
  $('#budget-month').textContent = budget.monthLabel || 'Current month';
  $('#budget-empty').hidden = rows.length > 0;
  $('#budget-body').innerHTML = rows.map((row,index)=>{
    const remaining=Number(row.projected||0)-Number(row.actual||0);
    const status=row.status || (remaining < 0 ? 'Over budget' : 'On track');
    return `<tr><td><span class="category-dot tone-${index%4}"></span><strong>${escapeHtml(row.category||'Uncategorized')}</strong></td><td>${money(row.projected)}</td><td>${money(row.actual)}</td><td class="${remaining<0?'negative':'positive'}">${money(remaining)}</td><td><span class="budget-status ${remaining<0?'over':'track'}">${escapeHtml(status)}</span></td></tr>`;
  }).join('');
  $('#finance-budget').hidden = false;
  $('.dashboard-grid').hidden = true;
  $('#metrics').hidden = true;
}

function renderApp(data) {
  $('#app-name').textContent = data.appName || activeApp;
  $('#app-status').lastChild.textContent = ` ${data.status || 'Live'}`;
  $('#page-date').textContent = data.updatedAt ? `Updated ${data.updatedAt}` : 'Secure Journey summary';
  renderMetrics(data.metrics || []);
  renderSignals(data);
  renderDetails(data);
  $('#finance-budget').hidden = true;
  $('.dashboard-grid').hidden = false;
  $('#metrics').hidden = false;
  if (data.appKey === 'finance') renderFinance(data);
  $('#app-content').hidden = false;
}

async function loadApp(name) {
  activeApp = name;
  $('#loading').hidden = false;
  $('#app-content').hidden = true;
  $('#data-error').hidden = true;
  try { renderApp(await api(`/api/${name}`)); }
  catch (error) { $('#data-error p').textContent = error.message; $('#data-error').hidden = false; }
  finally { $('#loading').hidden = true; }
}

function showUser(user) {
  $('#login-shell').hidden = true;
  $('#workspace').hidden = false;
  $('#welcome').textContent = `Signed in as ${user.email}`;
  loadApp('dashboard');
}

function renderSavedActions() {
  $('#saved-actions').innerHTML = savedActions.length ? savedActions.slice(0,5).map((item,index) => `<article class="saved-action"><div><strong>${escapeHtml(item.type)}</strong><p>${escapeHtml(item.for)}</p><span>${escapeHtml(item.date || 'No due date')}</span></div><button data-remove-action="${index}" aria-label="Remove ${escapeHtml(item.for)}">×</button></article>`).join('') : '<div class="empty compact">No actions yet. Use the form above to capture your first one.</div>';
}

async function initialize() {
  renderSavedActions();
  try { showUser((await api('/auth/session')).user); }
  catch { $('#login-error').textContent = ''; }
}

$('.journeys').addEventListener('click', event => {
  const button = event.target.closest('button[data-app]'); if (!button) return;
  if (button.dataset.app === 'finance') { location.href = 'budget/'; return; }
  document.querySelectorAll('.journeys button').forEach(item => item.classList.toggle('active', item === button));
  $('.sidebar').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded','false');
  loadApp(button.dataset.app);
});
$('#menu-toggle').addEventListener('click', () => { const open = $('.sidebar').classList.toggle('open'); $('#menu-toggle').setAttribute('aria-expanded', String(open)); });
$('#retry-button').addEventListener('click', () => loadApp(activeApp));
$('#sign-out').addEventListener('click', async () => { await api('/auth/logout',{method:'POST'}); location.reload(); });
$('#quick-action-form').addEventListener('submit', event => {
  event.preventDefault();
  savedActions.unshift({type:$('#action-type').value,for:$('#action-for').value.trim(),notes:$('#action-notes').value.trim(),date:$('#action-date').value});
  savedActions = savedActions.slice(0,20); localStorage.setItem('lester-actions',JSON.stringify(savedActions));
  event.target.reset(); renderSavedActions(); $('#action-success').textContent = 'Action saved on this device.'; setTimeout(()=>$('#action-success').textContent='',3000);
});
$('#saved-actions').addEventListener('click', event => { const button=event.target.closest('[data-remove-action]'); if(!button)return; savedActions.splice(Number(button.dataset.removeAction),1); localStorage.setItem('lester-actions',JSON.stringify(savedActions)); renderSavedActions(); });
window.addEventListener('load', initialize);
