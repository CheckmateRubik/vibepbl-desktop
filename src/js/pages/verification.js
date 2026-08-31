import { esc, emptyState, pageHeader, uid } from '../components/helpers.js';
import { openFormModal } from '../components/modal.js';

const cycle = ['pending', 'correct', 'wrong'];
const stateMap = {
  pending:{ validation:'pending' }, correct:{ validation:'correct' }, wrong:{ validation:'wrong' }
};

export function renderVerification(ctx) {
  document.getElementById('page').innerHTML = `
    ${pageHeader('Hypotheses verification', 'Revisit every Act 1 differential using the evidence presented in Act 2. Changes are reflected in the Act 1 board immediately.')}
    <section class="card"><div class="list-stack">${ctx.session.problems.length ? ctx.session.problems.map((problem, pIndex) => `<article class="verification-problem"><header>P${pIndex + 1} · ${esc(problem.text)}</header><div class="verification-body">${problem.hypotheses.length ? problem.hypotheses.map((hypothesis, hIndex) => row(hypothesis, hIndex, problem.id)).join('') : '<div class="muted small">No hypotheses from Act 1.</div>'}<button class="button button-secondary button-sm" data-add-revised="${esc(problem.id)}">＋ Add revised hypothesis</button></div></article>`).join('') : emptyState('✓', 'No problems to verify', 'Create clinical problems and hypotheses during Act 1 first.')}</div></section>`;
  document.querySelectorAll('[data-cycle-status]').forEach(button => button.addEventListener('click', () => {
    const [problemId, hypothesisId] = button.dataset.cycleStatus.split('|'); const problem = ctx.session.problems.find(item => item.id === problemId); const hypothesis = problem.hypotheses.find(item => item.id === hypothesisId);
    const next = cycle[(cycle.indexOf(hypothesis.validation || 'pending') + 1) % cycle.length]; Object.assign(hypothesis, stateMap[next]); ctx.setField('problems', ctx.session.problems); ctx.render();
  }));
  document.querySelectorAll('[data-edit-hypothesis]').forEach(button => button.addEventListener('click', () => { const [problemId, hypothesisId] = button.dataset.editHypothesis.split('|'); const hypothesis = ctx.session.problems.find(item => item.id === problemId).hypotheses.find(item => item.id === hypothesisId); openFormModal('Revise hypothesis', [{ name:'text', label:'Hypothesis', type:'textarea', value:esc(hypothesis.text) }], ({ text }) => { hypothesis.text = text.trim(); ctx.setField('problems', ctx.session.problems); ctx.render(); }); }));
  document.querySelectorAll('[data-delete-hypothesis]').forEach(button => button.addEventListener('click', () => { const [problemId, hypothesisId] = button.dataset.deleteHypothesis.split('|'); const problem = ctx.session.problems.find(item => item.id === problemId); problem.hypotheses = problem.hypotheses.filter(item => item.id !== hypothesisId); ctx.setField('problems', ctx.session.problems); ctx.render(); }));
  document.querySelectorAll('[data-add-revised]').forEach(button => button.addEventListener('click', () => openFormModal('Add revised hypothesis', [{ name:'text', label:'New or revised hypothesis', type:'textarea', value:'' }], ({ text }) => { const problem = ctx.session.problems.find(item => item.id === button.dataset.addRevised); problem.hypotheses.push({ id:uid('hyp'), text:text.trim(), status:'none', checked:false, ...stateMap.pending }); ctx.setField('problems', ctx.session.problems); ctx.render(); })));
}

function row(hypothesis, index, problemId) { const state = ['correct', 'wrong'].includes(hypothesis.validation) ? hypothesis.validation : 'pending'; const type = state === 'correct' ? 'confirmed' : state; const label = state === 'correct' ? 'Correct ✓' : state === 'wrong' ? 'Wrong ✗' : 'Unchecked'; const key = `${problemId}|${hypothesis.id}`; return `<div class="hypothesis-row ${type !== 'pending' ? `status-${type}` : ''}"><button class="status-badge ${type !== 'pending' ? `status-${type}` : ''}" data-cycle-status="${esc(key)}">${label}</button><span class="code-badge">H${index + 1}</span><span class="hypothesis-text">${esc(hypothesis.text)}</span><button class="button button-ghost" data-edit-hypothesis="${esc(key)}">✎</button><button class="button button-ghost" data-delete-hypothesis="${esc(key)}">🗑</button></div>`; }
