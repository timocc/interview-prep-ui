# Interview Prep Coach Product Spec

## Product intent

Interview Prep Coach is not a knowledge management app. It is an execution layer over an existing interview prep library. Its job is to reduce cognitive load and create forward motion for a mid-to-senior software engineer preparing for technical interviews.

The app answers three questions:

- What matters this week?
- What should I do today?
- What do I start right now?

## Target user

The target user already has abundant prep resources, mainly in Notion. The failure mode is low execution throughput: too much browsing, too much re-planning, and not enough logged focused practice.

## MVP information architecture

- Dashboard: shows this week, today’s recommendation, start-session CTA, active queue only, recent progress, and a small consistency signal.
- Weekly Planner: suggests a realistic plan, tracks planned versus actual hours, exposes weekly notes, and prompts an end-of-week retro.
- Today: focuses on one recommended task, explains why it was chosen, and starts a 60, 75, or 90 minute session.
- Backlog: narrows inventory into Must do soon, Active this week, Parked, and Done lanes with filters and promote/demote actions.
- Review: shows recent sessions, completion rate, consistency, repeated blockers, confidence trend, and reflection prompts.

## Domain model

### ResourceItem

Fields: `id`, `title`, `category`, `subcategory`, `difficulty`, `sourceDatabase`, `status`, `priority`, `weakAreaTags`, `estimatedMinutes`, `lastTouchedAt`, `confidence`, `notes`.

### WeeklyPlan

Fields: `weekOf`, `targetDSA`, `targetSystemDesign`, `targetDBInternals`, `plannedHours`, `actualHours`, `selectedItemIds`, `retrospective`, `nextWeekFocus`.

### DailySession

Fields: `date`, `itemId`, `plannedMinutes`, `actualMinutes`, `confidenceAfter`, `blocker`, `nextStep`, `completed`.

### Reflection

Fields: `id`, `weekOf`, `prompt`, `response`, `createdAt`.

### RecommendationReason

Fields: `label`, `weight`, `detail`.

## Recommendation heuristic

The recommender is intentionally simple and visible. Each non-done item receives a score:

- Active this week: strong boost, because continuity beats novelty.
- Must do soon: medium boost, because important backlog should enter the active slice.
- Not touched recently: capped boost based on days since last touch.
- Low confidence: boost when item confidence is 1 or 2.
- Weekly balance: boost if the item’s category is under the weekly target.
- Unfinished carryover: strong boost so missed work gets re-scoped rather than treated as failure.
- Weak-area relevance: small boost based on weak-area tags.
- Effort fit: boost when estimated minutes fit the target session length.
- Priority: small linear boost.
- Parked: penalty.
- Done: excluded.

This is implemented in `domain.js` as `scoreItem()` and `recommend()`. The UI renders the top reasons so the user can trust and override the coach.

## Behavioral rules

- Default to small scopes: the weekly plan selects 3 to 5 DSA items, 1 to 2 system design items, and optionally 1 DB internals item.
- Large backlog means small active slice: Dashboard and Today avoid showing the full backlog.
- Missed days re-scope down: unfinished carryover is recommended rather than shamed.
- Low confidence schedules reinforcement: confidence 1 or 2 keeps or returns the item to active.
- Repeated blockers surface in Review.
- Continuity is favored, but category balance prevents DSA-only drift.
- Pick for me uses the same transparent heuristic as the visible recommendation.

## Notion-derived structure

The source page exposed these databases and concepts:

- LC Problems w/ Waves: Wave, Category, Topic, Difficulty, Pattern, Key Concepts, Planned Date, Status.
- 130 Problems: similar DSA schema without waves.
- System Design Topics: Category, Phase, Priority, Status, Type, Date Start, Date End.
- Elite System Design Topics: Category, Depends on, Priority, Status, Type, Date Start, Date End, Unblocked.
- Weekly Goals concept: Week Of, DSA Goal, System Design Goal, DB Internals Goal, planned/actual hours, completed, retrospective, next week focus.
- Database Internals concept: topic, category, type, status, learning stage, database systems, learning source, time spent, confidence, hands-on practice, prerequisites, practical use cases, notes.

## Design direction

The UI is calm, technical, and opinionated:

- Desktop-first sidebar layout with responsive collapse.
- Neutral warm surfaces with a single teal accent.
- One primary CTA on each main view.
- Small data signals instead of heavy analytics.
- No marketing-style hero, decorative gradients, or generic productivity visuals.

## Persistence architecture

State persists in `localStorage` and is optionally synced to a remote via a connector. On load the connector pulls the latest state; on session finish it pushes a commit. The two sources are merged by session count (more sessions wins). Manual fallback is always available via Export/Import snapshot.

## Sync connector interface

The app ships `githubSync.js` as a reference connector (GitHub Contents API). Connectors are registered on `window.InterviewPrepGitHubSync` and must implement:

```js
isConfigured()                    // → bool
pull()                            // → Promise<{ state, sha } | null>
push(state, label)                // → Promise<void>
showConfigDialog()                // → void  (opens config UI)
updateSyncIndicator()             // → void  (refreshes sidebar dot)
```

The app assigns `window.InterviewPrepGitHubSync` at load time and treats it as an optional seam — all sync calls are guarded by `if (GS && GS.isConfigured())`. Any module that satisfies this interface can be swapped in without touching `app.js` or `domain.js`.

## Known limitations

- State merge is session-count-based; concurrent edits on two devices will lose the lower-count branch.
- The Notion adapter is a schema mapping/stub, not a live sync.
- No authentication — the connector PAT is stored in localStorage.

## Next product bets

- Notion read connector (pull ResourceItems from live Notion databases).
- Notion write connector (push weekly plan and session logs back to Notion).
- Calendar-aware daily planning with missed-day re-scoping.
- Conflict-safe state merge (timestamp or vector clock instead of session count).
