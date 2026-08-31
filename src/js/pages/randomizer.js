import { esc, pageHeader } from '../components/helpers.js';

let customNames = [];
let rolling = false;

const shuffle = array => {
  const copy = [...array];
  for (let index = copy.length - 1; index > 0; index--) {
    const random = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[random]] = [copy[random], copy[index]];
  }
  return copy;
};

export function fairRandomize(members, topicKeys) {
  if (!members.length || !topicKeys.length) return {};
  const baseSlots = Math.floor(topicKeys.length / members.length);
  const remainder = topicKeys.length % members.length;
  const pool = [];
  members.forEach(member => { for (let index = 0; index < baseSlots; index++) pool.push(member); });
  shuffle(members).slice(0, remainder).forEach(member => pool.push(member));
  const fairQueue = shuffle(pool);
  return Object.fromEntries(topicKeys.map((key, index) => [key, fairQueue[index]]));
}

export function fairRandomizeAvoiding(members, topicKeys, forbiddenByKey = {}) {
  const uniqueMembers = [...new Set(members)];
  if (!uniqueMembers.length || !topicKeys.length) return {};
  if (uniqueMembers.length === 1 && topicKeys.some(key => forbiddenByKey[key] === uniqueMembers[0])) {
    throw new Error('At least two presenters are required for different main and subtopic numbers.');
  }

  const baseSlots = Math.floor(topicKeys.length / uniqueMembers.length);
  const remainder = topicKeys.length % uniqueMembers.length;
  const memberOrder = shuffle(uniqueMembers);

  // Each rotation gives a different presenter the remainder slot while keeping
  // every presenter's round load within one assignment of the others.
  for (let offset = 0; offset < uniqueMembers.length; offset++) {
    const extraMembers = new Set(Array.from({ length:remainder }, (_, index) => memberOrder[(offset + index) % memberOrder.length]));
    const slots = shuffle(memberOrder.flatMap(member => Array.from({ length:baseSlots + (extraMembers.has(member) ? 1 : 0) }, () => member)));
    const slotTopic = Array(slots.length).fill(-1);
    const topicSlot = Array(topicKeys.length).fill(-1);
    const slotChoices = topicKeys.map(key => shuffle(slots.map((_, index) => index)).filter(index => slots[index] !== forbiddenByKey[key]));
    const topicOrder = shuffle(topicKeys.map((_, index) => index)).sort((left, right) => slotChoices[left].length - slotChoices[right].length);

    const placeTopic = (topicIndex, visitedSlots) => {
      for (const slotIndex of slotChoices[topicIndex]) {
        if (visitedSlots.has(slotIndex)) continue;
        visitedSlots.add(slotIndex);
        const displacedTopic = slotTopic[slotIndex];
        if (displacedTopic === -1 || placeTopic(displacedTopic, visitedSlots)) {
          slotTopic[slotIndex] = topicIndex;
          topicSlot[topicIndex] = slotIndex;
          return true;
        }
      }
      return false;
    };

    if (topicOrder.every(topicIndex => placeTopic(topicIndex, new Set()))) {
      return Object.fromEntries(topicKeys.map((key, index) => [key, slots[topicSlot[index]]]));
    }
  }

  throw new Error('The presenter pool cannot satisfy the numbered topic rule.');
}

export function createTwoRoundAssignments(members, rounds) {
  const mainKeys = rounds.mainTopics.map(topic => topic.key);
  const subtopicKeys = rounds.subtopics.map(topic => topic.key);

  // Draw the shorter round first. Its assignments are already balanced, so the
  // longer round can remain balanced while avoiding every matching number.
  if (mainKeys.length <= subtopicKeys.length) {
    const main = fairRandomize(members, mainKeys);
    const mainByNumber = Object.fromEntries(rounds.mainTopics.map(topic => [topic.number, main[topic.key]]));
    const forbiddenByKey = Object.fromEntries(rounds.subtopics.map(topic => [topic.key, mainByNumber[topic.number] || '']));
    return { main, subtopics:fairRandomizeAvoiding(members, subtopicKeys, forbiddenByKey) };
  }

  const subtopics = fairRandomize(members, subtopicKeys);
  const subtopicByNumber = Object.fromEntries(rounds.subtopics.map(topic => [topic.number, subtopics[topic.key]]));
  const forbiddenByKey = Object.fromEntries(rounds.mainTopics.map(topic => [topic.key, subtopicByNumber[topic.number] || '']));
  return { main:fairRandomizeAvoiding(members, mainKeys, forbiddenByKey), subtopics };
}

export function buildDrawRounds(session) {
  const mainTopics = [];
  const subtopics = [];
  session.objectives.forEach((objective, loIndex) => {
    const loLabel = `LO${loIndex + 1} · ${objective.text}`;
    objective.linkedProblemIds.forEach((problemId, linkedIndex) => {
      const problemIndex = session.problems.findIndex(problem => problem.id === problemId);
      if (problemIndex < 0) return;
      const number = mainTopics.length + 1;
      const problemDetail = `P${problemIndex + 1} · ${session.problems[problemIndex].text}`;
      mainTopics.push({
        key:linkedIndex === 0 ? `main_${objective.id}` : `main_${objective.id}_${problemId}`,
        number,
        kind:'main',
        roundLabel:'Main topic',
        label:loLabel,
        detail:`${problemDetail} · Leads and prioritizes this topic`
      });
      subtopics.push({
        key:`sub_${objective.id}_${problemId}`,
        legacyKey:`${objective.id}_${problemId}`,
        number,
        kind:'subtopic',
        roundLabel:'Subtopic',
        label:loLabel,
        detail:problemDetail
      });
    });
  });
  return { mainTopics, subtopics };
}

export function renderRandomizer(ctx) {
  const rounds = buildDrawRounds(ctx.session);
  const topics = [...rounds.mainTopics, ...rounds.subtopics];
  const people = [...new Set([...ctx.members.map(member => member.name), ...customNames])];
  const needsTwoPresenters = rounds.mainTopics.length > 0 && rounds.subtopics.length > 0;
  const canDraw = people.length > 0 && rounds.mainTopics.length > 0 && (!needsTwoPresenters || people.length > 1) && !rolling;
  document.getElementById('page').innerHTML = `
    ${pageHeader('Presenter randomizer', 'Draw presenters in two fair rounds. Matching main-topic and subtopic numbers always go to different presenters.', `<button id="randomize" class="button button-primary" ${canDraw ? '' : 'disabled'}>♜ Draw two rounds</button>`)}
    <div class="split-layout">
      <section class="card"><h3 class="section-title">Presenter pool <span class="muted small">(${people.length})</span></h3><div class="form-row"><input id="custom-name" class="input" data-randomizer-control placeholder="Presenter name"><button id="add-custom" class="button button-secondary" data-randomizer-control>Add</button></div><div class="roster-list mt-3">${people.length ? people.map(name => `<span class="member-chip">${esc(name)}${customNames.includes(name) ? `<button class="button button-ghost button-sm" data-remove-custom="${esc(name)}" data-randomizer-control>✕</button>` : ''}</span>`).join('') : '<span class="muted">Enter presenter names above.</span>'}</div></section>
      <section class="card topic-queue"><h3 class="section-title">Draw queue <span class="muted small">(${topics.length})</span></h3>${roundQueue('Round 1 · Main topics', rounds.mainTopics)}${roundQueue('Round 2 · Subtopics', rounds.subtopics)}</section>
    </div>
    <section class="card"><div class="random-stage"><div id="slot-round" class="small muted">TWO-ROUND DRAW</div><div id="slot-name" class="slot-name">Ready when you are</div><div id="slot-topic" class="draw-topic muted">${needsTwoPresenters && people.length === 1 ? 'Add another presenter so matching topic numbers can be separated.' : 'Main topics will be assigned before subtopics.'}</div></div><div class="assignment-grid">${topics.map(topic => assignmentCard(topic, currentAssignment(ctx.session.presenterAssignments, topic), people, rounds, ctx.session.presenterAssignments)).join('')}</div></section>`;
  const addCustom = () => {
    const input = document.getElementById('custom-name');
    const name = input.value.trim();
    if (!name || people.some(item => item.toLowerCase() === name.toLowerCase())) return;
    customNames.push(name);
    renderRandomizer(ctx);
  };
  document.getElementById('add-custom').addEventListener('click', addCustom);
  document.getElementById('custom-name').addEventListener('keydown', event => { if (event.key === 'Enter') addCustom(); });
  document.querySelectorAll('[data-remove-custom]').forEach(button => button.addEventListener('click', () => {
    customNames = customNames.filter(name => name !== button.dataset.removeCustom);
    renderRandomizer(ctx);
  }));
  document.querySelectorAll('[data-assignment]').forEach(select => select.addEventListener('change', async () => {
    const topic = topics.find(item => item.key === select.dataset.assignment);
    const counterpart = matchingNumberTopic(rounds, topic);
    const counterpartPresenter = counterpart ? currentAssignment(ctx.session.presenterAssignments, counterpart) : '';
    if (select.value && select.value === counterpartPresenter) {
      select.value = select.dataset.previous || '';
      ctx.showToast(`${topic.roundLabel} ${topic.number} must have a different presenter from ${counterpart.roundLabel.toLowerCase()} ${counterpart.number}`, 'error');
      return;
    }
    const next = { ...ctx.session.presenterAssignments, [select.dataset.assignment]:select.value };
    await ctx.setField('presenterAssignments', next);
    renderRandomizer(ctx);
  }));
  document.getElementById('randomize').addEventListener('click', () => animateDraw(ctx, people, rounds));
}

function roundQueue(title, topics) {
  return `<div class="draw-queue-round"><h4>${title}</h4>${topics.length ? topics.map(topic => `<div class="list-item"><span class="code-badge">${topic.number}</span><div><strong>${esc(topic.label)}</strong><div class="small muted">${esc(topic.detail)}</div></div></div>`).join('') : '<p class="small muted">No linked problem subtopics in this round.</p>'}</div>`;
}

function currentAssignment(assignments, topic) {
  return assignments[topic.key] || (topic.legacyKey ? assignments[topic.legacyKey] : '') || '';
}

function matchingNumberTopic(rounds, topic) {
  if (!topic) return null;
  const oppositeRound = topic.kind === 'main' ? rounds.subtopics : rounds.mainTopics;
  return oppositeRound.find(candidate => candidate.number === topic.number) || null;
}

function assignmentCard(topic, assigned, people, rounds, assignments) {
  const counterpart = matchingNumberTopic(rounds, topic);
  const forbiddenPresenter = counterpart ? currentAssignment(assignments, counterpart) : '';
  return `<article class="assignment-card" data-assignment-card="${esc(topic.key)}" data-topic-kind="${topic.kind}" data-topic-number="${topic.number}"><div class="assignment-kind ${topic.kind}">${esc(topic.roundLabel)} ${topic.number}</div><div class="assignment-topic"><strong>${esc(topic.label)}</strong><br>${esc(topic.detail)}</div><select class="select" data-assignment="${esc(topic.key)}" data-previous="${esc(assigned)}"><option value="">Not assigned</option>${people.map(name => `<option value="${esc(name)}" ${assigned === name ? 'selected' : ''} ${forbiddenPresenter === name && assigned !== name ? 'disabled' : ''}>${esc(name)}</option>`).join('')}</select></article>`;
}

async function animateDraw(ctx, people, rounds) {
  rolling = true;
  document.getElementById('randomize').disabled = true;
  document.querySelectorAll('[data-randomizer-control],[data-assignment]').forEach(control => { control.disabled = true; });
  const stageRound = document.getElementById('slot-round');
  const stageName = document.getElementById('slot-name');
  const stageTopic = document.getElementById('slot-topic');
  let plannedAssignments;
  try {
    plannedAssignments = createTwoRoundAssignments(people, rounds);
  } catch (error) {
    rolling = false;
    ctx.showToast(error.message, 'error');
    renderRandomizer(ctx);
    return;
  }
  const drawRounds = [
    { label:'ROUND 1 · MAIN TOPICS', topics:rounds.mainTopics, assignments:plannedAssignments.main },
    { label:'ROUND 2 · SUBTOPICS', topics:rounds.subtopics, assignments:plannedAssignments.subtopics }
  ];
  let savedAssignments = { ...ctx.session.presenterAssignments };

  for (const [roundIndex, round] of drawRounds.entries()) {
    if (!round.topics.length) continue;
    if (roundIndex > 0) {
      stageRound.textContent = round.label;
      stageName.textContent = 'Round 2';
      stageTopic.textContent = 'Now drawing the linked problem subtopics.';
      await pause(650);
    }
    for (const topic of round.topics) {
      stageRound.textContent = round.label;
      stageTopic.textContent = `${topic.roundLabel} ${topic.number}: ${topic.label} — ${topic.detail}`;
      for (let tick = 0; tick < 10; tick++) {
        stageName.textContent = people[Math.floor(Math.random() * people.length)];
        await pause(38 + tick * 9);
      }
      const presenter = round.assignments[topic.key];
      stageName.textContent = presenter;
      savedAssignments = { ...savedAssignments, [topic.key]:presenter };
      await ctx.setField('presenterAssignments', savedAssignments);
      const select = document.querySelector(`[data-assignment="${CSS.escape(topic.key)}"]`);
      if (select) select.value = presenter;
      const card = document.querySelector(`[data-assignment-card="${CSS.escape(topic.key)}"]`);
      card?.classList.add('just-drawn');
      await pause(360);
      card?.classList.remove('just-drawn');
    }
  }

  rolling = false;
  ctx.showToast('Both presenter rounds were saved', 'success');
  renderRandomizer(ctx);
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
