window.InterviewPrepDomain = (() => {
  const categoryOrder = ["DSA", "System Design", "DB Internals"];
  const statusLabels = {
    must: "Must do soon",
    active: "Active this week",
    parked: "Parked",
    done: "Done"
  };

  function cloneSeed(seed) {
    return JSON.parse(JSON.stringify(seed));
  }

  function weekStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function daysSince(dateString) {
    if (!dateString) return 99;
    const then = new Date(`${dateString}T00:00:00`);
    const now = new Date();
    return Math.max(0, Math.round((now - then) / 86400000));
  }

  function hoursFromMinutes(minutes) {
    return Math.round((minutes / 60) * 10) / 10;
  }

  function getItem(state, id) {
    return state.resources.find((item) => item.id === id);
  }

  function getSelectedItems(state) {
    return state.weeklyPlan.selectedItemIds.map((id) => getItem(state, id)).filter(Boolean);
  }

  function getSessionsForItem(state, itemId) {
    return state.sessions.filter((session) => session.itemId === itemId);
  }

  function actualHours(state) {
    return hoursFromMinutes(state.sessions.reduce((sum, session) => sum + Number(session.actualMinutes || 0), 0));
  }

  function completionRate(state) {
    if (!state.sessions.length) return 0;
    const completed = state.sessions.filter((session) => session.completed).length;
    return Math.round((completed / state.sessions.length) * 100);
  }

  function consistency(state) {
    const uniqueDays = new Set(state.sessions.map((session) => session.date));
    const count = uniqueDays.size;
    return {
      activeDays: count,
      label: count >= 4 ? "steady" : count >= 2 ? "building" : "thin",
      copy: count >= 4 ? "Four active days this week." : count >= 2 ? "Two or more study days logged." : "One small session restarts momentum."
    };
  }

  /**
   * repeatedBlockers(state) — find words that appear in multiple blocker
   * strings, and return them with occurrence count and up to 2 example
   * sentences for context display.
   *
   * @returns {Array<{ word: string, count: number, examples: string[] }>}
   */
  function repeatedBlockers(state) {
    const words = new Map();
    const sentences = state.sessions.map((s) => s.blocker || "").filter(Boolean);
    const stop = new Set(["the", "and", "for", "too", "with", "before", "after", "long", "into", "from", "that", "this"]);
    sentences
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stop.has(word))
      .forEach((word) => words.set(word, (words.get(word) || 0) + 1));
    return [...words.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({
        word,
        count,
        examples: sentences.filter((s) => s.toLowerCase().includes(word)).slice(0, 2)
      }));
  }

  function confidenceTrend(state) {
    return state.sessions
      .slice(-6)
      .map((session) => ({ date: session.date.slice(5), confidence: Number(session.confidenceAfter || 0) }));
  }

  function categoryCounts(items) {
    return items.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});
  }

  function targetForCategory(plan, category) {
    if (category === "DSA") return plan.targetDSA;
    if (category === "System Design") return plan.targetSystemDesign;
    if (category === "DB Internals") return plan.targetDBInternals;
    return 1;
  }

  /**
   * scoreItem(state, item, options) — score a single resource item
   * for recommendation priority. Higher score = recommend sooner.
   *
   * Boost weights (approximate max contribution):
   *   activeBoost      +32   item is already in the committed weekly slice
   *   activeBoost      +22   item.status === "must" but not yet selected
   *   activeBoost      +16   item.status === "active" but not yet selected
   *   recencyBoost     +22   up to 1.25 pts/day since last touch (capped at 22)
   *   carryoverBoost   +20   selected AND last session was unfinished
   *   confidenceBoost  +18   confidence ≤ 2 (shaky; needs another rep)
   *   confidenceBoost  +7    confidence === 3 (workable; marginal boost)
   *   balanceBoost     +10   category count is under the weekly target
   *   weakAreaBoost    +12   has weakAreaTags (4 pts each, capped at 12)
   *   effortBoost      +12   estimated duration closely matches availableMinutes
   *   priorityBoost    +15   item.priority * 3 (max priority 5 → +15)
   *
   * Penalties:
   *   parkedPenalty    -12   item.status === "parked"
   *   donePenalty      -80   item.status === "done" (effectively removes it)
   */
  function scoreItem(state, item, options = {}) {
    const selected = state.weeklyPlan.selectedItemIds.includes(item.id);
    const sessions = getSessionsForItem(state, item.id);
    const lastSession = sessions.at(-1);
    const selectedItems = getSelectedItems(state);
    const counts = categoryCounts(selectedItems);
    const target = targetForCategory(state.weeklyPlan, item.category);
    const categoryUnderTarget = (counts[item.category] || 0) < target;
    const untouchedDays = daysSince(lastSession?.date || item.lastTouchedAt);
    const estimated = Number(item.estimatedMinutes || 60);
    const effortFit = Math.max(0, 1 - Math.abs(estimated - (options.availableMinutes || 75)) / 90);
    const confidence = Number(lastSession?.confidenceAfter || item.confidence || 3);
    const unfinishedCarryover = selected && lastSession && !lastSession.completed;
    const lowConfidence = confidence <= 2;
    const weakArea = item.weakAreaTags?.length ? 1 : 0;
    const activeBoost = selected ? 32 : item.status === "must" ? 22 : item.status === "active" ? 16 : 0;
    const recencyBoost = Math.min(22, untouchedDays * 1.25);
    const confidenceBoost = lowConfidence ? 18 : confidence === 3 ? 7 : 0;
    const balanceBoost = categoryUnderTarget ? 10 : 0;
    const carryoverBoost = unfinishedCarryover ? 20 : 0;
    const weakAreaBoost = weakArea ? Math.min(12, item.weakAreaTags.length * 4) : 0;
    const effortBoost = Math.round(effortFit * 12);
    const parkedPenalty = item.status === "parked" ? -12 : 0;
    const donePenalty = item.status === "done" ? -80 : 0;
    const priorityBoost = Number(item.priority || 3) * 3;
    const score =
      activeBoost +
      recencyBoost +
      confidenceBoost +
      balanceBoost +
      carryoverBoost +
      weakAreaBoost +
      effortBoost +
      parkedPenalty +
      donePenalty +
      priorityBoost;

    const reasons = [];
    if (selected) reasons.push({ label: "Active this week", weight: activeBoost, detail: "already in the committed weekly slice" });
    if (item.status === "must" && !selected) reasons.push({ label: "Must-do soon", weight: activeBoost, detail: "marked as high-priority backlog" });
    if (untouchedDays >= 7) reasons.push({ label: "Not touched recently", weight: Math.round(recencyBoost), detail: `${untouchedDays} days since last touch` });
    if (lowConfidence) reasons.push({ label: "Low confidence", weight: confidenceBoost, detail: `current confidence is ${confidence}/5` });
    if (categoryUnderTarget) reasons.push({ label: "Weekly balance", weight: balanceBoost, detail: `${item.category} is under target` });
    if (unfinishedCarryover) reasons.push({ label: "Unfinished carryover", weight: carryoverBoost, detail: "continue before adding more inventory" });
    if (weakAreaBoost) reasons.push({ label: "Weak-area match", weight: weakAreaBoost, detail: item.weakAreaTags.slice(0, 3).join(", ") });
    if (effortBoost >= 8) reasons.push({ label: "Effort fit", weight: effortBoost, detail: `${estimated} min fits the selected preset` });

    return {
      itemId: item.id,
      score: Math.round(score),
      reasons: reasons.sort((a, b) => b.weight - a.weight).slice(0, 5)
    };
  }

  function recommend(state, options = {}) {
    const candidates = state.resources.filter((item) => item.status !== "done");
    const scored = candidates.map((item) => ({ item, recommendation: scoreItem(state, item, options) }));
    scored.sort((a, b) => b.recommendation.score - a.recommendation.score);
    return scored[0];
  }

  /**
   * recommendWithContext(state) — compute primary recommendation plus two
   * contextual alternates in a single pass.
   *
   * Returns:
   *   primary       — highest-scoring non-done item (75-min default)
   *   fallback30    — highest-scoring non-done item at availableMinutes=30
   *   reinforcement — highest-scoring item excluding primary, only when
   *                   primary effective confidence ≤ 2; null otherwise
   */
  function recommendWithContext(state) {
    const primary = recommend(state, { availableMinutes: 75 });
    const fallback30 = recommend(state, { availableMinutes: 30 });

    const primarySessions = primary ? getSessionsForItem(state, primary.item.id) : [];
    const primaryConf = Number(primarySessions.at(-1)?.confidenceAfter ?? primary?.item.confidence ?? 3);

    let reinforcement = null;
    if (primary && primaryConf <= 2) {
      const candidates = state.resources.filter(
        (item) => item.status !== "done" && item.id !== primary.item.id
      );
      const scored = candidates
        .map((item) => ({ item, recommendation: scoreItem(state, item, { availableMinutes: 75 }) }))
        .sort((a, b) => b.recommendation.score - a.recommendation.score);
      reinforcement = scored[0] ?? null;
    }

    return { primary, fallback30, reinforcement };
  }

  /**
   * autoSuggestPlan(state) — rebuild selectedItemIds from scratch using
   * scored ordering. Unfinished low-confidence items from the prior plan
   * are preserved unconditionally before slots are filled by scoring.
   */
  function autoSuggestPlan(state) {
    const current = state.weeklyPlan;
    const selected = [];

    // Force-carry items that were selected, unfinished, and low-confidence
    state.resources.forEach((item) => {
      if (!current.selectedItemIds.includes(item.id)) return;
      if (item.status === "done") return;
      const sessions = getSessionsForItem(state, item.id);
      const lastSession = sessions.at(-1);
      const conf = Number(lastSession?.confidenceAfter ?? item.confidence ?? 3);
      if (lastSession && !lastSession.completed && conf <= 2) {
        selected.push(item.id);
      }
    });

    // Count forced items per category against targets
    const seededCounts = selected.reduce((acc, id) => {
      const item = getItem(state, id);
      if (item) acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    const byCategory = (category) =>
      state.resources
        .filter((item) => item.category === category && item.status !== "done" && !selected.includes(item.id))
        .map((item) => ({ item, recommendation: scoreItem({ ...state, weeklyPlan: { ...current, selectedItemIds: selected } }, item) }))
        .sort((a, b) => b.recommendation.score - a.recommendation.score)
        .map(({ item }) => item);

    const take = (category, target, min, max) =>
      Math.max(0, Math.max(min, Math.min(max, target)) - (seededCounts[category] || 0));

    byCategory("DSA")
      .slice(0, take("DSA", current.targetDSA, 3, 5))
      .forEach((item) => selected.push(item.id));
    byCategory("System Design")
      .slice(0, take("System Design", current.targetSystemDesign, 1, 2))
      .forEach((item) => selected.push(item.id));
    byCategory("DB Internals")
      .slice(0, take("DB Internals", current.targetDBInternals, 0, 1))
      .forEach((item) => selected.push(item.id));

    return [...new Set(selected)];
  }

  /**
   * rescope(state) — proportionally reduce weekly targets based on
   * remaining weekdays. Does NOT mutate state; caller applies the patch.
   *
   * @returns {{ targetDSA: number, targetSystemDesign: number, targetDBInternals: number }}
   */
  function rescope(state) {
    const day = new Date().getDay(); // 0=Sun
    const idx = day === 0 ? 6 : day - 1; // Mon=0 … Sun=6
    const remaining = Math.max(0, 5 - idx);
    const fraction = remaining / 5;
    const scale = (t) => Math.max(1, Math.round(t * fraction));
    const p = state.weeklyPlan;
    return {
      targetDSA: scale(p.targetDSA),
      targetSystemDesign: scale(p.targetSystemDesign),
      targetDBInternals: scale(p.targetDBInternals)
    };
  }

  function momentumMessage(state) {
    const con = consistency(state);
    const rate = completionRate(state);
    if (con.activeDays === 0) return "No judgment. Start with a 60-minute session and make the week real.";
    if (rate < 40) return "Momentum is fragile. Re-scope down before adding anything new.";
    if (con.activeDays >= 3) return "Good cadence. Keep continuity and avoid backlog browsing.";
    return "The system is warming up. One more logged session matters more than a perfect plan.";
  }

  function promote(state, id) {
    const item = getItem(state, id);
    if (!item || item.status === "done") return;
    if (item.status === "parked") item.status = "must";
    else if (item.status === "must") item.status = "active";
    if (item.status === "active" && !state.weeklyPlan.selectedItemIds.includes(id)) {
      state.weeklyPlan.selectedItemIds.push(id);
    }
  }

  function demote(state, id) {
    const item = getItem(state, id);
    if (!item || item.status === "done") return;
    if (item.status === "active") item.status = "must";
    else if (item.status === "must") item.status = "parked";
    state.weeklyPlan.selectedItemIds = state.weeklyPlan.selectedItemIds.filter((itemId) => itemId !== id);
  }

  function completeItem(state, id) {
    const item = getItem(state, id);
    if (item) {
      item.status = "done";
      item.confidence = Math.max(Number(item.confidence || 1), 4);
    }
  }

  function addSession(state, session) {
    const item = getItem(state, session.itemId);
    const datedSession = {
      id: `session-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      ...session
    };
    state.sessions.push(datedSession);
    if (item) {
      item.lastTouchedAt = datedSession.date;
      item.confidence = Number(datedSession.confidenceAfter);
      if (datedSession.completed) completeItem(state, item.id);
      if (!datedSession.completed && Number(datedSession.confidenceAfter) <= 2) {
        item.status = "active";
        if (!state.weeklyPlan.selectedItemIds.includes(item.id)) state.weeklyPlan.selectedItemIds.push(item.id);
      }
    }
    state.weeklyPlan.actualHours = actualHours(state);
    return datedSession;
  }

  return {
    actualHours,
    addSession,
    autoSuggestPlan,
    categoryOrder,
    cloneSeed,
    completionRate,
    confidenceTrend,
    consistency,
    daysSince,
    demote,
    getItem,
    getSelectedItems,
    hoursFromMinutes,
    momentumMessage,
    promote,
    recommend,
    recommendWithContext,
    repeatedBlockers,
    rescope,
    scoreItem,
    statusLabels,
    weekStart
  };
})();
