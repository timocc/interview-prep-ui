import * as D from '../domain.js';
import { esc, itemMeta, tags } from '../utils.js';
import { openSession, setStatus, exportSnapshot, importSnapshot } from '../shell.js';

export function render(state) {
  const view = document.querySelector('[data-view="backlog"]');
  const category = view.dataset.category || 'All';
  const difficulty = view.dataset.difficulty || 'All';
  const filter = item =>
    (category === 'All' || item.category === category) &&
    (difficulty === 'All' || item.difficulty === difficulty);
  const lanes = ['must', 'active', 'parked', 'done'];

  view.innerHTML = `
    <section class="backlog-layout" aria-labelledby="backlog-title">
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Backlog</p>
            <h2 id="backlog-title">Narrow the backlog, do not browse it</h2>
          </div>
          <div class="button-row">
            <button class="button secondary" type="button" data-action="export-snapshot">Export snapshot</button>
            <button class="button ghost" type="button" data-action="import-snapshot">Import snapshot</button>
          </div>
        </div>
        <div class="filter-row">
          <label>Category
            <select data-filter="category">
              ${['All', 'DSA', 'System Design', 'DB Internals'].map(v => `<option ${v === category ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
          <label>Difficulty
            <select data-filter="difficulty">
              ${['All', 'Easy', 'Medium', 'Hard'].map(v => `<option ${v === difficulty ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
      <div class="callout">
        <strong>Browsing guardrail:</strong> promote at most two new items. The coach will keep the active queue small and carry unfinished work forward.
      </div>
      <div class="lanes">
        ${lanes.map(lane => {
          const items = state.resources.filter(item => item.status === lane && filter(item));
          return `<section class="lane">
            <header><p class="eyebrow">${D.statusLabels[lane]}</p><h3>${items.length} items</h3></header>
            <div class="item-list">
              ${items.map(item => `
                <article class="item-row">
                  <div>
                    <p class="title-line">${esc(item.title)}</p>
                    <p class="meta-line">${esc(itemMeta(item))}</p>
                    ${tags(item, 2)}
                  </div>
                  <div class="row-actions">
                    ${lane !== 'done' ? `<button class="button small secondary" type="button" data-promote="${item.id}">Promote</button>` : ''}
                    ${lane !== 'done' ? `<button class="button small ghost" type="button" data-demote="${item.id}">Demote</button>` : ''}
                    <button class="button small ghost" type="button" data-start-item="${item.id}">Start</button>
                  </div>
                </article>`).join('')}
            </div>
          </section>`;
        }).join('')}
      </div>
    </section>`;
}

export function bind(store, navigate) {
  const view = document.querySelector('[data-view="backlog"]');

  document.querySelectorAll('[data-promote]').forEach(btn =>
    btn.addEventListener('click', () => {
      store.promote(btn.dataset.promote);
      setStatus('Promoted. Active slice updated without expanding the whole backlog.');
    })
  );
  document.querySelectorAll('[data-demote]').forEach(btn =>
    btn.addEventListener('click', () => {
      store.demote(btn.dataset.demote);
      setStatus('Demoted. The queue got narrower.');
    })
  );
  document.querySelectorAll('[data-start-item]').forEach(btn =>
    btn.addEventListener('click', () => openSession(btn.dataset.startItem))
  );
  document.querySelectorAll('[data-filter]').forEach(select =>
    select.addEventListener('change', () => {
      view.dataset[select.dataset.filter] = select.value;
      render(store.getState());
      bind(store, navigate);
    })
  );
  document.querySelector('[data-action="export-snapshot"]')?.addEventListener('click', exportSnapshot);
  document.querySelector('[data-action="import-snapshot"]')?.addEventListener('click', importSnapshot);
}
