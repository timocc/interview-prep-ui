# Interview Prep Coach

A lightweight static app that turns a large technical interview prep backlog into a small weekly execution system.

**Live app:** https://timocc.github.io/interview-prep-ui/

## What it does

- Plans a realistic weekly slice from DSA, system design, and optional database internals.
- Recommends one task for today with a transparent scoring explanation.
- Starts and finishes 60, 75, or 90 minute study sessions.
- Logs confidence, blockers, next steps, actual minutes, and completion.
- Keeps the backlog in four lanes: Must do soon, Active this week, Parked, Done.
- Reviews recent sessions, completion rate, consistency, repeated blockers, and confidence trend.
- Syncs state to any remote via a pluggable connector (GitHub included).

## Run locally

No install step is required.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. If you start the server from the workspace root, open `/interview-prep-coach/`.

GitHub sync works from localhost — the GitHub API allows all origins. Sessions logged during local dev will commit to your configured state repo, so point sync at a `dev` branch while iterating, or leave it unconfigured locally.

## Files

- `index.html` — static shell, session dialog, GitHub sync config dialog.
- `styles.css` — responsive calm technical UI, light/dark theme support.
- `data.js` — seed data generated from `resources/notion_raw/` CSVs.
- `domain.js` — data model helpers, recommendation scoring, weekly plan generation, session logging.
- `notionAdapter.js` — Notion schema mapping and seed-merge adapter.
- `githubSync.js` — reference sync connector (GitHub Contents API).
- `app.js` — view rendering and interactions.
- `scripts/import-csv.js` — regenerates `data.js` from Notion CSV exports.
- `docs/product-spec.md` — product intent and domain model.
- `docs/notion-schema-mapping.md` — Notion mapping and adapter notes.
- `docs/connectors.md` — connector interface contract and implementation guide.

## Persistence

State is persisted in `localStorage` and optionally synced to a remote via a connector. The Backlog screen also has `Export snapshot` / `Import snapshot` for manual JSON backup.

On load, if a connector is configured and has newer state (more sessions), it wins over localStorage. On session finish, the connector pushes a commit.

## Sync connectors

The app ships with a GitHub connector (`githubSync.js`). The connector interface is small enough to implement against any backend — see `docs/connectors.md`.

To set up GitHub sync, click **GitHub Sync** in the sidebar and enter:

- **Owner** and **state repo** — use a private repo; your session notes and confidence scores will be committed there.
- **PAT** — classic with `repo` scope, or fine-grained with `Contents: read & write`. Stored only in your browser's localStorage.

The Pages app (public) and the state repo (private) are intentionally separate. You own your data.

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
