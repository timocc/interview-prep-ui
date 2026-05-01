const VIEWS = ['dashboard', 'planner', 'today', 'backlog', 'review'];

export function createRouter(views, shell) {
  let current = null;
  let _store = null;

  function navigate(view) {
    if (!VIEWS.includes(view)) view = 'dashboard';
    current = view;
    window.location.hash = view;
    shell.setActiveNav(view);
    document.querySelectorAll('.view').forEach(el =>
      el.classList.toggle('active', el.dataset.view === view)
    );
    const state = _store.getState();
    views[view].render(state);
    views[view].bind(_store, navigate);
  }

  function renderCurrent() {
    if (!current) return;
    const state = _store.getState();
    views[current].render(state);
    views[current].bind(_store, navigate);
  }

  function init(store) {
    _store = store;
    store.subscribe(state => {
      shell.updateShell(state);
      renderCurrent();
    });
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1);
      navigate(VIEWS.includes(hash) ? hash : 'dashboard');
    });
    const hash = window.location.hash.slice(1);
    navigate(VIEWS.includes(hash) ? hash : 'dashboard');
  }

  return { navigate, init };
}
