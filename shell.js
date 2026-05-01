import * as D from './domain.js';
import connector from './githubSync.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const NAV_ITEMS = [
  ['dashboard', 'Dashboard'],
  ['planner', 'Weekly Planner'],
  ['today', 'Today'],
  ['backlog', 'Backlog'],
  ['review', 'Review']
];

let _store = null;
let _router = null;
let _timerHandle = null;
let _activeSessionItemId = null;
let _activeStartedAt = null;

export function init(store, router) {
  _store = store;
  _router = router;
  initTheme();
  initNav();
  initSessionDialog();
  initImport();
  $('[data-action="start-recommended"]')?.addEventListener('click', () => {
    const rec = D.recommend(_store.getState());
    if (rec) openSession(rec.item.id);
  });
  $('[data-action="pick-for-me"]')?.addEventListener('click', () => _router.navigate('today'));
  $('[data-action="open-github-config"]')?.addEventListener('click', () => connector.showConfigDialog());
  connector.updateSyncIndicator();
}

export function setStatus(message) {
  $('[data-status-line]').firstChild.textContent = message;
}

export function setSyncStatus(message, autoClearMs = 0) {
  const el = $('[data-sync-status]');
  if (!el) return;
  el.textContent = message;
  if (autoClearMs) setTimeout(() => { el.textContent = ''; }, autoClearMs);
}

export function updateShell(state) {
  const selected = D.getSelectedItems(state);
  const byCat = selected.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
  $('[data-week-of]').textContent = state.weeklyPlan.weekOf;
  $('[data-active-slice-summary]').textContent =
    `${selected.length} items: ${D.categoryOrder.map(cat => `${byCat[cat] || 0} ${cat}`).join(' · ')}`;
}

export function setActiveNav(view) {
  const title = NAV_ITEMS.find(([key]) => key === view)?.[1] || 'Dashboard';
  $('[data-page-title]').textContent = title;
  $$('[data-nav-target]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.navTarget === view)
  );
}

export function openSession(itemId, preset) {
  const state = _store.getState();
  const item = D.getItem(state, itemId);
  if (!item) return;
  _activeSessionItemId = itemId;
  _activeStartedAt = null;
  const dialog = $('[data-session-dialog]');
  $('[data-session-title]').textContent = item.title;
  $('[data-session-context]').textContent = `${item.category} · ${item.subcategory} · ${item.difficulty} · ${item.estimatedMinutes} min. ${item.notes}`;
  $$('[name="plannedMinutes"]').forEach(radio => {
    radio.checked = radio.value === String(preset || item.estimatedMinutes || 60);
  });
  if (!$$('[name="plannedMinutes"]').some(r => r.checked)) {
    $('[name="plannedMinutes"][value="75"]').checked = true;
  }
  showSessionStage('start');
  dialog.showModal();
}

function showSessionStage(stage) {
  $$('[data-session-stage]').forEach(el =>
    el.classList.toggle('hidden', el.dataset.sessionStage !== stage)
  );
}

function beginSession() {
  const planned = Number($('[name="plannedMinutes"]:checked').value);
  _activeStartedAt = Date.now();
  $('[name="actualMinutes"]').value = planned;
  $('[data-session-target]').textContent = `Target ${planned} minutes`;
  showSessionStage('finish');
  clearInterval(_timerHandle);
  _timerHandle = setInterval(() => {
    const elapsed = Math.floor((Date.now() - _activeStartedAt) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    $('[data-session-elapsed]').textContent = `${mm}:${ss}`;
  }, 1000);
}

function finishSession(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const plannedMinutes = Number($('[name="plannedMinutes"]:checked').value);
  const session = {
    itemId: _activeSessionItemId,
    plannedMinutes,
    actualMinutes: Number(form.actualMinutes.value || plannedMinutes),
    confidenceAfter: Number(form.confidenceAfter.value),
    blocker: form.blocker.value.trim(),
    nextStep: form.nextStep.value.trim(),
    completed: form.completed.checked
  };
  clearInterval(_timerHandle);
  $('[data-session-dialog]').close();
  form.reset();
  _store.addSession(session)
    .then(({ synced }) => {
      setSyncStatus(synced ? 'Synced ✓' : '', synced ? 3000 : 0);
      setStatus(synced
        ? 'Session logged and synced to GitHub.'
        : 'Session logged. The next recommendation now accounts for confidence, carryover, and blockers.');
    })
    .catch(() => {
      setSyncStatus('Sync failed', 5000);
      setStatus('Session logged. GitHub sync failed — check your config.');
    });
}

function initSessionDialog() {
  $('[data-action="close-dialog"]').addEventListener('click', () => {
    clearInterval(_timerHandle);
    $('[data-session-dialog]').close();
  });
  $('[data-action="begin-session"]').addEventListener('click', beginSession);
  $('[data-session-form]').addEventListener('submit', finishSession);
}

function initNav() {
  $('[data-nav]').innerHTML = NAV_ITEMS
    .map(([key, label]) =>
      `<button class="nav-link" type="button" data-nav-target="${key}">${label}</button>`
    ).join('');
  $$('[data-nav-target]').forEach(btn =>
    btn.addEventListener('click', () => _router.navigate(btn.dataset.navTarget))
  );
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('[data-theme-toggle]').textContent = theme === 'dark' ? 'Use light theme' : 'Use dark theme';
}

function initTheme() {
  const preferred = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  setTheme(preferred);
  $('[data-theme-toggle]').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || preferred;
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
}

export function exportSnapshot() {
  const blob = new Blob([JSON.stringify(_store.getState(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `interview-prep-coach-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus('Snapshot exported.');
}

export function importSnapshot() {
  document.getElementById('import-file').click();
}

function initImport() {
  const input = document.getElementById('import-file');
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed.resources) || typeof parsed.weeklyPlan !== 'object') {
          setStatus('Import failed: file does not look like an Interview Prep Coach snapshot.');
          return;
        }
        _store.importState(parsed);
        setStatus('State restored from snapshot.');
      } catch (_) {
        setStatus('Import failed: could not parse JSON file.');
      }
      input.value = '';
    };
    reader.readAsText(file);
  });
}
