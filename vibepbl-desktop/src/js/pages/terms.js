import { esc, emptyState, pageHeader, uid } from '../components/helpers.js';
import { openFormModal } from '../components/modal.js';

export function renderTerms(ctx) {
  const locked = ctx.session.isAct1Completed;
  document.getElementById('page').innerHTML = `
    ${pageHeader('Terminology clarifier', 'Build a shared, searchable glossary without interrupting the group’s clinical reasoning.')}
    ${locked ? '<div class="lock-banner">🔒 <strong>Act 1 is locked</strong></div>' : ''}
    <section class="card"><div class="form-row"><input id="term-search" class="input" placeholder="Search terms or definitions…"><button id="add-term" class="button button-primary" ${locked ? 'disabled' : ''}>＋ Add term</button></div></section>
    <section class="card"><div id="term-list" class="list-stack"></div></section>`;
  const draw = filter => {
    const terms = ctx.session.terms.filter(term => `${term.name} ${term.meaning}`.toLowerCase().includes(filter.toLowerCase()));
    document.getElementById('term-list').innerHTML = terms.length ? terms.map((term, index) => `<article class="list-item"><span class="code-badge">T${index + 1}</span><div class="list-item-main"><div class="list-item-title">${esc(term.name)}</div><div class="muted">${esc(term.meaning)}</div></div><div class="item-actions"><button class="button button-ghost" data-edit="${term.id}" ${locked ? 'disabled' : ''}>✎</button><button class="button button-ghost" data-delete="${term.id}" ${locked ? 'disabled' : ''}>🗑</button></div></article>`).join('') : emptyState('?', 'No matching terms', 'Add the first unfamiliar medical term or adjust the search.');
    document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editTerm(ctx, button.dataset.edit)));
    document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => { ctx.setField('terms', ctx.session.terms.filter(term => term.id !== button.dataset.delete)); ctx.render(); }));
  };
  draw('');
  document.getElementById('term-search').addEventListener('input', event => draw(event.target.value));
  document.getElementById('add-term').addEventListener('click', () => editTerm(ctx));
}

function editTerm(ctx, id) {
  const current = ctx.session.terms.find(term => term.id === id);
  openFormModal(current ? 'Edit terminology' : 'Add terminology', [
    { name:'name', label:'Medical term', value:esc(current?.name || '') },
    { name:'meaning', label:'Definition or clarification', type:'textarea', value:esc(current?.meaning || '') }
  ], ({ name, meaning }) => {
    const next = current ? ctx.session.terms.map(term => term.id === id ? { ...term, name: name.trim(), meaning: meaning.trim() } : term) : [...ctx.session.terms, { id: uid('term'), name: name.trim(), meaning: meaning.trim() }];
    ctx.setField('terms', next); ctx.render();
  });
}
