import { API } from './api.js';
import { showToast } from './components/toast.js';
import { esc } from './components/helpers.js';
import { renderCase } from './pages/case.js';
import { renderTerms } from './pages/terms.js';
import { renderTimeline } from './pages/timeline.js';
import { renderProblems } from './pages/problems.js';
import { renderObjectives } from './pages/objectives.js';
import { renderRandomizer } from './pages/randomizer.js';
import { renderVerification } from './pages/verification.js';
import { renderSettings } from './pages/settings.js';
import { renderPrint } from './pages/print.js';

const routes = { case: renderCase, terms: renderTerms, timeline: renderTimeline, problems: renderProblems, objectives: renderObjectives, randomizer: renderRandomizer, verification: renderVerification, settings: renderSettings, print: renderPrint };
const routeLabels = { case: 'Case materials', terms: 'Clarifying terms', timeline: 'Clinical timeline', problems: 'Problems & hypotheses', objectives: 'Learning objectives', randomizer: 'Presenter randomizer', verification: 'Verification board', settings: 'Session & settings', print: 'Act 1 report' };
const actOneRouteOrder = ['case', 'terms', 'timeline', 'problems', 'objectives'];
let session;
let members = [];
let saveChain = Promise.resolve();
const sidebarMedia = window.matchMedia('(max-width: 1050px)');
let desktopSidebarOpen = localStorage.getItem('vibepbl-sidebar') !== 'closed';

function disableAutofill(root = document) {
  const elements = [];
  if (root.matches?.('form,input,textarea,select')) elements.push(root);
  elements.push(...(root.querySelectorAll?.('form,input,textarea,select') || []));
  elements.forEach(element => element.setAttribute('autocomplete', 'off'));
}

new MutationObserver(records => {
  records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) disableAutofill(node);
  }));
}).observe(document.documentElement, { childList: true, subtree: true });

async function start() {
  try { [session, members] = await Promise.all([API.getSession(), API.getMembers()]); }
  catch (error) { document.getElementById('page').innerHTML = `<div class="card"><h2>Could not open local workspace</h2><p>${esc(String(error))}</p></div>`; return; }
  applyTheme(); render();
  setupWindowControls();
  setupSidebar();
  window.addEventListener('hashchange', render);
  document.querySelectorAll('[data-quick-print]').forEach(button => button.addEventListener('click', () => API.openPrintWindow()));
  document.querySelector('[data-browser-back]')?.addEventListener('click', () => moveThroughActOne(-1));
  document.querySelector('[data-browser-forward]')?.addEventListener('click', () => moveThroughActOne(1));
}

function moveThroughActOne(direction) {
  const currentIndex = actOneRouteOrder.indexOf(currentRoute());
  const startIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex = (startIndex + direction + actOneRouteOrder.length) % actOneRouteOrder.length;
  location.hash = `#/${actOneRouteOrder[nextIndex]}`;
}

function setupSidebar() {
  document.querySelectorAll('[data-sidebar-toggle]').forEach(button => button.addEventListener('click', toggleSidebar));
  sidebarMedia.addEventListener('change', syncSidebar);
  syncSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebarMedia.matches) sidebar.classList.toggle('open');
  else {
    desktopSidebarOpen = !desktopSidebarOpen;
    localStorage.setItem('vibepbl-sidebar', desktopSidebarOpen ? 'open' : 'closed');
  }
  syncSidebar();
}

function syncSidebar() {
  const shell = document.getElementById('app');
  const sidebar = document.getElementById('sidebar');
  const open = sidebarMedia.matches ? sidebar.classList.contains('open') : desktopSidebarOpen;
  shell.classList.toggle('sidebar-collapsed', !sidebarMedia.matches && !open);
  if (!sidebarMedia.matches) sidebar.classList.remove('open');
  document.querySelectorAll('[data-sidebar-toggle]').forEach(button => {
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close sidebar' : 'Open sidebar');
    button.title = open ? 'Close sidebar' : 'Open sidebar';
  });
}

function setupWindowControls() {
  const appWindow = window.__TAURI__?.window?.getCurrentWindow?.();
  if (!appWindow) return;
  document.getElementById('window-minimize').addEventListener('click', () => appWindow.minimize());
  document.getElementById('window-maximize').addEventListener('click', () => appWindow.toggleMaximize());
  document.getElementById('window-close').addEventListener('click', () => appWindow.close());
  document.getElementById('window-titlebar').addEventListener('dblclick', event => {
    if (!event.target.closest('.window-controls')) appWindow.toggleMaximize();
  });
}

function currentRoute() { return location.hash.replace(/^#\//, '').split('/')[0] || 'case'; }
function render() {
  const route = currentRoute();
  document.body.classList.toggle('print-preview-mode', route === 'print');
  document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
  document.getElementById('current-section').textContent = routeLabels[route] || routeLabels.case;
  document.getElementById('retro-address-text').textContent = `vibepbl://session/${route.replaceAll('_', '-')}`;
  document.getElementById('session-title').textContent = session.title;
  if (sidebarMedia.matches) { document.getElementById('sidebar').classList.remove('open'); syncSidebar(); }
  (routes[route] || renderCase)(context());
  disableAutofill(document);
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
  const execute = () => {
    saveChain = saveChain.catch(() => {}).then(() => API.saveField(databaseField, value));
    return saveChain.catch(error => { showToast(`Could not save: ${error}`, 'error'); });
  };
  clearTimeout(debounceTimers.get(field));
  if (immediate) return execute();
  debounceTimers.set(field, setTimeout(execute, 600));
}

function applyTheme() { document.documentElement.dataset.theme = session.theme || 'default'; }
start();
