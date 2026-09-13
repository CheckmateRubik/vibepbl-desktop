import { esc, uid } from './helpers.js';

export const lookupIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
const bookIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v15M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z"/></svg>';
const modes = {
  mesh:{label:'Medical definition',provider:'mesh',help:'Instant offline definitions from the bundled 2026 NLM MeSH vocabulary.'},
  medline:{label:'Health overview',provider:'medline',help:'Longer explanations and related health topics from MedlinePlus.'},
  web:{label:'Web search',help:'Search other websites in a separate VibePBL browser window.'}
};
const matchLabels = {exact:'Exact match',partial:'Partial match',suggested:'Closest match',related:'Related topic'};
let open = false;
let activeSession;
let query = '';
let targetId = '';
let mode = 'mesh';
let webEngine = 'google';
let lastResponse;

export function lookupPanelMarkup() {
  return `<aside id="term-lookup" class="card term-lookup-panel" aria-label="Medical term lookup" ${open ? '' : 'hidden'}>
    <div class="lookup-heading"><h3>${bookIcon} Term lookup</h3><button type="button" class="button button-ghost" id="close-term-lookup" aria-label="Close lookup panel">×</button></div>
    <form id="lookup-form">
      <div class="lookup-query-row"><label class="field">Search term<input id="lookup-query" class="input" aria-describedby="lookup-help lookup-privacy" maxlength="200" placeholder="For example, splenomegaly" value="${esc(query)}" required></label><button class="button button-primary lookup-submit" type="submit">${lookupIcon} Search</button></div>
      <div class="lookup-source-tabs" role="radiogroup" aria-label="Search source">${Object.entries(modes).map(([value,item]) => `<button type="button" class="lookup-source-button" role="radio" data-lookup-provider="${value}" aria-checked="${value === mode}">${esc(item.label)}</button>`).join('')}</div>
      <div id="lookup-web-engines" class="lookup-web-engines" role="radiogroup" aria-label="Web search engine" hidden><span class="small muted">Search with</span><button type="button" role="radio" data-web-engine="google">Google</button><button type="button" role="radio" data-web-engine="duckduckgo">DuckDuckGo</button></div>
      <p id="lookup-help" class="small muted"></p>
    </form>
    <div id="lookup-status" class="small muted" role="status" aria-live="polite"></div>
    <div id="lookup-results" class="lookup-results"></div>
    <p id="lookup-privacy" class="small muted lookup-privacy">Medical definitions work offline using MeSH 2026, which may not include later NLM updates. Health overview and Web search use the internet; only the search term is sent.</p>
  </aside>`;
}

export function summaryText(html) {
  const template = document.createElement('template');
  template.innerHTML = html.replace(/<\/(?:p|h[1-6]|li|ul|ol)>/gi, '$&\n\n').replace(/<br\s*\/?>/gi, '\n');
  template.content.querySelectorAll('script,style,iframe,object,embed').forEach(element => element.remove());
  return template.content.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function destinationMarkup(ctx, search) {
  if (!ctx.session.terms.length) return `<div class="lookup-create-hint"><span>New glossary term</span><strong>${esc(search)}</strong></div>`;
  const options = ctx.session.terms.map(term => `<option value="${esc(term.id)}" ${term.id === targetId ? 'selected' : ''}>${esc(term.name)}</option>`).join('');
  return `<label class="small lookup-destination">Save definition to<select class="select" data-result-target><option value="">＋ Create “${esc(search)}” as a new term</option>${options}</select></label>`;
}

export function mountLookup(ctx) {
  if (activeSession !== ctx.session) { activeSession = ctx.session; query = ''; targetId = ''; lastResponse = undefined; }
  const panel = document.getElementById('term-lookup');
  const input = document.getElementById('lookup-query');
  const status = document.getElementById('lookup-status');
  const results = document.getElementById('lookup-results');
  const form = document.getElementById('lookup-form');
  const submit = form.querySelector('[type="submit"]');
  const help = document.getElementById('lookup-help');
  const webEngines = document.getElementById('lookup-web-engines');
  let disposed = false;
  let request = 0;
  ctx.onDispose?.(() => { disposed = true; });

  const syncPanel = () => {
    panel.hidden = !open;
    document.querySelector('.terms-layout').classList.toggle('lookup-open', open);
    document.getElementById('toggle-term-lookup').setAttribute('aria-expanded', String(open));
  };
  const syncMode = () => {
    document.querySelectorAll('[data-lookup-provider]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.lookupProvider === mode)));
    help.textContent = modes[mode].help;
    submit.innerHTML = `${lookupIcon} ${mode === 'web' ? 'Search web' : 'Search'}`;
    webEngines.hidden = mode !== 'web';
    webEngines.querySelectorAll('[data-web-engine]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.webEngine === webEngine)));
  };
  const syncTargets = root => root.querySelectorAll('[data-result-target]').forEach(select => {
    select.value = targetId;
    select.disabled = ctx.session.isAct1Completed;
    select.addEventListener('change', () => {
      targetId = select.value;
      root.querySelectorAll('[data-result-target]').forEach(other => { other.value = targetId; });
      syncResultActions(root);
    });
  });
  const syncResultActions = root => [
    ...(root.matches?.('.lookup-result') ? [root] : []),
    ...root.querySelectorAll('.lookup-result')
  ].forEach(article => {
    const selected = article.querySelector('[data-result-target]')?.value;
    const createsTerm = !selected;
    const button = article.querySelector('.lookup-add');
    if (button) button.textContent = createsTerm ? '＋ Create term with this definition' : 'Add definition to selected term';
  });
  const showBrowserControls = () => {
    results.innerHTML = `<div class="lookup-browser-card"><strong>Search opened in its own VibePBL window</strong><p class="small muted">Back, Forward, the current address, and Close are now in that window’s toolbar.</p></div>`;
  };

  function showResponse(response) {
    results.replaceChildren();
    if (!response) { status.textContent = 'Enter a term and choose where to search.'; return; }
    const closest = response.results[0]?.matchKind === 'suggested';
    status.textContent = response.results.length
      ? `${closest ? 'Showing closest matches' : `${response.results.length} result${response.results.length === 1 ? '' : 's'}`} for “${response.query}”`
      : 'No matching entry. Try another source or a shorter term.';
    for (const [index,result] of response.results.entries()) {
      const text = result.plainText ? result.summary : summaryText(result.summary);
      const exact = result.title.trim().toLowerCase() === response.query.trim().toLowerCase();
      const matchKind = result.matchKind || (exact ? 'exact' : 'related');
      const matchedTerm = result.matchedTerm && result.matchedTerm.trim().toLowerCase() !== result.title.trim().toLowerCase()
        ? ` · Matched “${esc(result.matchedTerm)}”`
        : '';
      const article = document.createElement('article');
      article.className = 'lookup-result';
      const content = index === 0 || result.plainText
        ? `<div class="lookup-summary">${esc(text)}</div>`
        : `<details><summary>Show full overview</summary><div class="lookup-summary">${esc(text)}</div></details>`;
      article.innerHTML = `<div class="small muted">${esc(result.source)} · ${matchLabels[matchKind] || 'Related topic'}${matchedTerm}</div><h4>${esc(result.title)}</h4>${content}<details class="lookup-source-details"><summary>Source details</summary><div class="small muted lookup-source">${esc(result.url)}<br>Retrieved ${new Date(response.retrievedAt).toLocaleString()}</div></details>${destinationMarkup(ctx, response.query)}<button class="button button-secondary lookup-add" type="button" ${ctx.session.isAct1Completed ? 'disabled' : ''}>Add definition</button>`;
      article.querySelector('.lookup-add').addEventListener('click', () => {
        const select = article.querySelector('[data-result-target]');
        let term = ctx.session.terms.find(item => item.id === select?.value);
        let created = false;
        if (!term) {
          const name = response.query.trim();
          term = ctx.session.terms.find(item => item.name.trim().toLowerCase() === name.toLowerCase());
          if (!term) {
            term = { id:uid('term'), name, meaning:'' };
            ctx.session.terms = [...ctx.session.terms, term];
            created = true;
          }
          targetId = term.id;
        }
        const addition = `${text}\nSource: ${result.title} — ${result.source}\n${result.url}\nRetrieved ${new Date(response.retrievedAt).toLocaleDateString()}; source text may change.`;
        term.meaning = [term.meaning.trim(), addition].filter(Boolean).join('\n\n');
        ctx.setField('terms', ctx.session.terms);
        if (created) {
          ctx.showToast?.(`${term.name} added to the glossary`, 'success');
          ctx.render();
          return;
        }
        const definition = document.querySelector(`[data-term-meaning="${CSS.escape(term.id)}"]`);
        if (definition) definition.value = term.meaning;
        status.textContent = `Definition added to ${term.name}.`;
      });
      results.append(article);
      syncTargets(article);
      syncResultActions(article);
    }
  }

  syncPanel(); syncMode(); showResponse(lastResponse);
  input.addEventListener('input', () => { query = input.value; });
  document.querySelectorAll('[data-lookup-provider]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.lookupProvider; lastResponse = undefined; request++; submit.disabled = false; syncMode(); showResponse();
  }));
  document.querySelectorAll('[data-web-engine]').forEach(button => button.addEventListener('click', () => {
    webEngine = button.dataset.webEngine;
    syncMode();
  }));
  document.getElementById('toggle-term-lookup').addEventListener('click', () => { open = !open; syncPanel(); if (open) input.focus(); });
  document.getElementById('close-term-lookup').addEventListener('click', () => { open = false; syncPanel(); document.getElementById('toggle-term-lookup').focus(); });
  document.querySelectorAll('[data-lookup-term]').forEach(button => button.addEventListener('click', () => {
    const term = ctx.session.terms.find(item => item.id === button.dataset.lookupTerm);
    if (!term) return;
    targetId = term.id; query = term.name; input.value = query; open = true; syncPanel(); input.focus();
  }));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const search = input.value.trim();
    if (!search) return;
    const ticket = ++request;
    submit.disabled = true; results.replaceChildren(); status.textContent = mode === 'web' ? 'Opening web search…' : `Searching ${modes[mode].label.toLowerCase()}…`;
    try {
      if (mode === 'web') {
        await ctx.API.openWebSearch(search, webEngine);
        if (disposed || ticket !== request) return;
        status.textContent = `${webEngine === 'google' ? 'Google' : 'DuckDuckGo'} results for “${search}” opened in a VibePBL window.`;
        showBrowserControls();
      } else {
        const response = await ctx.API.searchTerminology(modes[mode].provider, search);
        if (disposed || ticket !== request) return;
        lastResponse = { ...response, query:search, provider:mode }; showResponse(lastResponse);
      }
    } catch (error) {
      if (!disposed && ticket === request) { lastResponse = undefined; status.textContent = String(error); }
    } finally { if (!disposed && ticket === request) submit.disabled = false; }
  });
}
