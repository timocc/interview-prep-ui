import * as D from '../domain.js';
import { esc, queueRows } from '../utils.js';
import { openSession, setStatus } from '../shell.js';

function targetInput(name, label, value) {
  return `<div class="planner-target"><label>${label}<input data-plan-number="${name}" type="number" min="0" max="20" value="${value}" /></label></div>`;
}

export function render(state) {
  const selected = D.getSelectedItems(state);
  const counts = selected.reduce((acc, item) => ((acc[item.category] = (acc[item.category] || 0) + 1), acc), {});
  document.querySelector('[data-view="planner"]').innerHTML = `
    <div class="planner-layout">
      <section class="panel" aria-labelledby="planner-title">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Weekly planner</p>
            <h2 id="planner-title">Plan the week in under 10 minutes</h2>
          </div>
          <div class="button-row">
            <button class="button secondary" type="button" data-action="auto-plan">Auto-suggest plan</button>
            <button class="button ghost" type="button" data-action="rescope-week">Rescope remaining week</button>
          </div>
        </div>
        <div class="planner-targets">
          ${targetInput('targetDSA', 'DSA items', state.weeklyPlan.targetDSA)}
          ${targetInput('targetSystemDesign', 'System design', state.weeklyPlan.targetSystemDesign)}
          ${targetInput('targetDBInternals', 'DB internals', state.weeklyPlan.targetDBInternals)}
          ${targetInput('plannedHours', 'Planned hours', state.weeklyPlan.plannedHours)}
        </div>
        <div class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Planned vs actual</p>
              <h3>${D.actualHours(state)}h logged of ${state.weeklyPlan.plannedHours}h planned</h3>
            </div>
            <span class="tag">${counts.DSA || 0}/${state.weeklyPlan.targetDSA} DSA · ${counts['System Design'] || 0}/${state.weeklyPlan.targetSystemDesign} SD · ${counts['DB Internals'] || 0}/${state.weeklyPlan.targetDBInternals} DB</span>
          </div>
          <div class="progress-bar">
            <span style="width:${Math.min(100, (D.actualHours(state) / state.weeklyPlan.plannedHours) * 100)}%"></span>
          </div>
        </div>
        <div class="queue-list">${queueRows(selected, 12)}</div>
      </section>
      <aside class="panel">
        <div class="panel-header">
          <div><p class="eyebrow">Weekly notes</p><h2>Retro prompts</h2></div>
        </div>
        <label>Notes<textarea data-plan-field="retrospective" rows="5" placeholder="What worked, what didn't?">${esc(state.weeklyPlan.retrospective)}</textarea></label>
        <label>Next week focus<textarea data-plan-field="nextWeekFocus" rows="4">${esc(state.weeklyPlan.nextWeekFocus)}</textarea></label>
        <div class="reflection-list">
          ${['What got avoided?', 'Which blocker repeated?', 'What should be removed from active scope?', 'What single pattern needs reinforcement?']
            .map(prompt => `<div class="retro-prompt"><span>${prompt}</span><span class="tag">answer Friday</span></div>`)
            .join('')}
        </div>
      </aside>
    </div>`;
}

export function bind(store, navigate) {
  document.querySelector('[data-action="auto-plan"]')?.addEventListener('click', () => {
    store.autoPlan();
    setStatus('Plan updated.');
  });
  document.querySelector('[data-action="rescope-week"]')?.addEventListener('click', () => {
    store.rescope();
    setStatus('Week rescoped.');
  });
  document.querySelectorAll('[data-plan-number]').forEach(input =>
    input.addEventListener('change', () =>
      store.updatePlan({ [input.dataset.planNumber]: Number(input.value) })
    )
  );
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
  document.querySelectorAll('[data-start-item]').forEach(btn =>
    btn.addEventListener('click', () => openSession(btn.dataset.startItem, btn.dataset.preset))
  );
}
