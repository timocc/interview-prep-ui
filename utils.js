export const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function itemMeta(item) {
  return `${item.category} · ${item.subcategory} · ${item.difficulty} · ${item.estimatedMinutes} min`;
}

export function tags(item, limit = 3) {
  return `
    <div class="tag-list">
      <span class="tag">${esc(item.sourceDatabase)}</span>
      ${item.weakAreaTags
        .slice(0, limit)
        .map(tag => `<span class="tag">${esc(tag)}</span>`)
        .join('')}
      <span class="tag ${item.confidence <= 2 ? 'error' : item.confidence >= 4 ? 'success' : 'warning'}">confidence ${item.confidence}/5</span>
    </div>`;
}

export function recommendationHtml(rec) {
  const { item, recommendation } = rec;
  return `
    <article class="recommendation-card" data-testid="card-recommendation">
      <div>
        <p class="eyebrow">Recommended now · score ${recommendation.score}</p>
        <p class="recommendation-title">${esc(item.title)}</p>
        <p class="muted">${esc(itemMeta(item))}</p>
      </div>
      <div class="reason-list">
        ${recommendation.reasons
          .map(reason => `
            <div class="reason-row">
              <span><strong>${esc(reason.label)}</strong> ${esc(reason.detail)}</span>
              <span>+${reason.weight}</span>
            </div>`)
          .join('')}
      </div>
      <div class="button-row">
        <button class="button primary" type="button" data-start-item="${item.id}">Start this session</button>
        <button class="button secondary" type="button" data-view-item="${item.id}">Keep in queue</button>
      </div>
    </article>`;
}

export function queueRows(items, limit = 8) {
  return items
    .slice(0, limit)
    .map(item => `
      <article class="queue-row" data-testid="row-queue-${item.id}">
        <div>
          <p class="title-line">${esc(item.title)}</p>
          <p class="meta-line">${esc(itemMeta(item))}</p>
        </div>
        <button class="button small secondary" type="button" data-start-item="${item.id}">Start</button>
      </article>`)
    .join('');
}
