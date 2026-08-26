import { esc, emptyState, pageHeader, uid } from '../components/helpers.js';

let focusTermId;

export function renderTerms(ctx) {
  const locked = ctx.session.isAct1Completed;
  document.getElementById('page').innerHTML = `
    ${pageHeader('Terminology clarifier', 'Build a shared glossary without interrupting the group’s clinical reasoning.')}
    ${locked ? '<div class="lock-banner">🔒 <strong>Act 1 is locked</strong></div>' : ''}
    <section class="card term-workspace">
      <div class="form-row"><input id="term-input" class="input" placeholder="Enter a medical term to clarify…" ${locked ? 'disabled' : ''}><button id="add-term" class="button button-primary" ${locked ? 'disabled' : ''}>＋ Add term</button></div>
      <div class="term-grid">${ctx.session.terms.length ? ctx.session.terms.map((term, index) => termCard(term, index, locked)).join('') : emptyState('?', 'No terms yet', 'Type a term above and press Enter to add it.')}</div>
    </section>`;

  const add = () => {
    const input = document.getElementById('term-input');
    const name = input.value.trim();
    if (!name) return;
    const item = { id:uid('term'), name, meaning:'' };
    focusTermId = item.id;
    ctx.setField('terms', [...ctx.session.terms, item]);
    ctx.render();
  };
  document.getElementById('add-term').addEventListener('click', add);
  document.getElementById('term-input').addEventListener('keydown', event => submitOnEnter(event, add));
  document.querySelectorAll('[data-term-name]').forEach(input => input.addEventListener('input', () => updateTerm(ctx, input.dataset.termName, { name:input.value }, false)));
  document.querySelectorAll('[data-term-meaning]').forEach(textarea => textarea.addEventListener('input', () => updateTerm(ctx, textarea.dataset.termMeaning, { meaning:textarea.value }, false)));
  document.querySelectorAll('[data-delete-term]').forEach(button => button.addEventListener('click', () => {
    if (!confirm('Delete this term?')) return;
    ctx.setField('terms', ctx.session.terms.filter(term => term.id !== button.dataset.deleteTerm));
    ctx.render();
  }));

  if (focusTermId) {
    document.querySelector(`[data-term-meaning="${CSS.escape(focusTermId)}"]`)?.focus();
    focusTermId = undefined;
  }
}

function termCard(term, index, locked) {
  return `<article class="term-card">
    <header><span class="code-badge">T${index + 1}</span><input class="term-card-title" data-term-name="${esc(term.id)}" value="${esc(term.name)}" aria-label="Term ${index + 1}" ${locked ? 'disabled' : ''}><button class="button button-ghost" data-delete-term="${esc(term.id)}" aria-label="Delete ${esc(term.name)}" ${locked ? 'disabled' : ''}>🗑</button></header>
    <label class="field-label" for="meaning-${esc(term.id)}">Definition or medical meaning</label>
    <textarea id="meaning-${esc(term.id)}" class="textarea term-definition" data-term-meaning="${esc(term.id)}" placeholder="Add the group’s clarification…" ${locked ? 'disabled' : ''}>${esc(term.meaning || '')}</textarea>
  </article>`;
}

function updateTerm(ctx, id, changes, immediate = true) {
  const term = ctx.session.terms.find(item => item.id === id);
  if (!term) return;
  Object.assign(term, changes);
  ctx.setField('terms', ctx.session.terms, immediate);
}

function submitOnEnter(event, submit) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  submit();
}
