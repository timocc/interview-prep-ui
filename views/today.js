import * as D from '../domain.js';
import { esc, itemMeta } from '../utils.js';
import { openSession } from '../shell.js';

function buildCoachStatement(topReason, item) {
  if (!topReason) return `Score ${item.confidence}/5. Start here.`;
  const conf = item.confidence ?? 3;
  if (topReason.label === 'Unfinished carryover') return `You left this unfinished. Confidence ${conf}/5 needs another rep.`;
  if (topReason.label === 'Low confidence') return `Confidence is ${conf}/5 — shaky ground. Another focused session now prevents cramming later.`;
  if (topReason.label === 'Not touched recently') return `${topReason.detail}. Gaps this long let retention decay. Re-engage before it gets harder.`;
  if (topReason.label === 'Must-do soon') return `This is tagged must-do and hasn't been started this week. Clock is ticking.`;
  if (topReason.label === 'Weekly balance') return `${item.category} is under its weekly target. One session restores balance.`;
  if (topReason.label === 'Active this week') return `Already in your committed slice. Keep continuity — don't swap for something new.`;
  return `${topReason.label}: ${topReason.detail}.`;
}

export function render(state) {
  const { primary, fallback30, reinforcement } = D.recommendWithContext(state);
  if (!primary) {
    document.querySelector('[data-view="today"]').innerHTML =
      `<section class="panel"><p class="muted">No items to recommend. Promote something from the backlog.</p></section>`;
    return;
  }
  const item = primary.item;
  const topReason = primary.recommendation.reasons[0];
  const coachStatement = buildCoachStatement(topReason, item);

  document.querySelector('[data-view="today"]').innerHTML = `
    <section class="panel" aria-labelledby="today-title">
      <div class="panel-header">
        <div><p class="eyebrow">Today</p><h2 id="today-title">One clear task</h2></div>
        <span class="tag">${esc(D.momentumMessage(state))}</span>
      </div>
      <div class="coach-decision" data-testid="coach-decision">
        <div>
          <p class="coach-headline">Do this now</p>
          <p class="coach-item-title">${esc(item.title)}</p>
          <p class="muted" style="margin-top:var(--space-2)">${esc(itemMeta(item))}</p>
        </div>
        <blockquote class="coach-reason-callout">${esc(coachStatement)}</blockquote>
        <div class="coach-cta-row">
          ${[60, 75, 90].map(m =>
            `<button class="button primary" type="button" data-start-item="${item.id}" data-preset="${m}">${m} min</button>`
          ).join('')}
          <button class="button secondary" type="button" data-view-item="${item.id}">Keep in queue</button>
        </div>
      </div>
      ${fallback30 && fallback30.item.id !== item.id ? `
        <div class="coach-secondary-card" style="margin-top:var(--space-4)">
          <div>
            <p class="coach-secondary-label">Only have 30 minutes?</p>
            <p class="coach-secondary-title">${esc(fallback30.item.title)}</p>
          </div>
          <button class="button small secondary" type="button" data-start-item="${fallback30.item.id}" data-preset="30">Start 30 min</button>
        </div>` : ''}
      ${reinforcement ? `
        <div class="coach-secondary-card" style="margin-top:var(--space-3)">
          <div>
            <p class="coach-secondary-label">Also worth a quick review</p>
            <p class="coach-secondary-title">${esc(reinforcement.item.title)}
              <span class="tag ${reinforcement.item.confidence <= 2 ? 'error' : 'warning'}" style="margin-left:var(--space-2)">confidence ${reinforcement.item.confidence}/5</span>
            </p>
          </div>
          <button class="button small secondary" type="button" data-start-item="${reinforcement.item.id}" data-preset="30">Review 30 min</button>
        </div>` : ''}
    </section>`;
}

export function bind(store, navigate) {
  document.querySelectorAll('[data-start-item]').forEach(btn =>
    btn.addEventListener('click', () => openSession(btn.dataset.startItem, btn.dataset.preset))
  );
}
