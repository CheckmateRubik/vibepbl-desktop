import { buildDrawRounds, createTwoRoundAssignments, fairRandomize, fairRandomizeAvoiding } from '../src/js/pages/randomizer.js';
import { isHypothesisPrioritized, orderProblemsByIds } from '../src/js/pages/problems.js';

for (let membersCount = 1; membersCount <= 12; membersCount++) {
  for (let topicsCount = 0; topicsCount <= 60; topicsCount++) {
    const members = Array.from({ length: membersCount }, (_, index) => `Member ${index + 1}`);
    const topics = Array.from({ length: topicsCount }, (_, index) => `topic-${index + 1}`);
    const assignments = fairRandomize(members, topics);
    if (Object.keys(assignments).length !== topicsCount) throw new Error('A topic was not assigned.');
    const loads = members.map(member => Object.values(assignments).filter(name => name === member).length);
    if (Math.max(...loads) - Math.min(...loads) > 1) throw new Error('Distribution is not fair.');
  }
}

const drawRounds = buildDrawRounds({
  problems:[{ id:'p1', text:'Problem 1' }, { id:'p2', text:'Problem 2' }, { id:'p3', text:'Problem 3' }],
  objectives:[
    { id:'lo1', text:'Main 1', linkedProblemIds:['p1', 'p2'] },
    { id:'lo2', text:'Main 2', linkedProblemIds:['p3', 'removed'] }
  ]
});
if (drawRounds.mainTopics.length !== 3 || drawRounds.subtopics.length !== 3) throw new Error('The main-topic and subtopic rounds are not equal.');
if (!drawRounds.mainTopics.every(topic => topic.key.startsWith('main_')) || !drawRounds.subtopics.every(topic => topic.key.startsWith('sub_'))) throw new Error('Main and subtopic keys are not separated.');
if (drawRounds.mainTopics.map(topic => topic.number).join(',') !== '1,2,3' || drawRounds.subtopics.map(topic => topic.number).join(',') !== '1,2,3') throw new Error('Main topics and subtopics do not share matching number ranges.');

for (let membersCount = 2; membersCount <= 12; membersCount++) {
  for (let mainCount = 1; mainCount <= 12; mainCount++) {
    for (let subtopicCount = 1; subtopicCount <= 16; subtopicCount++) {
      const members = Array.from({ length:membersCount }, (_, index) => `Presenter ${index + 1}`);
      const rounds = {
        mainTopics:Array.from({ length:mainCount }, (_, index) => ({ key:`main-${index + 1}`, number:index + 1 })),
        subtopics:Array.from({ length:subtopicCount }, (_, index) => ({ key:`sub-${index + 1}`, number:index + 1 }))
      };
      const assignments = createTwoRoundAssignments(members, rounds);
      const overlap = Math.min(mainCount, subtopicCount);
      for (let index = 0; index < overlap; index++) {
        if (assignments.main[`main-${index + 1}`] === assignments.subtopics[`sub-${index + 1}`]) throw new Error(`Matching topic ${index + 1} was assigned to the same presenter.`);
      }
      for (const roundAssignments of [assignments.main, assignments.subtopics]) {
        const loads = members.map(member => Object.values(roundAssignments).filter(name => name === member).length);
        if (Math.max(...loads) - Math.min(...loads) > 1) throw new Error('A constrained round was not distributed fairly.');
      }
    }
  }
}

let onePresenterRejected = false;
try {
  fairRandomizeAvoiding(['Only presenter'], ['sub-1'], { 'sub-1':'Only presenter' });
} catch {
  onePresenterRejected = true;
}
if (!onePresenterRejected) throw new Error('An impossible same-number assignment was accepted for one presenter.');

const problems = [{ id:'p1' }, { id:'p2' }, { id:'p3' }, { id:'p4' }];
if (orderProblemsByIds(problems, ['p2', 'p4', 'p1', 'p3']).map(problem => problem.id).join(',') !== 'p2,p4,p1,p3') throw new Error('Pointer ordering failed.');
if (!isHypothesisPrioritized({ status:'prioritized' }) || !isHypothesisPrioritized({ status:'green' }) || isHypothesisPrioritized({ status:'none' })) throw new Error('Act 1 priority migration failed.');

console.log('Fair two-round randomizer, numbered exclusions, and ordering passed.');
