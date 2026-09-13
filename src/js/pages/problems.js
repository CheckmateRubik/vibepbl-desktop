import { esc, emptyState, pageHeader, uid } from '../components/helpers.js';
import { openFormModal } from '../components/modal.js';

let selectedId;

export const isHypothesisPrioritized = hypothesis => ['prioritized', 'green', 'yellow'].includes(hypothesis.status);

export function orderProblemsByIds(problems, orderedIds) {
  const byId = new Map(problems.map(problem => [problem.id, problem]));
  const ordered = [...new Set(orderedIds)].map(id => byId.get(id)).filter(Boolean);
  const included = new Set(ordered.map(problem => problem.id));
  return [...ordered, ...problems.filter(problem => !included.has(problem.id))];
}

export function renderProblems(ctx) {
  const locked = ctx.session.isAct1Completed;
  selectedId = ctx.session.problems.some(problem => problem.id === selectedId) ? selectedId : ctx.session.problems[0]?.id;
  const selected = ctx.session.problems.find(problem => problem.id === selectedId);
  document.getElementById('page').innerHTML = `
    ${pageHeader('Problems & hypotheses', 'Separate the patient’s key problems, then build a focused differential for each.')}
    ${locked ? '<div class="lock-banner">🔒 <strong>Act 1 is locked</strong></div>' : ''}
    <div class="split-layout problem-workspace">
      <section class="card problem-panel">
        <h3 class="section-title">Clinical problems</h3>
        <div class="form-row problem-entry"><input id="problem-input" class="input" placeholder="Enter a new problem point…" ${locked ? 'disabled' : ''}><button id="add-problem" class="button button-primary" aria-label="Add problem" ${locked ? 'disabled' : ''}>＋</button></div>
        <div class="list-stack problem-list">${ctx.session.problems.length ? ctx.session.problems.map((problem, index) => problemButton(problem, index, locked)).join('') : emptyState('☷', 'No clinical problems yet', 'Type the first problem point above and press Enter.')}</div>
      </section>
      <section class="card hypothesis-panel">${selected ? selectedPanel(ctx, selected, locked) : emptyState('☷', 'Select or add a problem', 'Hypotheses for the selected clinical problem will appear here.')}</section>
    </div>`;

  const addProblem = () => {
    const input = document.getElementById('problem-input');
    const text = input.value.trim();
    if (!text) return;
    const problem = { id:uid('prob'), text, status:'none', hypotheses:[] };
    selectedId = problem.id;
    ctx.setField('problems', [...ctx.session.problems, problem]);
    ctx.render();
  };
  document.getElementById('add-problem').addEventListener('click', addProblem);
  document.getElementById('problem-input').addEventListener('keydown', event => submitOnEnter(event, addProblem));
  document.querySelectorAll('[data-problem]').forEach(item => {
    item.addEventListener('click', event => {
      if (event.target.closest('[data-drag-problem]')) return;
      selectedId = item.dataset.problem;
      ctx.render();
    });
    item.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) {
        event.preventDefault();
        selectedId = item.dataset.problem;
        ctx.render();
      }
    });
  });
  setupProblemDragging(ctx, locked);
  if (!selected) return;

  document.querySelector('[data-edit-problem]').addEventListener('click', () => openTextForm('Edit clinical problem', 'Clinical problem point', selected.text, text => {
    selected.text = text;
    ctx.setField('problems', ctx.session.problems);
    ctx.render();
  }));
  document.querySelector('[data-delete-problem]').addEventListener('click', () => {
    if (!confirm('Delete this problem and all of its hypotheses?')) return;
    ctx.setField('problems', ctx.session.problems.filter(problem => problem.id !== selected.id));
    ctx.setField('objectives', ctx.session.objectives.map(objective => ({
      ...objective, linkedProblemIds:objective.linkedProblemIds.filter(id => id !== selected.id)
    })));
    selectedId = undefined;
    ctx.render();
  });
  const addHypothesis = () => {
    const input = document.getElementById('hypothesis-input');
    const text = input.value.trim();
    if (!text) return;
    selected.hypotheses.push({ id:uid('hyp'), text, status:'none', validation:'pending', checked:false });
    ctx.setField('problems', ctx.session.problems);
    ctx.render();
  };
  document.getElementById('add-hypothesis').addEventListener('click', addHypothesis);
  document.getElementById('hypothesis-input').addEventListener('keydown', event => submitOnEnter(event, addHypothesis));
  document.querySelectorAll('[data-cycle]').forEach(button => button.addEventListener('click', () => {
    const hypothesis = selected.hypotheses.find(item => item.id === button.dataset.cycle);
    const prioritized = !isHypothesisPrioritized(hypothesis);
    Object.assign(hypothesis, { status:prioritized ? 'prioritized' : 'none', checked:prioritized });
    ctx.setField('problems', ctx.session.problems);
    ctx.render();
  }));
  document.querySelectorAll('[data-edit-hyp]').forEach(button => button.addEventListener('click', () => {
    const hypothesis = selected.hypotheses.find(item => item.id === button.dataset.editHyp);
    openTextForm('Edit hypothesis', 'Differential hypothesis', hypothesis.text, text => {
      hypothesis.text = text;
      ctx.setField('problems', ctx.session.problems);
      ctx.render();
    });
  }));
  document.querySelectorAll('[data-delete-hyp]').forEach(button => button.addEventListener('click', () => {
    selected.hypotheses = selected.hypotheses.filter(item => item.id !== button.dataset.deleteHyp);
    ctx.setField('problems', ctx.session.problems);
    ctx.render();
  }));
}

function problemButton(problem, index, locked) {
  return `<div class="list-item problem-list-item ${problem.id === selectedId ? 'selected' : ''}" data-problem="${esc(problem.id)}" role="button" tabindex="0"><span class="drag-handle" data-drag-problem="${esc(problem.id)}" title="Drag P${index + 1} to reorder">⠿</span><span class="code-badge">P${index + 1}</span><span class="list-item-main list-item-title">${esc(problem.text)}</span><span class="problem-count" title="${problem.hypotheses.length} hypotheses">${problem.hypotheses.length} H</span></div>`;
}

function setupProblemDragging(ctx, locked) {
  if (locked) return;
  const list = document.querySelector('.problem-list');
  let activeCleanup;
  ctx.onDispose?.(() => activeCleanup?.());
  document.querySelectorAll('[data-drag-problem]').forEach(handle => {
    handle.setAttribute('role', 'button');
    handle.tabIndex = 0;
    handle.setAttribute('aria-label', 'Reorder problem. Drag, or use Alt plus Up or Down.');
    handle.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const ids = ctx.session.problems.map(problem => problem.id);
      const index = ids.indexOf(handle.dataset.dragProblem);
      const next = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (next < 0 || next >= ids.length) return;
      [ids[index], ids[next]] = [ids[next], ids[index]];
      ctx.setField('problems', orderProblemsByIds(ctx.session.problems, ids));
      ctx.render();
      document.querySelector(`[data-drag-problem="${CSS.escape(handle.dataset.dragProblem)}"]`)?.focus();
    });
  });
  document.querySelectorAll('[data-drag-problem]').forEach(handle => handle.addEventListener('pointerdown', startEvent => {
    if (activeCleanup) return;
    if (startEvent.pointerType === 'mouse' && startEvent.button !== 0) return;
    const item = handle.closest('[data-problem]');
    const rect = item.getBoundingClientRect();
    const pointerOffsetY = startEvent.clientY - rect.top;
    const placeholder = document.createElement('div');
    placeholder.className = 'problem-drop-placeholder';
    placeholder.style.height = `${rect.height}px`;
    startEvent.preventDefault();
    list.insertBefore(placeholder, item);
    document.body.appendChild(item);
    item.classList.add('is-pointer-dragging');
    Object.assign(item.style, { left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px` });
    document.body.classList.add('problem-reordering');
    const scroller = document.querySelector('.main-shell');
    let pointerY = startEvent.clientY;
    let frame;
    const position = () => {
      item.style.top = `${pointerY - pointerOffsetY}px`;
      const next = [...list.querySelectorAll('[data-problem]')].find(sibling => {
        const siblingRect = sibling.getBoundingClientRect();
        return pointerY < siblingRect.top + siblingRect.height / 2;
      });
      list.insertBefore(placeholder, next || null);
    };
    const scroll = () => {
      const bounds = scroller.getBoundingClientRect();
      const toolbarBottom = document.querySelector('.topbar')?.getBoundingClientRect().bottom || bounds.top;
      const delta = pointerY < toolbarBottom + 45 ? -12 : pointerY > bounds.bottom - 45 ? 12 : 0;
      if (delta) { scroller.scrollTop += delta; position(); }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);

    const move = event => {
      if (event.pointerId !== startEvent.pointerId) return;
      event.preventDefault();
      pointerY = event.clientY;
      position();
    };
    const finish = event => {
      if (event.pointerId !== startEvent.pointerId) return;
      event?.preventDefault();
      cleanup();
      const orderedIds = [...list.querySelectorAll('[data-problem]')].map(problem => problem.dataset.problem);
      ctx.setField('problems', orderProblemsByIds(ctx.session.problems, orderedIds));
      ctx.render();
    };
    const cancel = event => {
      if (event?.pointerId !== undefined && event.pointerId !== startEvent.pointerId) return;
      event?.preventDefault();
      cleanup();
      ctx.render();
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      placeholder.replaceWith(item);
      item.classList.remove('is-pointer-dragging');
      item.removeAttribute('style');
      document.body.classList.remove('problem-reordering');
      activeCleanup = undefined;
    };
    activeCleanup = cleanup;
    window.addEventListener('pointermove', move, { passive:false });
    window.addEventListener('pointerup', finish, { passive:false });
    window.addEventListener('pointercancel', cancel, { passive:false });
    window.addEventListener('blur', cancel);
  }));
}

function selectedPanel(ctx, selected, locked) {
  return `<div class="problem-detail-head"><div class="list-item-main"><span class="code-badge">P${ctx.session.problems.indexOf(selected) + 1}</span><h3>${esc(selected.text)}</h3></div><div class="item-actions"><button class="button button-ghost" data-edit-problem aria-label="Edit problem" ${locked ? 'disabled' : ''}>✎</button><button class="button button-ghost" data-delete-problem aria-label="Delete problem" ${locked ? 'disabled' : ''}>🗑</button></div></div>
    <div class="form-row hypothesis-entry"><input id="hypothesis-input" class="input" placeholder="Enter a differential hypothesis…" ${locked ? 'disabled' : ''}><button id="add-hypothesis" class="button button-primary" ${locked ? 'disabled' : ''}>＋ Add hypothesis</button></div>
    <div class="list-stack mt-3">${selected.hypotheses.length ? selected.hypotheses.map((hypothesis, index) => hypothesisRow(hypothesis, index, locked)).join('') : emptyState('H', 'No hypotheses yet', 'Type a differential above and press Enter.')}</div>`;
}

function openTextForm(title, label, value, submit) {
  openFormModal(title, [{ name:'text', label, type:'textarea', value }], ({ text }) => submit(text.trim()));
}

function hypothesisRow(hypothesis, index, locked) {
  const type = isHypothesisPrioritized(hypothesis) ? 'prioritized' : '';
  const label = type ? 'Prioritize ★' : 'Unchecked';
  return `<article class="hypothesis-row ${type ? `status-${type}` : ''}"><button class="status-badge ${type ? `status-${type}` : ''}" data-cycle="${esc(hypothesis.id)}" ${locked ? 'disabled' : ''}>${label}</button><span class="code-badge">H${index + 1}</span><span class="hypothesis-text">${esc(hypothesis.text)}</span><div class="item-actions"><button class="button button-ghost" data-edit-hyp="${esc(hypothesis.id)}" ${locked ? 'disabled' : ''}>✎</button><button class="button button-ghost" data-delete-hyp="${esc(hypothesis.id)}" ${locked ? 'disabled' : ''}>🗑</button></div></article>`;
}

function submitOnEnter(event, submit) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  submit();
}
