import { createStore } from './store.js';
import { createRouter } from './router.js';
import * as shell from './shell.js';
import * as dashboard from './views/dashboard.js';
import * as planner from './views/planner.js';
import * as today from './views/today.js';
import * as backlog from './views/backlog.js';
import * as review from './views/review.js';

const store = createStore();
const router = createRouter({ dashboard, planner, today, backlog, review }, shell);

shell.init(store, router);
router.init(store);
store.init(); // async: pull from GitHub connector if configured
