import * as D from '../domain.js';
import { esc, itemMeta, recommendationHtml, queueRows } from '../utils.js';
import { openSession } from '../shell.js';

export function render(state) {
  const rec = D.recommend(state);
  const selected = D.getSelectedItems(state);
  const con = D.consistency(state);
  const recent = state.sessions.slice(-4).reverse();
  document.querySelector('[data-view="dashboard"]').innerHTML = `
    <div class="dashboard-grid">
      <div>
        <section class="panel" aria-labelledby="dashboard-title">
          <div class="panel-header">
            <div>
              <p class="eyebrow">This week</p>
              <h2 id="dashboard-title">Small committed slice</h2>
            </div>
            <span class="tag">${selected.length} active</span>
          </div>
          <div class="metric-grid">
            <div class="metric-card"><span class="eyebrow">Planned</span><strong>${state.weeklyPlan.plannedHours}h</strong><span class="muted">target load</span></div>
            <div class="metric-card"><span class="eyebrow">Actual</span><strong>${D.actualHours(state)}h</strong><span class="muted">logged</span></div>
            <div class="metric-card"><span class="eyebrow">Consistency</span><strong>${con.activeDays}d</strong><span class="muted">${esc(con.label)}</span></div>
          </div>
          <div class="progress-bar" aria-label="Planned versus actual hours">
            <span style="width:${Math.min(100, (D.actualHours(state) / state.weeklyPlan.plannedHours) * 100)}%"></span>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div><p class="eyebrow">Today</p><h2>One thing to start</h2></div>
          </div>
          ${recommendationHtml(rec)}
        </section>
      </div>
      <aside>
        <section class="panel">
          <div class="panel-header">
            <div><p class="eyebrow">Active queue only</p><h2>No browsing mode</h2></div>
          </div>
          <div class="queue-list">${queueRows(selected)}</div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div><p class="eyebrow">Recent progress</p><h2>Last sessions</h2></div>
          </div>
          <div class="session-list">
            ${recent.map(session => {
              const item = D.getItem(state, session.itemId);
              return `<article class="session-row">
                <div>
                  <p class="title-line">${esc(item?.title || 'Unknown item')}</p>
                  <p class="meta-line">${session.date} · ${session.actualMinutes} min · confidence ${session.confidenceAfter}/5</p>
                </div>
                <span class="tag ${session.completed ? 'success' : 'warning'}">${session.completed ? 'done' : 'carryover'}</span>
              </article>`;
            }).join('')}
          </div>
        </section>
      </aside>
    </div>`;
}

export function bind(store, navigate) {
  document.querySelectorAll('[data-start-item]').forEach(btn =>
    btn.addEventListener('click', () => openSession(btn.dataset.startItem, btn.dataset.preset))
  );
}
