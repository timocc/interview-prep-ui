import * as D from '../domain.js';
import { esc } from '../utils.js';
import { setStatus } from '../shell.js';

export function render(state) {
  const blockers = D.repeatedBlockers(state);
  const trend = D.confidenceTrend(state);

  document.querySelector('[data-view="review"]').innerHTML = `
    <div class="review-grid">
      <section class="panel" aria-labelledby="review-title">
        <div class="panel-header">
          <div><p class="eyebrow">Review</p><h2 id="review-title">Evidence, not guilt</h2></div>
          <span class="tag">${D.completionRate(state)}% completion</span>
        </div>
        <div class="metric-grid">
          <div class="metric-card"><span class="eyebrow">Sessions</span><strong>${state.sessions.length}</strong><span class="muted">logged</span></div>
          <div class="metric-card"><span class="eyebrow">Streak signal</span><strong>${D.consistency(state).activeDays}d</strong><span class="muted">${esc(D.consistency(state).copy)}</span></div>
          <div class="metric-card"><span class="eyebrow">Actual hours</span><strong>${D.actualHours(state)}h</strong><span class="muted">this week</span></div>
        </div>
        <div class="session-list">
          ${state.sessions.slice().reverse().map(session => {
            const item = D.getItem(state, session.itemId);
            return `<article class="session-row">
              <div>
                <p class="title-line">${esc(item?.title || 'Unknown item')}</p>
                <p class="meta-line">${session.date} · planned ${session.plannedMinutes} · actual ${session.actualMinutes} · confidence ${session.confidenceAfter}/5</p>
                ${session.blocker ? `<p class="meta-line">Blocker: ${esc(session.blocker)}</p>` : ''}
                ${session.nextStep ? `<p class="meta-line">Next: ${esc(session.nextStep)}</p>` : ''}
              </div>
              <span class="tag ${session.completed ? 'success' : 'warning'}">${session.completed ? 'complete' : 'needs follow-up'}</span>
            </article>`;
          }).join('')}
        </div>
      </section>
      <aside class="panel">
        <div class="panel-header">
          <div><p class="eyebrow">Patterns</p><h2>Repeated blockers</h2></div>
        </div>
        <div class="blocker-list">
          ${blockers.length
            ? blockers.map(({ word, count, examples }) => `
                <div class="blocker-item">
                  <div class="blocker-header">
                    <span class="tag warning">${esc(word)} ×${count}</span>
                    <button class="button small ghost" type="button" data-blocker-to-action="${esc(word)}">Make this a next step</button>
                  </div>
                  ${examples.map(ex => `<p class="meta-line blocker-example">"${esc(ex)}"</p>`).join('')}
                </div>`).join('')
            : `<span class="tag success">no repeated blocker yet</span>`}
        </div>
        <div class="panel-header" style="margin-top:var(--space-6)">
          <div><p class="eyebrow">This week's retro</p><h2>What happened?</h2></div>
        </div>
        <label>Retro note
          <textarea data-plan-field="retrospective" rows="5" placeholder="What worked, what didn't?">${esc(state.weeklyPlan.retrospective)}</textarea>
        </label>
        <div class="panel">
          <p class="eyebrow">Confidence trend</p>
          <div class="mini-bars" aria-label="Confidence trend">
            ${trend.map(point => `<span title="${point.date}: ${point.confidence}/5" style="height:${Math.max(8, point.confidence * 20)}%"></span>`).join('')}
          </div>
        </div>
        <div class="reflection-list">
          ${['What should get smaller next week?', 'Which topic is ready for mock interview pressure?', 'What belongs parked for now?']
            .map(prompt => `<div class="retro-prompt"><span>${prompt}</span></div>`)
            .join('')}
        </div>
      </aside>
    </div>`;
}

export function bind(store, navigate) {
  document.querySelectorAll('[data-blocker-to-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const state = store.getState();
      const keyword = btn.dataset.blockerToAction;
      const session = state.sessions.slice().reverse()
        .find(s => (s.blocker || '').toLowerCase().includes(keyword));
      if (session) {
        session.nextStep = session.nextStep
          ? `${session.nextStep}\n\n[From blocker "${keyword}"] Work through this pattern.`
          : `[From blocker "${keyword}"] Work through this pattern.`;
      } else {
        const existing = state.weeklyPlan.nextWeekFocus || '';
        store.updatePlan({
          nextWeekFocus: existing ? `${existing}\n\n[Blocker pattern] ${keyword}` : `[Blocker pattern] ${keyword}`
        });
      }
      setStatus(`"${keyword}" added as a next step.`);
    });
  });
  let planFieldTimer = null;
  document.querySelectorAll('[data-plan-field]').forEach(textarea =>
    textarea.addEventListener('input', () => {
      clearTimeout(planFieldTimer);
      planFieldTimer = setTimeout(
        () => store.updatePlan({ [textarea.dataset.planField]: textarea.value }),
        600
      );
    })
  );
}
