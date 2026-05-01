window.InterviewPrepGitHubSync = (() => {
  const CONFIG_KEY = "interview-prep-github-config";
  const API = "https://api.github.com";

  function getConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function setConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c && c.owner && c.repo && c.token);
  }

  function headers(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    };
  }

  async function pull() {
    const c = getConfig();
    if (!c) return null;
    const path = c.statePath || "progress/state.json";
    const url = `${API}/repos/${c.owner}/${c.repo}/contents/${path}?ref=${c.branch || "main"}`;
    try {
      const res = await fetch(url, { headers: headers(c.token) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const data = await res.json();
      const decoded = atob(data.content.replace(/\n/g, ""));
      return { state: JSON.parse(decoded), sha: data.sha };
    } catch (_) { return null; }
  }

  async function push(state, label) {
    const c = getConfig();
    if (!c) return;
    const path = c.statePath || "progress/state.json";
    const branch = c.branch || "main";
    const url = `${API}/repos/${c.owner}/${c.repo}/contents/${path}`;

    // Get current SHA (needed for updates; null for first push)
    let sha = null;
    try {
      const res = await fetch(`${url}?ref=${branch}`, { headers: headers(c.token) });
      if (res.ok) {
        const data = await res.json();
        sha = data.sha;
      }
    } catch (_) {}

    const body = {
      message: label,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(state, null, 2)))),
      branch
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: "PUT",
      headers: headers(c.token),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub API ${res.status}`);
    }
  }

  async function testConnection() {
    const c = getConfig();
    if (!c) return { ok: false, message: "Not configured." };
    const url = `${API}/repos/${c.owner}/${c.repo}`;
    try {
      const res = await fetch(url, { headers: headers(c.token) });
      if (res.status === 401) return { ok: false, message: "Invalid token — check PAT scope." };
      if (res.status === 404) return { ok: false, message: "Repo not found — check owner/repo name." };
      if (!res.ok) return { ok: false, message: `GitHub API returned ${res.status}.` };
      return { ok: true, message: "Connected successfully." };
    } catch (e) {
      return { ok: false, message: `Network error: ${e.message}` };
    }
  }

  function showConfigDialog() {
    const dialog = document.getElementById("github-config-dialog");
    if (!dialog) return;
    const form = document.getElementById("github-config-form");
    const status = dialog.querySelector("[data-github-config-status]");
    const c = getConfig() || {};
    form.owner.value = c.owner || "";
    form.repo.value = c.repo || "";
    form.token.value = c.token || "";
    form.branch.value = c.branch || "main";
    form.statePath.value = c.statePath || "progress/state.json";
    if (status) status.textContent = "";
    dialog.showModal();

    form.onsubmit = async (e) => {
      e.preventDefault();
      const config = {
        owner: form.owner.value.trim(),
        repo: form.repo.value.trim(),
        token: form.token.value.trim(),
        branch: form.branch.value.trim() || "main",
        statePath: form.statePath.value.trim() || "progress/state.json"
      };
      setConfig(config);
      if (status) status.textContent = "Testing connection…";
      const result = await testConnection();
      if (status) status.textContent = result.message;
      if (result.ok) {
        updateSyncIndicator();
        setTimeout(() => dialog.close(), 1200);
      }
    };

    dialog.querySelector("[data-action='close-github-config']").onclick = () => dialog.close();
  }

  function updateSyncIndicator() {
    const dot = document.querySelector("[data-sync-dot]");
    if (!dot) return;
    dot.dataset.syncDot = isConfigured() ? "on" : "off";
    dot.title = isConfigured() ? "GitHub sync configured" : "GitHub sync not configured";
  }

  return { isConfigured, getConfig, setConfig, pull, push, showConfigDialog, updateSyncIndicator };
})();
