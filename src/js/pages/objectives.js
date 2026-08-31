import { esc, emptyState, pageHeader, uid } from '../components/helpers.js';
import { openFormModal } from '../components/modal.js';

export function renderObjectives(ctx) {
  const locked = ctx.session.isAct1Completed;
  const normalized = normalizeLinks(ctx.session.objectives, ctx.session.problems);
  if (normalized.changed) ctx.setField('objectives', normalized.objectives);
  document.getElementById('page').innerHTML = `
    ${pageHeader('Learning objectives', 'Group related problems under learning objectives. Each problem can belong to only one objective.', `<button id="print-act1" class="button button-secondary">Print Act 1</button><button id="toggle-lock" class="button ${locked ? 'button-secondary' : 'button-success'}">${locked ? 'Unlock Act 1' : '✓ Mark Act 1 complete'}</button>`)}
    ${locked ? '<div class="lock-banner"><span>🔒</span><div><strong>Act 1 is complete and locked</strong><div class="small">Act 2 remains editable. Unlock only if the group agrees to revise its analysis.</div></div></div>' : ''}
    <section class="card"><div class="form-row"><input id="objective-input" class="input" placeholder="Enter a learning objective…" ${locked ? 'disabled' : ''}><button id="add-objective" class="button button-primary" ${locked ? 'disabled' : ''}>＋ Add objective</button></div></section>
    <section class="card objective-collection"><div class="objective-grid">${ctx.session.objectives.length ? ctx.session.objectives.map((objective, index) => objectiveCard(ctx, objective, index, locked)).join('') : emptyState('▱', 'No learning objectives yet', 'Type a focused research goal above and press Enter.')}</div></section>`;

  const add = () => {
    const input = document.getElementById('objective-input');
    const text = input.value.trim();
    if (!text) return;
    ctx.setField('objectives', [...ctx.session.objectives, { id:uid('lo'), text, linkedProblemIds:[] }]);
    ctx.render();
  };
  document.getElementById('add-objective').addEventListener('click', add);
  document.getElementById('objective-input').addEventListener('keydown', event => submitOnEnter(event, add));
  document.querySelectorAll('[data-link-select]').forEach(select => select.addEventListener('change', () => {
    const problemId = select.value;
    if (!problemId) return;
    const objective = ctx.session.objectives.find(item => item.id === select.dataset.linkSelect);
    const owner = ctx.session.objectives.find(item => item.id !== objective.id && item.linkedProblemIds.includes(problemId));
    if (owner) {
      ctx.showToast('That problem is already linked to another learning objective.', 'error');
      ctx.render();
      return;
    }
    objective.linkedProblemIds = [...new Set([...objective.linkedProblemIds, problemId])];
    ctx.setField('objectives', ctx.session.objectives);
    ctx.render();
  }));
  document.querySelectorAll('[data-unlink-lo]').forEach(button => button.addEventListener('click', () => {
    const objective = ctx.session.objectives.find(item => item.id === button.dataset.unlinkLo);
    objective.linkedProblemIds = objective.linkedProblemIds.filter(id => id !== button.dataset.problemId);
    ctx.setField('objectives', ctx.session.objectives);
    ctx.render();
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
  const linked = objective.linkedProblemIds.map(id => {
    const problemIndex = ctx.session.problems.findIndex(problem => problem.id === id);
    return problemIndex < 0 ? '' : linkedProblemChip(objective, ctx.session.problems[problemIndex], problemIndex, locked);
  }).join('');
  const available = ctx.session.problems.filter(problem => !ctx.session.objectives.some(item => item.linkedProblemIds.includes(problem.id)));
  return `<article class="objective-card"><div class="objective-head"><span class="code-badge">LO${index + 1}</span><div class="objective-text">${esc(objective.text)}</div><button class="button button-ghost" data-edit="${esc(objective.id)}" ${locked ? 'disabled' : ''}>✎</button><button class="button button-ghost" data-delete="${esc(objective.id)}" ${locked ? 'disabled' : ''}>🗑</button></div>
    <div class="objective-compact-links"><div class="linked-problem-list" aria-label="Linked problems">${linked || '<span class="muted small">No linked problems</span>'}</div><label class="objective-link-picker"><span class="small muted">Add problem</span><select class="select" data-link-select="${esc(objective.id)}" aria-label="Add an unassigned problem to LO${index + 1}" ${locked || !available.length ? 'disabled' : ''}><option value="">${available.length ? 'Select an unassigned problem…' : 'All problems are assigned'}</option>${available.map(problem => { const problemIndex = ctx.session.problems.indexOf(problem); return `<option value="${esc(problem.id)}">P${problemIndex + 1} · ${esc(problem.text)}</option>`; }).join('')}</select></label></div>
  </article>`;
}

function linkedProblemChip(objective, problem, problemIndex, locked) {
  return `<span class="linked-problem-chip"><span class="code-badge">P${problemIndex + 1}</span><span>${esc(problem.text)}</span><button class="button button-ghost button-sm" data-unlink-lo="${esc(objective.id)}" data-problem-id="${esc(problem.id)}" aria-label="Unlink P${problemIndex + 1}" title="Unlink problem" ${locked ? 'disabled' : ''}>×</button></span>`;
}

function normalizeLinks(objectives, problems) {
  const problemIds = new Set(problems.map(problem => problem.id));
  const assigned = new Set();
  let changed = false;
  const next = objectives.map(objective => {
    const source = Array.isArray(objective.linkedProblemIds) ? objective.linkedProblemIds : [];
    const linkedProblemIds = [];
    source.forEach(id => {
      if (!problemIds.has(id) || assigned.has(id)) return;
      linkedProblemIds.push(id);
      assigned.add(id);
    });
    const objectiveChanged = !Array.isArray(objective.linkedProblemIds) || linkedProblemIds.length !== source.length || linkedProblemIds.some((id, index) => id !== source[index]);
    if (objectiveChanged) changed = true;
    return objectiveChanged ? { ...objective, linkedProblemIds } : objective;
  });
  return { changed, objectives:next };
}

function submitOnEnter(event, submit) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  submit();
}
