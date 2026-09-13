import { esc, emptyState, pageHeader, uid } from '../components/helpers.js';
import { openFormModal } from '../components/modal.js';

const cycle = ['pending', 'correct', 'wrong'];
const stateMap = {
  pending:{ validation:'pending' }, correct:{ validation:'correct' }, wrong:{ validation:'wrong' }
};

export function verificationState(hypothesis) {
  const state = ['correct', 'wrong', 'edited', 'added'].includes(hypothesis.validation) ? hypothesis.validation : 'pending';
  return {
    state,
    type:state === 'correct' ? 'confirmed' : state,
    label:state === 'correct' ? 'Correct ✓' : state === 'wrong' ? 'Wrong ✗' : state === 'edited' ? 'Edited' : state === 'added' ? 'Added new' : 'Unchecked',
    canJudge:['pending', 'correct', 'wrong'].includes(state)
  };
}

export const validationAfterEdit = validation => validation === 'added' ? 'added' : 'edited';

export function renderVerification(ctx) {
  document.getElementById('page').innerHTML = `
    ${pageHeader('Hypotheses verification', 'Revisit every Act 1 differential using the evidence presented in Act 2. Changes are reflected in the Act 1 board immediately.')}
    <section class="card"><div class="list-stack">${ctx.session.problems.length ? ctx.session.problems.map((problem, pIndex) => `<article class="verification-problem"><header>P${pIndex + 1} · ${esc(problem.text)}</header><div class="verification-body">${problem.hypotheses.length ? problem.hypotheses.map((hypothesis, hIndex) => row(hypothesis, hIndex, problem.id)).join('') : '<div class="muted small">No hypotheses from Act 1.</div>'}<button class="button button-secondary button-sm" data-add-revised="${esc(problem.id)}">＋ Add revised hypothesis</button></div></article>`).join('') : emptyState('✓', 'No problems to verify', 'Create clinical problems and hypotheses during Act 1 first.')}</div></section>`;
  document.querySelectorAll('[data-cycle-status]').forEach(button => button.addEventListener('click', () => {
    const [problemId, hypothesisId] = button.dataset.cycleStatus.split('|'); const problem = ctx.session.problems.find(item => item.id === problemId); const hypothesis = problem.hypotheses.find(item => item.id === hypothesisId);
    const next = cycle[(cycle.indexOf(hypothesis.validation || 'pending') + 1) % cycle.length]; Object.assign(hypothesis, stateMap[next]); ctx.setField('problems', ctx.session.problems); ctx.render();
  }));
  document.querySelectorAll('[data-edit-hypothesis]').forEach(button => button.addEventListener('click', () => { const [problemId, hypothesisId] = button.dataset.editHypothesis.split('|'); const hypothesis = ctx.session.problems.find(item => item.id === problemId).hypotheses.find(item => item.id === hypothesisId); openFormModal('Revise hypothesis', [{ name:'text', label:'Hypothesis', type:'textarea', value:hypothesis.text }], ({ text }) => { const nextText = text.trim(); if (!nextText || nextText === hypothesis.text) return; hypothesis.text = nextText; hypothesis.validation = validationAfterEdit(hypothesis.validation); ctx.setField('problems', ctx.session.problems); ctx.render(); }); }));
  document.querySelectorAll('[data-delete-hypothesis]').forEach(button => button.addEventListener('click', () => { const [problemId, hypothesisId] = button.dataset.deleteHypothesis.split('|'); const problem = ctx.session.problems.find(item => item.id === problemId); problem.hypotheses = problem.hypotheses.filter(item => item.id !== hypothesisId); ctx.setField('problems', ctx.session.problems); ctx.render(); }));
  document.querySelectorAll('[data-add-revised]').forEach(button => button.addEventListener('click', () => openFormModal('Add new hypothesis', [{ name:'text', label:'New hypothesis', type:'textarea', value:'' }], ({ text }) => { const nextText = text.trim(); if (!nextText) return; const problem = ctx.session.problems.find(item => item.id === button.dataset.addRevised); problem.hypotheses.push({ id:uid('hyp'), text:nextText, status:'none', validation:'added', checked:false }); ctx.setField('problems', ctx.session.problems); ctx.render(); })));
}

function row(hypothesis, index, problemId) { const { type, label, canJudge } = verificationState(hypothesis); const key = `${problemId}|${hypothesis.id}`; const statusClass = type !== 'pending' ? `status-${type}` : ''; const status = canJudge ? `<button class="status-badge ${statusClass}" data-cycle-status="${esc(key)}">${label}</button>` : `<span class="status-badge ${statusClass}" role="status">${label}</span>`; return `<div class="hypothesis-row ${statusClass}">${status}<span class="code-badge">H${index + 1}</span><span class="hypothesis-text">${esc(hypothesis.text)}</span><button class="button button-ghost" data-edit-hypothesis="${esc(key)}">✎</button><button class="button button-ghost" data-delete-hypothesis="${esc(key)}">🗑</button></div>`; }
