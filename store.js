import seed from './data.js';
import * as D from './domain.js';
import { mergeResources } from './notionAdapter.js';
import connector from './githubSync.js';

const STORAGE_KEY = 'interview-prep-coach-state';

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.resources) || typeof parsed.weeklyPlan !== 'object') return null;
    return parsed;
  } catch (_) { return null; }
}

function initState() {
  const fresh = D.cloneSeed(seed);
  const saved = loadPersistedState();
  if (!saved) return fresh;
  if (typeof mergeResources === 'function') {
    saved.resources = mergeResources(saved.resources, fresh.resources);
  } else {
    const savedIds = new Set(saved.resources.map(r => r.id));
    fresh.resources.forEach(r => { if (!savedIds.has(r.id)) saved.resources.push(r); });
  }
  return saved;
}

export function createStore() {
  let state = initState();
  if (!state.weeklyPlan.weekOf) state.weeklyPlan.weekOf = D.weekStart();
  const subs = [];

  function emit() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    subs.forEach(fn => fn(state));
  }

  async function syncPush(session, item) {
    if (!connector?.isConfigured()) return { synced: false };
    const date = new Date().toISOString().slice(0, 10);
    const label = `session: ${item?.title ?? session.itemId} · ${session.actualMinutes} min · confidence ${session.confidenceAfter}/5 · ${date}`;
    try {
      await connector.push(state, label);
      return { synced: true };
    } catch {
      return { synced: false };
    }
  }

  return {
    getState: () => state,
    subscribe: (fn) => subs.push(fn),

    addSession(session) {
      const item = D.getItem(state, session.itemId);
      D.addSession(state, session);
      emit();
      return syncPush(session, item);
    },
    promote(id)       { D.promote(state, id); emit(); },
    demote(id)        { D.demote(state, id); emit(); },
    updatePlan(patch) { Object.assign(state.weeklyPlan, patch); emit(); },
    autoPlan()        { state.weeklyPlan.selectedItemIds = D.autoSuggestPlan(state); emit(); },
    rescope()         { Object.assign(state.weeklyPlan, D.rescope(state)); emit(); },
    importState(s)    { state = s; emit(); },

    async init() {
      if (!connector?.isConfigured()) return;
      const result = await connector.pull();
      if (result && result.state.sessions.length >= state.sessions.length) {
        state = result.state;
        emit();
      }
    }
  };
}
