import { API } from './api.js';
import { showToast } from './components/toast.js';
import { renderCase } from './pages/case.js';
import { renderTerms } from './pages/terms.js';
import { renderTimeline } from './pages/timeline.js';
import { renderProblems } from './pages/problems.js';
import { renderObjectives } from './pages/objectives.js';
import { renderRandomizer } from './pages/randomizer.js';
import { renderVerification } from './pages/verification.js';
import { renderSettings } from './pages/settings.js';

const routes = { case: renderCase, terms: renderTerms, timeline: renderTimeline, problems: renderProblems, objectives: renderObjectives, randomizer: renderRandomizer, verification: renderVerification, settings: renderSettings };
let session;
let members = [];
let saveChain = Promise.resolve();

async function start() {
  try { [session, members] = await Promise.all([API.getSession(), API.getMembers()]); }
  catch (error) { document.getElementById('page').innerHTML = `<div class="card"><h2>Could not open local workspace</h2><p>${String(error)}</p></div>`; return; }
  applyTheme(); render();
  window.addEventListener('hashchange', render);
  document.getElementById('sidebar-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('quick-print').addEventListener('click', () => API.openPrintWindow().catch(error => showToast(String(error), 'error')));
}

function currentRoute() { return location.hash.replace(/^#\//, '').split('/')[0] || 'case'; }
function render() {
  const route = currentRoute();
  document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
  document.getElementById('session-title').textContent = session.title;
  document.getElementById('sidebar').classList.remove('open');
  (routes[route] || renderCase)(context());
}

function context() {
  return {
    session, members, API, showToast, render,
    setField(field, value, immediate = true) {
      session[field] = value;
      if (field === 'theme') applyTheme();
      if (field === 'title') document.getElementById('session-title').textContent = value;
      return queueSave(field, value, immediate);
    },
    async refreshMembers() { members = await API.getMembers(); render(); },
    setSession(next) { session = next; applyTheme(); render(); }
  };
}

let debounceTimers = new Map();
function queueSave(field, value, immediate) {
  const databaseField = ({ caseText:'case_text', caseImages:'case_images', presenterAssignments:'presenter_assignments', isAct1Completed:'is_act1_completed' })[field] || field;
  const indicator = document.getElementById('save-indicator');
  indicator.textContent = 'Saving…'; indicator.className = 'save-indicator saving';
  const execute = () => {
    saveChain = saveChain.catch(() => {}).then(() => API.saveField(databaseField, value));
    return saveChain.then(() => { indicator.textContent = 'Saved'; indicator.className = 'save-indicator'; }).catch(error => { indicator.textContent = 'Save failed'; indicator.className = 'save-indicator error'; showToast(`Could not save: ${error}`, 'error'); });
  };
  clearTimeout(debounceTimers.get(field));
  if (immediate) return execute();
  debounceTimers.set(field, setTimeout(execute, 600));
}

function applyTheme() { document.documentElement.dataset.theme = session.theme || 'default'; }
start();
