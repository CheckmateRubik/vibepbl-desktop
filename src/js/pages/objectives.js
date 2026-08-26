import { esc, emptyState, pageHeader, uid } from '../components/helpers.js';
import { openFormModal } from '../components/modal.js';

export function renderObjectives(ctx) {
  const locked = ctx.session.isAct1Completed;
  const normalized = normalizeLinks(ctx.session.objectives, ctx.session.problems);
  if (normalized.changed) ctx.setField('objectives', normalized.objectives);
  document.getElementById('page').innerHTML = `
    ${pageHeader('Learning objectives', 'Create one focused learning objective for each selected problem.', `<button id="print-act1" class="button button-secondary">Print Act 1</button><button id="toggle-lock" class="button ${locked ? 'button-secondary' : 'button-success'}">${locked ? 'Unlock Act 1' : '✓ Mark Act 1 complete'}</button>`)}
    ${locked ? '<div class="lock-banner"><span>🔒</span><div><strong>Act 1 is complete and locked</strong><div class="small">Act 2 remains editable. Unlock only if the group agrees to revise its analysis.</div></div></div>' : ''}
    <section class="card"><div class="form-row"><input id="objective-input" class="input" placeholder="Enter a learning objective…" ${locked ? 'disabled' : ''}><button id="add-objective" class="button button-primary" ${locked ? 'disabled' : ''}>＋ Add objective</button></div></section>
    <section class="card"><div class="list-stack">${ctx.session.objectives.length ? ctx.session.objectives.map((objective, index) => objectiveCard(ctx, objective, index, locked)).join('') : emptyState('▱', 'No learning objectives yet', 'Type a focused research goal above and press Enter.')}</div></section>`;

  const add = () => {
    const input = document.getElementById('objective-input');
    const text = input.value.trim();
    if (!text) return;
    ctx.setField('objectives', [...ctx.session.objectives, { id:uid('lo'), text, linkedProblemIds:[] }]);
    ctx.render();
  };
  document.getElementById('add-objective').addEventListener('click', add);
  document.getElementById('objective-input').addEventListener('keydown', event => submitOnEnter(event, add));
  document.querySelectorAll('[data-link-lo]').forEach(select => select.addEventListener('change', () => {
    const objective = ctx.session.objectives.find(item => item.id === select.dataset.linkLo);
    objective.linkedProblemIds = select.value ? [select.value] : [];
    ctx.setField('objectives', ctx.session.objectives);
  }));
  document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => {
    const objective = ctx.session.objectives.find(item => item.id === button.dataset.edit);
    openFormModal('Edit learning objective', [{ name:'text', label:'Learning objective', type:'textarea', value:esc(objective.text) }], ({ text }) => {
      objective.text = text.trim();
      ctx.setField('objectives', ctx.session.objectives);
      ctx.render();
    });
  }));
  document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => {
    ctx.setField('objectives', ctx.session.objectives.filter(item => item.id !== button.dataset.delete));
    ctx.render();
  }));
  document.getElementById('print-act1').addEventListener('click', () => ctx.API.openPrintWindow());
  document.getElementById('toggle-lock').addEventListener('click', () => {
    if (!locked && !confirm('Mark Act 1 complete and lock all Act 1 editing?')) return;
    if (locked && !confirm('Unlock Act 1 for revisions?')) return;
    ctx.setField('isAct1Completed', !locked);
    ctx.render();
  });
}

function objectiveCard(ctx, objective, index, locked) {
  const linkedId = objective.linkedProblemIds[0] || '';
  const linkedElsewhere = new Set(ctx.session.objectives.filter(item => item.id !== objective.id).flatMap(item => item.linkedProblemIds || []));
  return `<article class="objective-card"><div class="objective-head"><span class="code-badge">LO${index + 1}</span><div class="objective-text">${esc(objective.text)}</div><button class="button button-ghost" data-edit="${esc(objective.id)}" ${locked ? 'disabled' : ''}>✎</button><button class="button button-ghost" data-delete="${esc(objective.id)}" ${locked ? 'disabled' : ''}>🗑</button></div>
    <div class="objective-link-row"><label class="field-label" for="problem-${esc(objective.id)}">Linked problem</label>${ctx.session.problems.length ? `<select id="problem-${esc(objective.id)}" class="select" data-link-lo="${esc(objective.id)}" ${locked ? 'disabled' : ''}><option value="">Choose one problem…</option>${ctx.session.problems.map((problem, problemIndex) => `<option value="${esc(problem.id)}" ${linkedId === problem.id ? 'selected' : ''} ${linkedElsewhere.has(problem.id) ? 'disabled' : ''}>P${problemIndex + 1} · ${esc(problem.text)}${linkedElsewhere.has(problem.id) ? ' — already linked' : ''}</option>`).join('')}</select>` : '<span class="muted small">Add a problem point before linking this objective.</span>'}</div>
  </article>`;
}

function normalizeLinks(objectives, problems) {
  const problemIds = new Set(problems.map(problem => problem.id));
  const assigned = new Set();
  let changed = false;
  const next = objectives.map(objective => {
    const source = Array.isArray(objective.linkedProblemIds) ? objective.linkedProblemIds : [];
    const selected = source.find(id => problemIds.has(id) && !assigned.has(id));
    const linkedProblemIds = selected ? [selected] : [];
    if (selected) assigned.add(selected);
    if (!Array.isArray(objective.linkedProblemIds) || linkedProblemIds.length !== source.length || linkedProblemIds[0] !== source[0]) changed = true;
    return changed ? { ...objective, linkedProblemIds } : objective;
  });
  return { changed, objectives:next };
}

function submitOnEnter(event, submit) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  submit();
}
