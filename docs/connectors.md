# Sync Connectors

The app delegates remote persistence to a connector registered on `window.InterviewPrepGitHubSync`. The name is historical — any backend can implement the interface.

## Interface contract

```js
// Returns true if the connector has enough config to attempt a sync.
isConfigured() → bool

// Fetches the latest remote state. Returns null on 404 or network error.
// sha (or equivalent) is passed back to push() to enable atomic updates.
pull() → Promise<{ state: AppState, sha: string } | null>

// Persists state to the remote. label is a human-readable commit/entry message.
// Should throw on unrecoverable errors so the caller can surface them.
push(state: AppState, label: string) → Promise<void>

// Opens the connector's configuration UI (modal, drawer, etc.).
showConfigDialog() → void

// Refreshes the sidebar sync indicator dot (green = configured, grey = not set).
updateSyncIndicator() → void
```

`AppState` is the full object stored in `localStorage` under `interview-prep-coach-state`:

```js
{
  resources: ResourceItem[],
  sessions: DailySession[],
  weeklyPlan: WeeklyPlan
}
```

## How app.js uses the connector

```js
const GS = window.InterviewPrepGitHubSync;

// On load — pull wins if it has >= sessions than localStorage
if (GS && GS.isConfigured()) {
  const result = await GS.pull();
  if (result && result.state.sessions.length >= state.sessions.length) {
    state = result.state;
    persist();
    render();
  }
}

// After every session finish
if (GS && GS.isConfigured()) {
  GS.push(state, label)
    .then(() => setSyncStatus("Synced ✓", 3000))
    .catch(() => setSyncStatus("Sync failed", 5000));
}
```

All calls are guarded — the app works fully offline if no connector is registered or configured.

## Reference implementation

`githubSync.js` uses the GitHub Contents API:

- `pull` → `GET /repos/{owner}/{repo}/contents/{path}`
- `push` → `PUT /repos/{owner}/{repo}/contents/{path}` (requires SHA from pull for updates)
- Config stored in `localStorage` under `interview-prep-github-config`

State file defaults to `progress/state.json`. Commit messages use the format:

```
session: Two Sum · 75 min · confidence 4/5 · 2026-04-30
```

## Writing a custom connector

Any module that sets `window.InterviewPrepGitHubSync` and satisfies the interface above will work. The script tag just needs to appear after `notionAdapter.js` and before `app.js` in `index.html`.

Example minimal connector (in-memory, for testing):

```js
window.InterviewPrepGitHubSync = (() => {
  let stored = null;
  return {
    isConfigured: () => true,
    pull: async () => stored,
    push: async (state, label) => { stored = { state, sha: Date.now().toString() }; },
    showConfigDialog: () => {},
    updateSyncIndicator: () => {}
  };
})();
```
