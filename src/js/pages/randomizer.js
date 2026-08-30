import { esc, emptyState, pageHeader } from '../components/helpers.js';

let customNames = [];
let rolling = false;

export function fairRandomize(members, topicKeys) {
  if (!members.length || !topicKeys.length) return {};
  const shuffle = array => {
    const copy = [...array];
    for (let index = copy.length - 1; index > 0; index--) {
      const random = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[random]] = [copy[random], copy[index]];
    }
    return copy;
  };
  const baseSlots = Math.floor(topicKeys.length / members.length);
  const remainder = topicKeys.length % members.length;
  const pool = [];
  members.forEach(member => { for (let index = 0; index < baseSlots; index++) pool.push(member); });
  shuffle(members).slice(0, remainder).forEach(member => pool.push(member));
  const fairQueue = shuffle(pool);
  return Object.fromEntries(topicKeys.map((key, index) => [key, fairQueue[index]]));
}

export function renderRandomizer(ctx) {
  const topics = buildTopics(ctx.session);
  const people = [...ctx.members.map(member => member.name), ...customNames];
  document.getElementById('page').innerHTML = `
    ${pageHeader('Presenter randomizer', 'Assign every linked learning topic fairly. No person receives more than one topic above another.', `<button id="randomize" class="button button-primary" ${!people.length || !topics.length || rolling ? 'disabled' : ''}>♜ Randomize fairly</button>`)}
    <div class="split-layout">
      <section class="card"><h3 class="section-title">Presenter pool <span class="muted small">(${people.length})</span></h3><div class="form-row"><input id="custom-name" class="input" placeholder="Presenter name"><button id="add-custom" class="button button-secondary">Add</button></div><div class="roster-list mt-3">${people.length ? people.map(name => `<span class="member-chip">${esc(name)}${customNames.includes(name) ? `<button class="button button-ghost button-sm" data-remove-custom="${esc(name)}">✕</button>` : ''}</span>`).join('') : '<span class="muted">Enter presenter names above.</span>'}</div></section>
      <section class="card"><h3 class="section-title">Topic queue <span class="muted small">(${topics.length})</span></h3>${topics.length ? topics.map((topic, index) => `<div class="list-item"><span class="code-badge">${index + 1}</span><div><strong>${esc(topic.label)}</strong><div class="small muted">${esc(topic.problemLabel)}</div></div></div>`).join('') : emptyState('▱', 'No assignable topics', 'Add learning objectives and link them to problem points in Act 1.')}</section>
    </div>
    <section class="card"><div class="random-stage"><div class="small muted">NOW DRAWING</div><div id="slot-name" class="slot-name">Ready when you are</div></div><div class="assignment-grid">${topics.map(topic => assignmentCard(topic, ctx.session.presenterAssignments[topic.key], people)).join('')}</div></section>`;
  const addCustom = () => { const input = document.getElementById('custom-name'); const name = input.value.trim(); if (!name || people.some(item => item.toLowerCase() === name.toLowerCase())) return; customNames.push(name); renderRandomizer(ctx); };
  document.getElementById('add-custom').addEventListener('click', addCustom);
  document.getElementById('custom-name').addEventListener('keydown', event => { if (event.key === 'Enter') addCustom(); });
  document.querySelectorAll('[data-remove-custom]').forEach(button => button.addEventListener('click', () => { customNames = customNames.filter(name => name !== button.dataset.removeCustom); renderRandomizer(ctx); }));
  document.querySelectorAll('[data-assignment]').forEach(select => select.addEventListener('change', () => { const next = { ...ctx.session.presenterAssignments, [select.dataset.assignment]: select.value }; ctx.setField('presenterAssignments', next); }));
  document.getElementById('randomize').addEventListener('click', () => animateDraw(ctx, people, topics));
}

function buildTopics(session) {
  const topics = [];
  session.objectives.forEach((objective, loIndex) => {
    const links = objective.linkedProblemIds.length ? objective.linkedProblemIds : [null];
    links.forEach(problemId => {
      const problemIndex = session.problems.findIndex(problem => problem.id === problemId);
      topics.push({ key: `${objective.id}_${problemId || 'general'}`, label: `LO${loIndex + 1} · ${objective.text}`, problemLabel: problemIndex >= 0 ? `P${problemIndex + 1} · ${session.problems[problemIndex].text}` : 'General learning objective' });
    });
  });
  return topics;
}
function assignmentCard(topic, assigned, people) { return `<article class="assignment-card"><div class="assignment-topic">${esc(topic.label)}<br>${esc(topic.problemLabel)}</div><select class="select" data-assignment="${esc(topic.key)}"><option value="">Not assigned</option>${people.map(name => `<option value="${esc(name)}" ${assigned === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></article>`; }
async function animateDraw(ctx, people, topics) {
  rolling = true; document.getElementById('randomize').disabled = true;
  const assignments = fairRandomize(people, topics.map(topic => topic.key));
  const slot = document.getElementById('slot-name');
  for (const topic of topics) {
    for (let tick = 0; tick < 13; tick++) {
      slot.textContent = people[Math.floor(Math.random() * people.length)];
      await new Promise(resolve => setTimeout(resolve, 45 + tick * 12));
    }
    slot.textContent = assignments[topic.key];
    await new Promise(resolve => setTimeout(resolve, 260));
  }
  ctx.setField('presenterAssignments', assignments); rolling = false; ctx.showToast('Fair assignments saved', 'success'); renderRandomizer(ctx);
}
