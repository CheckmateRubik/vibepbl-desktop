import { fairRandomize } from '../src/js/pages/randomizer.js';

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
console.log('Fair randomizer passed 720 distribution scenarios.');
