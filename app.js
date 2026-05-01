(() => {
  const D = window.InterviewPrepDomain;

  // ── Persistence ──────────────────────────────────────────────
  const STORAGE_KEY = "interview-prep-coach-state";

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function loadPersistedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.resources) || typeof parsed.weeklyPlan !== "object") return null;
      return parsed;
    } catch (_) { return null; }
  }

  // initState() merges fresh resource definitions (data.js) into any saved
  // session/plan data in localStorage. This means re-running the CSV converter
  // and refreshing the page picks up new problems without losing session history,
  // confidence ratings, or promotions.
  function initState() {
    const seed = D.cloneSeed(window.InterviewPrepSeed);
    const saved = loadPersistedState();
    if (!saved) return seed;

    const NA = window.InterviewPrepNotionAdapter;
    if (NA && NA.mergeResources) {
      // Merge: content fields update from seed; status/confidence/lastTouchedAt
      // preserved from saved. New items in seed are appended; removed items parked.
      saved.resources = NA.mergeResources(saved.resources, seed.resources);
    } else {
      // Fallback: append new resource IDs not already in saved state
      const savedIds = new Set(saved.resources.map((r) => r.id));
      seed.resources.forEach((r) => { if (!savedIds.has(r.id)) saved.resources.push(r); });
    }
    return saved;
  }

  let state = initState();
  if (!state.weeklyPlan.weekOf) state.weeklyPlan.weekOf = D.weekStart();

  let currentView = "dashboard";
  let activeSessionItemId = null;
  let activeStartedAt = null;
  let timerHandle = null;
  let planFieldTimer = null;

  const navItems = [
    ["dashboard", "Dashboard"],
    ["planner", "Weekly Planner"],
    ["today", "Today"],
    ["backlog", "Backlog"],
    ["review", "Review"]
  ];

  const GS = window.InterviewPrepGitHubSync;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  function setStatus(message) {
    $("[data-status-line]").firstChild.textContent = message;
  }

  function setSyncStatus(message, autoClearMs = 0) {
    const el = $("[data-sync-status]");
    if (!el) return;
    el.textContent = message;
    if (autoClearMs) setTimeout(() => { el.textContent = ""; }, autoClearMs);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $("[data-theme-toggle]").textContent = theme === "dark" ? "Use light theme" : "Use dark theme";
  }

  function initTheme() {
    const preferred = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(preferred);
    $("[data-theme-toggle]").addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || preferred;
      setTheme(current === "dark" ? "light" : "dark");
    });
  }

  function renderNav() {
    $("[data-nav]").innerHTML = navItems
      .map(
        ([key, label]) =>
          `<button class="nav-link ${currentView === key ? "active" : ""}" type="button" data-nav-target="${key}">${label}</button>`
      )
      .join("");
    $$("[data-nav-target]").forEach((button) =>
      button.addEventListener("click", () => {
        currentView = button.dataset.navTarget;
        render();
      })
    );
  }

  function renderShell() {
    const selected = D.getSelectedItems(state);
    const byCat = selected.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});
    $("[data-week-of]").textContent = state.weeklyPlan.weekOf;
    $("[data-page-title]").textContent = navItems.find(([key]) => key === currentView)?.[1] || "Dashboard";
    $("[data-active-slice-summary]").textContent = `${selected.length} items: ${D.categoryOrder
      .map((cat) => `${byCat[cat] || 0} ${cat}`)
      .join(" · ")}`;
  }

  function itemMeta(item) {
    return `${item.category} · ${item.subcategory} · ${item.difficulty} · ${item.estimatedMinutes} min`;
  }

  function tags(item, limit = 3) {
    return `
      <div class="tag-list">
        <span class="tag">${esc(item.sourceDatabase)}</span>
        ${item.weakAreaTags
          .slice(0, limit)
          .map((tag) => `<span class="tag">${esc(tag)}</span>`)
          .join("")}
        <span class="tag ${item.confidence <= 2 ? "error" : item.confidence >= 4 ? "success" : "warning"}">confidence ${item.confidence}/5</span>
      </div>`;
  }

  function recommendationHtml(rec) {
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
            .map(
              (reason) => `
                <div class="reason-row">
                  <span><strong>${esc(reason.label)}</strong> ${esc(reason.detail)}</span>
                  <span>+${reason.weight}</span>
                </div>`
            )
            .join("")}
        </div>
        <div class="button-row">
          <button class="button primary" type="button" data-start-item="${item.id}">Start this session</button>
          <button class="button secondary" type="button" data-view-item="${item.id}">Keep in queue</button>
        </div>
      </article>
    `;
  }

  function queueRows(items, limit = 8) {
    return items
      .slice(0, limit)
      .map(
        (item) => `
          <article class="queue-row" data-testid="row-queue-${item.id}">
            <div>
              <p class="title-line">${esc(item.title)}</p>
              <p class="meta-line">${esc(itemMeta(item))}</p>
            </div>
            <button class="button small secondary" type="button" data-start-item="${item.id}">Start</button>
          </article>`
      )
      .join("");
  }

  function renderDashboard() {
    const rec = D.recommend(state);
    const selected = D.getSelectedItems(state);
    const con = D.consistency(state);
    const recent = state.sessions.slice(-4).reverse();
    const view = $('[data-view="dashboard"]');
    view.innerHTML = `
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
            <div class="progress-bar" aria-label="Planned versus actual hours"><span style="width:${Math.min(100, (D.actualHours(state) / state.weeklyPlan.plannedHours) * 100)}%"></span></div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <div>
                <p class="eyebrow">Today</p>
                <h2>One thing to start</h2>
              </div>
            </div>
            ${recommendationHtml(rec)}
          </section>
        </div>

        <aside>
          <section class="panel">
            <div class="panel-header">
              <div>
                <p class="eyebrow">Active queue only</p>
                <h2>No browsing mode</h2>
              </div>
            </div>
            <div class="queue-list">${queueRows(selected)}</div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <div>
                <p class="eyebrow">Recent progress</p>
                <h2>Last sessions</h2>
              </div>
            </div>
            <div class="session-list">
              ${recent
                .map((session) => {
                  const item = D.getItem(state, session.itemId);
                  return `<article class="session-row">
                    <div><p class="title-line">${esc(item?.title || "Unknown item")}</p><p class="meta-line">${session.date} · ${session.actualMinutes} min · confidence ${session.confidenceAfter}/5</p></div>
                    <span class="tag ${session.completed ? "success" : "warning"}">${session.completed ? "done" : "carryover"}</span>
                  </article>`;
                })
                .join("")}
            </div>
          </section>
        </aside>
      </div>
    `;
  }

  function renderPlanner() {
    const selected = D.getSelectedItems(state);
    const counts = selected.reduce((acc, item) => ((acc[item.category] = (acc[item.category] || 0) + 1), acc), {});
    $('[data-view="planner"]').innerHTML = `
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
            ${targetInput("targetDSA", "DSA items", state.weeklyPlan.targetDSA)}
            ${targetInput("targetSystemDesign", "System design", state.weeklyPlan.targetSystemDesign)}
            ${targetInput("targetDBInternals", "DB internals", state.weeklyPlan.targetDBInternals)}
            ${targetInput("plannedHours", "Planned hours", state.weeklyPlan.plannedHours)}
          </div>
          <div class="panel">
            <div class="panel-header">
              <div>
                <p class="eyebrow">Planned vs actual</p>
                <h3>${D.actualHours(state)}h logged of ${state.weeklyPlan.plannedHours}h planned</h3>
              </div>
              <span class="tag">${counts.DSA || 0}/${state.weeklyPlan.targetDSA} DSA · ${counts["System Design"] || 0}/${state.weeklyPlan.targetSystemDesign} SD · ${counts["DB Internals"] || 0}/${state.weeklyPlan.targetDBInternals} DB</span>
            </div>
            <div class="progress-bar"><span style="width:${Math.min(100, (D.actualHours(state) / state.weeklyPlan.plannedHours) * 100)}%"></span></div>
          </div>
          <div class="queue-list">${queueRows(selected, 12)}</div>
        </section>

        <aside class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Weekly notes</p>
              <h2>Retro prompts</h2>
            </div>
          </div>
          <label>Notes<textarea data-plan-field="retrospective" rows="5" placeholder="What worked, what didn't?">${esc(state.weeklyPlan.retrospective)}</textarea></label>
          <label>Next week focus<textarea data-plan-field="nextWeekFocus" rows="4">${esc(state.weeklyPlan.nextWeekFocus)}</textarea></label>
          <div class="reflection-list">
            ${["What got avoided?", "Which blocker repeated?", "What should be removed from active scope?", "What single pattern needs reinforcement?"]
              .map((prompt) => `<div class="retro-prompt"><span>${prompt}</span><span class="tag">answer Friday</span></div>`)
              .join("")}
          </div>
        </aside>
      </div>
    `;
  }

  function targetInput(name, label, value) {
    return `<div class="planner-target"><label>${label}<input data-plan-number="${name}" type="number" min="0" max="20" value="${value}" /></label></div>`;
  }

  // ── Coach statement builder ───────────────────────────────────
  function buildCoachStatement(topReason, item) {
    if (!topReason) return `Score ${item.confidence}/5. Start here.`;
    const conf = item.confidence ?? 3;
    if (topReason.label === "Unfinished carryover") return `You left this unfinished. Confidence ${conf}/5 needs another rep.`;
    if (topReason.label === "Low confidence") return `Confidence is ${conf}/5 — shaky ground. Another focused session now prevents cramming later.`;
    if (topReason.label === "Not touched recently") return `${topReason.detail}. Gaps this long let retention decay. Re-engage before it gets harder.`;
    if (topReason.label === "Must-do soon") return `This is tagged must-do and hasn't been started this week. Clock is ticking.`;
    if (topReason.label === "Weekly balance") return `${item.category} is under its weekly target. One session restores balance.`;
    if (topReason.label === "Active this week") return `Already in your committed slice. Keep continuity — don't swap for something new.`;
    return `${topReason.label}: ${topReason.detail}.`;
  }

  function renderToday() {
    const { primary, fallback30, reinforcement } = D.recommendWithContext(state);
    if (!primary) {
      $('[data-view="today"]').innerHTML = `<section class="panel"><p class="muted">No items to recommend. Promote something from the backlog.</p></section>`;
      return;
    }
    const item = primary.item;
    const topReason = primary.recommendation.reasons[0];
    const coachStatement = buildCoachStatement(topReason, item);

    $('[data-view="today"]').innerHTML = `
      <section class="panel" aria-labelledby="today-title">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Today</p>
            <h2 id="today-title">One clear task</h2>
          </div>
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
            ${[60, 75, 90]
              .map(
                (m) =>
                  `<button class="button primary" type="button" data-start-item="${item.id}" data-preset="${m}">${m} min</button>`
              )
              .join("")}
            <button class="button secondary" type="button" data-view-item="${item.id}">Keep in queue</button>
          </div>
        </div>

        ${fallback30 && fallback30.item.id !== item.id ? `
          <div class="coach-secondary-card" style="margin-top:var(--space-4)">
            <div>
              <p class="coach-secondary-label">Only have 30 minutes?</p>
              <p class="coach-secondary-title">${esc(fallback30.item.title)}</p>
            </div>
            <button class="button small secondary" type="button"
              data-start-item="${fallback30.item.id}" data-preset="30">Start 30 min</button>
          </div>` : ""}

        ${reinforcement ? `
          <div class="coach-secondary-card" style="margin-top:var(--space-3)">
            <div>
              <p class="coach-secondary-label">Also worth a quick review</p>
              <p class="coach-secondary-title">${esc(reinforcement.item.title)}
                <span class="tag ${reinforcement.item.confidence <= 2 ? "error" : "warning"}" style="margin-left:var(--space-2)">confidence ${reinforcement.item.confidence}/5</span>
              </p>
            </div>
            <button class="button small secondary" type="button"
              data-start-item="${reinforcement.item.id}" data-preset="30">Review 30 min</button>
          </div>` : ""}
      </section>
    `;
  }

  function renderBacklog() {
    const view = $('[data-view="backlog"]');
    const category = view.dataset.category || "All";
    const difficulty = view.dataset.difficulty || "All";
    const filter = (item) =>
      (category === "All" || item.category === category) && (difficulty === "All" || item.difficulty === difficulty);
    const lanes = ["must", "active", "parked", "done"];
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
                ${["All", "DSA", "System Design", "DB Internals"].map((v) => `<option ${v === category ? "selected" : ""}>${v}</option>`).join("")}
              </select>
            </label>
            <label>Difficulty
              <select data-filter="difficulty">
                ${["All", "Easy", "Medium", "Hard"].map((v) => `<option ${v === difficulty ? "selected" : ""}>${v}</option>`).join("")}
              </select>
            </label>
          </div>
        </div>
        <div class="callout">
          <strong>Browsing guardrail:</strong> promote at most two new items. The coach will keep the active queue small and carry unfinished work forward.
        </div>
        <div class="lanes">
          ${lanes
            .map((lane) => {
              const items = state.resources.filter((item) => item.status === lane && filter(item));
              return `<section class="lane">
                <header><p class="eyebrow">${D.statusLabels[lane]}</p><h3>${items.length} items</h3></header>
                <div class="item-list">
                  ${items
                    .map(
                      (item) => `<article class="item-row">
                        <div>
                          <p class="title-line">${esc(item.title)}</p>
                          <p class="meta-line">${esc(itemMeta(item))}</p>
                          ${tags(item, 2)}
                        </div>
                        <div class="row-actions">
                          ${lane !== "done" ? `<button class="button small secondary" type="button" data-promote="${item.id}">Promote</button>` : ""}
                          ${lane !== "done" ? `<button class="button small ghost" type="button" data-demote="${item.id}">Demote</button>` : ""}
                          <button class="button small ghost" type="button" data-start-item="${item.id}">Start</button>
                        </div>
                      </article>`
                    )
                    .join("")}
                </div>
              </section>`;
            })
            .join("")}
        </div>
      </section>
    `;
  }

  function renderReview() {
    const blockers = D.repeatedBlockers(state);
    const trend = D.confidenceTrend(state);
    $('[data-view="review"]').innerHTML = `
      <div class="review-grid">
        <section class="panel" aria-labelledby="review-title">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Review</p>
              <h2 id="review-title">Evidence, not guilt</h2>
            </div>
            <span class="tag">${D.completionRate(state)}% completion</span>
          </div>
          <div class="metric-grid">
            <div class="metric-card"><span class="eyebrow">Sessions</span><strong>${state.sessions.length}</strong><span class="muted">logged</span></div>
            <div class="metric-card"><span class="eyebrow">Streak signal</span><strong>${D.consistency(state).activeDays}d</strong><span class="muted">${esc(D.consistency(state).copy)}</span></div>
            <div class="metric-card"><span class="eyebrow">Actual hours</span><strong>${D.actualHours(state)}h</strong><span class="muted">this week</span></div>
          </div>
          <div class="session-list">
            ${state.sessions
              .slice()
              .reverse()
              .map((session) => {
                const item = D.getItem(state, session.itemId);
                return `<article class="session-row">
                  <div>
                    <p class="title-line">${esc(item?.title || "Unknown item")}</p>
                    <p class="meta-line">${session.date} · planned ${session.plannedMinutes} · actual ${session.actualMinutes} · confidence ${session.confidenceAfter}/5</p>
                    ${session.blocker ? `<p class="meta-line">Blocker: ${esc(session.blocker)}</p>` : ""}
                    ${session.nextStep ? `<p class="meta-line">Next: ${esc(session.nextStep)}</p>` : ""}
                  </div>
                  <span class="tag ${session.completed ? "success" : "warning"}">${session.completed ? "complete" : "needs follow-up"}</span>
                </article>`;
              })
              .join("")}
          </div>
        </section>

        <aside class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Patterns</p>
              <h2>Repeated blockers</h2>
            </div>
          </div>
          <div class="blocker-list">
            ${blockers.length
              ? blockers.map(({ word, count, examples }) => `
                  <div class="blocker-item">
                    <div class="blocker-header">
                      <span class="tag warning">${esc(word)} ×${count}</span>
                      <button class="button small ghost" type="button"
                        data-blocker-to-action="${esc(word)}">Make this a next step</button>
                    </div>
                    ${examples.map((ex) => `<p class="meta-line blocker-example">"${esc(ex)}"</p>`).join("")}
                  </div>`).join("")
              : `<span class="tag success">no repeated blocker yet</span>`}
          </div>

          <div class="panel-header" style="margin-top:var(--space-6)">
            <div>
              <p class="eyebrow">This week's retro</p>
              <h2>What happened?</h2>
            </div>
          </div>
          <label>Retro note
            <textarea data-plan-field="retrospective" rows="5"
              placeholder="What worked, what didn't?">${esc(state.weeklyPlan.retrospective)}</textarea>
          </label>

          <div class="panel">
            <p class="eyebrow">Confidence trend</p>
            <div class="mini-bars" aria-label="Confidence trend">
              ${trend.map((point) => `<span title="${point.date}: ${point.confidence}/5" style="height:${Math.max(8, point.confidence * 20)}%"></span>`).join("")}
            </div>
          </div>
          <div class="reflection-list">
            ${["What should get smaller next week?", "Which topic is ready for mock interview pressure?", "What belongs parked for now?"]
              .map((prompt) => `<div class="retro-prompt"><span>${prompt}</span></div>`)
              .join("")}
          </div>
        </aside>
      </div>
    `;
  }

  function bindActions() {
    $$("[data-start-item]").forEach((button) =>
      button.addEventListener("click", () => openSession(button.dataset.startItem, button.dataset.preset))
    );
    $$("[data-promote]").forEach((button) =>
      button.addEventListener("click", () => {
        D.promote(state, button.dataset.promote);
        persist();
        setStatus("Promoted. Active slice updated without expanding the whole backlog.");
        render();
      })
    );
    $$("[data-demote]").forEach((button) =>
      button.addEventListener("click", () => {
        D.demote(state, button.dataset.demote);
        persist();
        setStatus("Demoted. The queue got narrower.");
        render();
      })
    );
    $$("[data-filter]").forEach((select) =>
      select.addEventListener("change", () => {
        const view = $('[data-view="backlog"]');
        view.dataset[select.dataset.filter] = select.value;
        renderBacklog();
        bindActions();
      })
    );
    $$("[data-plan-number]").forEach((input) =>
      input.addEventListener("change", () => {
        state.weeklyPlan[input.dataset.planNumber] = Number(input.value);
        persist();
        render();
      })
    );
    $$("[data-plan-field]").forEach((input) =>
      input.addEventListener("input", () => {
        state.weeklyPlan[input.dataset.planField] = input.value;
        clearTimeout(planFieldTimer);
        planFieldTimer = setTimeout(persist, 600);
      })
    );
    $$("[data-action]").forEach((button) => {
      const action = button.dataset.action;
      if (action === "auto-plan") button.onclick = autoPlan;
      if (action === "rescope-week") button.onclick = rescopeWeek;
      if (action === "pick-for-me") button.onclick = pickForMe;
      if (action === "start-recommended") button.onclick = () => openSession(D.recommend(state).item.id);
      if (action === "export-snapshot") button.onclick = exportSnapshot;
      if (action === "import-snapshot") button.onclick = importSnapshot;
      if (action === "open-github-config" && GS) button.onclick = () => GS.showConfigDialog();
    });
    $$("[data-blocker-to-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const keyword = button.dataset.blockerToAction;
        const session = state.sessions
          .slice()
          .reverse()
          .find((s) => (s.blocker || "").toLowerCase().includes(keyword));
        if (session) {
          session.nextStep = session.nextStep
            ? `${session.nextStep}\n\n[From blocker "${keyword}"] Work through this pattern.`
            : `[From blocker "${keyword}"] Work through this pattern.`;
        } else {
          const existing = state.weeklyPlan.nextWeekFocus || "";
          state.weeklyPlan.nextWeekFocus = existing
            ? `${existing}\n\n[Blocker pattern] ${keyword}`
            : `[Blocker pattern] ${keyword}`;
        }
        persist();
        setStatus(`"${keyword}" added as a next step. Check the session log for context.`);
        render();
      });
    });
  }

  function autoPlan() {
    const previousIds = new Set(state.weeklyPlan.selectedItemIds);
    state.weeklyPlan.selectedItemIds = D.autoSuggestPlan(state);
    state.resources.forEach((item) => {
      if (state.weeklyPlan.selectedItemIds.includes(item.id) && item.status !== "done") item.status = "active";
    });

    const nextIds = new Set(state.weeklyPlan.selectedItemIds);
    const label = (id) => D.getItem(state, id)?.title ?? id;
    const added = [...nextIds].filter((id) => !previousIds.has(id));
    const removed = [...previousIds].filter((id) => !nextIds.has(id));
    const addedStr = added.length ? ` Added: ${added.map(label).join(", ")}.` : "";
    const removedStr = removed.length ? ` Removed: ${removed.map(label).join(", ")}.` : "";
    const msg = added.length || removed.length
      ? `Plan updated.${addedStr}${removedStr}`
      : "Plan updated. No changes from previous selection.";

    persist();
    setStatus(msg);
    render();
  }

  function rescopeWeek() {
    const previousIds = new Set(state.weeklyPlan.selectedItemIds);
    const patch = D.rescope(state);
    Object.assign(state.weeklyPlan, patch);
    state.weeklyPlan.selectedItemIds = D.autoSuggestPlan(state);
    state.resources.forEach((item) => {
      if (state.weeklyPlan.selectedItemIds.includes(item.id) && item.status !== "done") item.status = "active";
    });

    const nextIds = new Set(state.weeklyPlan.selectedItemIds);
    const label = (id) => D.getItem(state, id)?.title ?? id;
    const added = [...nextIds].filter((id) => !previousIds.has(id));
    const removed = [...previousIds].filter((id) => !nextIds.has(id));
    const addedStr = added.length ? ` Added: ${added.map(label).join(", ")}.` : "";
    const removedStr = removed.length ? ` Removed: ${removed.map(label).join(", ")}.` : "";

    persist();
    setStatus(
      `Rescoped to ${patch.targetDSA} DSA / ${patch.targetSystemDesign} SD / ${patch.targetDBInternals} DB.${addedStr}${removedStr}`
    );
    render();
  }

  function pickForMe() {
    const rec = D.recommend(state);
    setStatus(`Pick for me: ${rec.item.title}. Reason: ${rec.recommendation.reasons[0]?.detail || "highest score"}.`);
    currentView = "today";
    render();
  }

  function exportSnapshot() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-prep-coach-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Snapshot exported.");
  }

  function importSnapshot() {
    document.getElementById("import-file").click();
  }

  function initImport() {
    const input = document.getElementById("import-file");
    input.addEventListener("change", () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!Array.isArray(parsed.resources) || typeof parsed.weeklyPlan !== "object") {
            setStatus("Import failed: file does not look like an Interview Prep Coach snapshot.");
            return;
          }
          state = parsed;
          persist();
          render();
          setStatus("State restored from snapshot.");
        } catch (_) {
          setStatus("Import failed: could not parse JSON file.");
        }
        input.value = "";
      };
      reader.readAsText(file);
    });
  }

  function openSession(itemId, preset) {
    const item = D.getItem(state, itemId);
    if (!item) return;
    activeSessionItemId = itemId;
    activeStartedAt = null;
    const dialog = $("[data-session-dialog]");
    $("[data-session-title]").textContent = item.title;
    $("[data-session-context]").textContent = `${itemMeta(item)}. ${item.notes}`;
    $$("[name='plannedMinutes']").forEach((radio) => {
      radio.checked = radio.value === String(preset || item.estimatedMinutes || 60);
    });
    if (!$$("[name='plannedMinutes']").some((radio) => radio.checked)) $('[name="plannedMinutes"][value="75"]').checked = true;
    showSessionStage("start");
    dialog.showModal();
  }

  function showSessionStage(stage) {
    $$("[data-session-stage]").forEach((el) => el.classList.toggle("hidden", el.dataset.sessionStage !== stage));
  }

  function beginSession() {
    const planned = Number($("[name='plannedMinutes']:checked").value);
    activeStartedAt = Date.now();
    $('[name="actualMinutes"]').value = planned;
    $("[data-session-target]").textContent = `Target ${planned} minutes`;
    showSessionStage("finish");
    clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      const elapsed = Math.floor((Date.now() - activeStartedAt) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      $("[data-session-elapsed]").textContent = `${mm}:${ss}`;
    }, 1000);
  }

  function finishSession(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const plannedMinutes = Number($("[name='plannedMinutes']:checked").value);
    const session = {
      itemId: activeSessionItemId,
      plannedMinutes,
      actualMinutes: Number(form.actualMinutes.value || plannedMinutes),
      confidenceAfter: Number(form.confidenceAfter.value),
      blocker: form.blocker.value.trim(),
      nextStep: form.nextStep.value.trim(),
      completed: form.completed.checked
    };
    D.addSession(state, session);
    persist();
    clearInterval(timerHandle);
    $("[data-session-dialog]").close();
    form.reset();
    render();

    const item = D.getItem(state, session.itemId);
    if (GS && GS.isConfigured()) {
      const date = new Date().toISOString().slice(0, 10);
      const label = `session: ${item?.title ?? session.itemId} · ${session.actualMinutes} min · confidence ${session.confidenceAfter}/5 · ${date}`;
      setSyncStatus("Syncing…");
      GS.push(state, label)
        .then(() => {
          setSyncStatus("Synced ✓", 3000);
          setStatus("Session logged and synced to GitHub.");
        })
        .catch(() => {
          setSyncStatus("Sync failed", 5000);
          setStatus("Session logged. GitHub sync failed — check your config.");
        });
    } else {
      setStatus("Session logged. The next recommendation now accounts for confidence, carryover, and blockers.");
    }
  }

  function initSessionDialog() {
    $('[data-action="close-dialog"]').addEventListener("click", () => {
      clearInterval(timerHandle);
      $("[data-session-dialog]").close();
    });
    $('[data-action="begin-session"]').addEventListener("click", beginSession);
    $("[data-session-form]").addEventListener("submit", finishSession);
  }

  function render() {
    renderNav();
    renderShell();
    $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === currentView));
    renderDashboard();
    renderPlanner();
    renderToday();
    renderBacklog();
    renderReview();
    bindActions();
  }

  async function initFromGitHub() {
    if (!GS || !GS.isConfigured()) return;
    setSyncStatus("Loading from GitHub…");
    const result = await GS.pull();
    setSyncStatus("");
    if (!result) return;
    if (result.state.sessions.length >= state.sessions.length) {
      state = result.state;
      persist();
      render();
      setStatus("State loaded from GitHub.");
    }
    GS.updateSyncIndicator();
  }

  initTheme();
  initImport();
  initSessionDialog();
  render();
  if (GS) GS.updateSyncIndicator();
  initFromGitHub();
})();
