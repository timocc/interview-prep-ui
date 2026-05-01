# Interview Prep Coach

A lightweight static app that turns a large technical interview prep backlog into a small weekly execution system.

## What it does

- Plans a realistic weekly slice from DSA, system design, and optional database internals.
- Recommends one task for today with a transparent scoring explanation.
- Starts and finishes 60, 75, or 90 minute study sessions.
- Logs confidence, blockers, next steps, actual minutes, and completion.
- Keeps the backlog in four lanes: Must do soon, Active this week, Parked, Done.
- Reviews recent sessions, completion rate, consistency, repeated blockers, and confidence trend.
- Includes a Notion schema mapping and adapter stub for future sync.

## Run locally

No install step is required.

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

If you are inside the project folder, the app is served directly. If you start the server from the workspace root, open `/interview-prep-coach/`.

## Files

- `index.html`: static shell and session dialog.
- `styles.css`: responsive calm technical UI, light/dark theme support.
- `data.js`: seed data modeled on the Notion workspace categories.
- `domain.js`: data model helpers, recommendation scoring, weekly plan generation, session logging.
- `notionAdapter.js`: future Notion sync seam and schema mapping.
- `app.js`: view rendering and interactions.
- `docs/product-spec.md`: concise product/spec document.
- `docs/notion-schema-mapping.md`: Notion mapping and adapter notes.

## Persistence

This MVP intentionally avoids browser storage because the deployed sandbox can block local storage APIs. State is in memory for the current session. The Backlog screen includes an `Export snapshot` action that downloads the current state as JSON. A future version should add either a small backend or Notion writeback.

## Recommendation heuristic

The recommender scores each non-done `ResourceItem` using:

- Active-this-week or must-do status.
- Days since the item was touched.
- Low confidence history.
- Whether the weekly category is under target.
- Unfinished carryover.
- Weak-area tags.
- Fit against the selected session duration.
- Priority.
- Penalties for parked or done work.

The UI shows the top reasons for the selected recommendation so the coach stays transparent rather than magical.
