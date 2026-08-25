import { esc, emptyState, pageHeader, uid } from '../components/helpers.js';
import { openFormModal } from '../components/modal.js';

let selectedId;
let draggingId;
const act1States = ['none', 'green', 'yellow'];

export function renderProblems(ctx) {
  const locked = ctx.session.isAct1Completed;
  selectedId = ctx.session.problems.some(problem => problem.id === selectedId) ? selectedId : ctx.session.problems[0]?.id;
  const selected = ctx.session.problems.find(problem => problem.id === selectedId);
  document.getElementById('page').innerHTML = `
    ${pageHeader('Problems & hypotheses', 'Separate the patient’s key problems, then build a focused differential for each.', `<button id="add-problem" class="button button-primary" ${locked ? 'disabled' : ''}>＋ Add problem</button>`)}
    ${locked ? '<div class="lock-banner">🔒 <strong>Act 1 is locked</strong></div>' : ''}
    <div class="split-layout">
      <section class="card"><h3 class="section-title">Clinical problems</h3><div class="list-stack">${ctx.session.problems.length ? ctx.session.problems.map((problem, index) => `<button class="list-item ${problem.id === selectedId ? 'selected' : ''}" data-problem="${esc(problem.id)}" draggable="${!locked}"><span class="drag-handle">⠿</span><span class="code-badge">P${index + 1}</span><span class="list-item-main list-item-title">${esc(problem.text)}</span><span class="small muted">${problem.hypotheses.length}</span></button>`).join('') : emptyState('☷', 'No clinical problems yet', 'Add the first problem point identified by the group.')}</div></section>
      <section class="card">${selected ? `<div class="d-flex gap-2"><div class="list-item-main"><span class="code-badge">P${ctx.session.problems.indexOf(selected) + 1}</span><h3>${esc(selected.text)}</h3></div><button class="button button-ghost" data-edit-problem ${locked ? 'disabled' : ''}>✎</button><button class="button button-ghost" data-delete-problem ${locked ? 'disabled' : ''}>🗑</button></div><div class="form-row"><input id="hypothesis-input" class="input" placeholder="Add a differential hypothesis…" ${locked ? 'disabled' : ''}><button id="add-hypothesis" class="button button-primary" ${locked ? 'disabled' : ''}>Add hypothesis</button></div><div class="list-stack mt-3">${selected.hypotheses.length ? selected.hypotheses.map((hypothesis, index) => hypothesisRow(hypothesis, index, locked)).join('') : emptyState('H', 'No hypotheses yet', 'Brainstorm differentials for this problem point.')}</div>` : emptyState('☷', 'Select or add a problem', 'Hypotheses for the selected clinical problem will appear here.')}</section>
    </div>`;
  document.getElementById('add-problem').addEventListener('click', () => addProblem(ctx));
  document.querySelectorAll('[data-problem]').forEach(button => {
    button.addEventListener('click', () => { selectedId = button.dataset.problem; ctx.render(); });
    button.addEventListener('dragstart', () => draggingId = button.dataset.problem);
    button.addEventListener('dragover', event => event.preventDefault());
    button.addEventListener('drop', event => { event.preventDefault(); const target = button.dataset.problem; if (!draggingId || draggingId === target) return; const next = [...ctx.session.problems]; const from = next.findIndex(item => item.id === draggingId); const to = next.findIndex(item => item.id === target); next.splice(to, 0, next.splice(from, 1)[0]); ctx.setField('problems', next); ctx.render(); });
  });
  if (!selected) return;
  document.querySelector('[data-edit-problem]').addEventListener('click', () => openTextForm('Edit clinical problem', 'Clinical problem point', selected.text, text => { selected.text = text; ctx.setField('problems', ctx.session.problems); ctx.render(); }));
  document.querySelector('[data-delete-problem]').addEventListener('click', () => { if (!confirm('Delete this problem and all of its hypotheses?')) return; ctx.setField('problems', ctx.session.problems.filter(problem => problem.id !== selected.id)); selectedId = undefined; ctx.render(); });
  const addHypothesis = () => { const input = document.getElementById('hypothesis-input'); if (!input.value.trim()) return; selected.hypotheses.push({ id: uid('hyp'), text: input.value.trim(), status:'none', validation:'pending', checked:false }); ctx.setField('problems', ctx.session.problems); ctx.render(); };
  document.getElementById('add-hypothesis').addEventListener('click', addHypothesis);
  document.getElementById('hypothesis-input').addEventListener('keydown', event => { if (event.key === 'Enter') addHypothesis(); });
  document.querySelectorAll('[data-cycle]').forEach(button => button.addEventListener('click', () => { const hypothesis = selected.hypotheses.find(item => item.id === button.dataset.cycle); const state = act1States[(act1States.indexOf(hypothesis.status) + 1) % act1States.length]; Object.assign(hypothesis, state === 'green' ? { status:'green', validation:'correct', checked:true } : state === 'yellow' ? { status:'yellow', validation:'yellow', checked:false } : { status:'none', validation:'pending', checked:false }); ctx.setField('problems', ctx.session.problems); ctx.render(); }));
  document.querySelectorAll('[data-edit-hyp]').forEach(button => button.addEventListener('click', () => { const hypothesis = selected.hypotheses.find(item => item.id === button.dataset.editHyp); openTextForm('Edit hypothesis', 'Differential hypothesis', hypothesis.text, text => { hypothesis.text = text; ctx.setField('problems', ctx.session.problems); ctx.render(); }); }));
  document.querySelectorAll('[data-delete-hyp]').forEach(button => button.addEventListener('click', () => { selected.hypotheses = selected.hypotheses.filter(item => item.id !== button.dataset.deleteHyp); ctx.setField('problems', ctx.session.problems); ctx.render(); }));
}

function addProblem(ctx) { openTextForm('Add clinical problem', 'Clinical problem point', '', text => { const problem = { id:uid('prob'), text, status:'none', hypotheses:[] }; selectedId = problem.id; ctx.setField('problems', [...ctx.session.problems, problem]); ctx.render(); }); }
function openTextForm(title, label, value, submit) { openFormModal(title, [{ name:'text', label, type:'textarea', value:esc(value) }], ({ text }) => submit(text.trim())); }
function hypothesisRow(hypothesis, index, locked) { const type = hypothesis.validation === 'wrong' ? 'wrong' : hypothesis.status === 'green' ? 'confirmed' : hypothesis.status === 'yellow' ? 'investigating' : ''; const label = type === 'confirmed' ? 'Confirmed ✓' : type === 'investigating' ? 'Investigating ⚡' : type === 'wrong' ? 'Wrong ✗' : 'Unchecked'; return `<article class="hypothesis-row ${type ? `status-${type}` : ''}"><button class="status-badge ${type ? `status-${type}` : ''}" data-cycle="${esc(hypothesis.id)}" ${locked ? 'disabled' : ''}>${label}</button><span class="code-badge">H${index + 1}</span><span class="hypothesis-text">${esc(hypothesis.text)}</span><div class="item-actions"><button class="button button-ghost" data-edit-hyp="${esc(hypothesis.id)}" ${locked ? 'disabled' : ''}>✎</button><button class="button button-ghost" data-delete-hyp="${esc(hypothesis.id)}" ${locked ? 'disabled' : ''}>🗑</button></div></article>`; }
