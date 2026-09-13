import assert from 'node:assert/strict';
import { createSaveQueue } from '../src/js/save-queue.js';
import { normalizeLinks } from '../src/js/pages/objectives.js';
import { buildDrawRounds, createTwoRoundAssignments, currentAssignment, migrateAssignments } from '../src/js/pages/randomizer.js';
import { orderProblemsByIds } from '../src/js/pages/problems.js';
import { validationAfterEdit, verificationState } from '../src/js/pages/verification.js';
import { waitForPrintReady } from '../src/js/components/print-ready.js';

const problems = [{id:'p1',text:'One'}, {id:'p2',text:'Two'}];
const objectives = [{id:'lo1',text:'First',linkedProblemIds:['p1','p1','removed']}, {id:'lo2',text:'Second',linkedProblemIds:['p1','p2']}];
const normalized = normalizeLinks(objectives, problems);
assert.deepEqual(normalized.objectives.map(item => item.linkedProblemIds), [['p1'], ['p1','p2']]);
assert.equal(normalizeLinks(normalized.objectives, problems).changed, false);
const rounds = buildDrawRounds({problems,objectives:normalized.objectives});
assert.equal(rounds.mainTopics.length,3);
assert.equal(rounds.subtopics.length,3);
assert.equal(new Set([...rounds.mainTopics,...rounds.subtopics].map(item=>item.key)).size,6);
const reordered = buildDrawRounds({problems,objectives:[{...normalized.objectives[1],linkedProblemIds:['p2','p1']}]});
assert.equal(reordered.mainTopics[1].key,rounds.mainTopics[1].key);
assert.equal(currentAssignment({new:'',old:'Old presenter'}, {key:'new',legacyKey:'old'}),'');
assert.deepEqual(migrateAssignments({old:'Alice'},[{key:'new',legacyKey:'old'}]),{new:'Alice'});
assert.deepEqual(orderProblemsByIds(problems,['p2','p2','missing']).map(item=>item.id),['p2','p1']);
assert.deepEqual(verificationState({validation:'edited'}),{state:'edited',type:'edited',label:'Edited',canJudge:false});
assert.deepEqual(verificationState({validation:'added'}),{state:'added',type:'added',label:'Added new',canJudge:false});
assert.equal(validationAfterEdit('wrong'),'edited');
assert.equal(validationAfterEdit('added'),'added');
const largeRounds = {
  mainTopics:Array.from({length:10000},(_,number)=>({key:`m${number}`,number})),
  subtopics:Array.from({length:10000},(_,number)=>({key:`s${number}`,number}))
};
const largeDraw = createTwoRoundAssignments(['A','B','C'],largeRounds);
assert.equal(Object.keys(largeDraw.main).length,10000);
for(let number=0;number<10000;number++) assert.notEqual(largeDraw.main[`m${number}`],largeDraw.subtopics[`s${number}`]);

const writes=[];
const queue=createSaveQueue(async (field,value)=>writes.push([field,value]),()=>{},10000);
const edited=[{name:'before'}];
queue.enqueue('terms',edited,false);
edited[0].name='after';
await queue.flush();
assert.equal(writes[0][1][0].name,'before','Save must snapshot edits, not keep mutable references');
queue.enqueue('title','first',false);
queue.enqueue('title','latest',false);
await queue.flush();
assert.deepEqual(writes.at(-1),['title','latest']);
assert.equal(writes.length,2,'Debounced edits should coalesce');

let fail=true;
let saved;
const retry=createSaveQueue(async (_,value)=>{if(fail)throw Error('disk full');saved=value;},()=>{},10000);
assert.equal(await retry.enqueue('title','retained'),false);
await assert.rejects(retry.flush());
fail=false;await retry.flush();assert.equal(saved,'retained');

let rejectOld;
const raceWrites=[];
const race=createSaveQueue(async (_,value)=>{
  if(value==='old')await new Promise((_,reject)=>{rejectOld=reject;});
  raceWrites.push(value);
},()=>{},10000);
const old=race.enqueue('title','old');
await Promise.resolve();
const fresh=race.enqueue('title','new');
rejectOld(Error('old failed'));
await Promise.all([old,fresh]);await race.flush();
assert.deepEqual(raceWrites,['new'],'Failed old writes must never be restored over newer saves');
globalThis.location={protocol:'tauri:',hostname:'localhost'};
globalThis.window={};
const {API:macWithoutBridge}=await import('../src/js/api.js?mac-bridge-test');
await assert.rejects(macWithoutBridge.getSession(),/native desktop bridge failed/);
delete globalThis.location;delete globalThis.window;
let decoded=false;
globalThis.document={fonts:{ready:Promise.resolve()}};
await waitForPrintReady({querySelectorAll:()=>[{naturalWidth:1,decode:async()=>{decoded=true;}}]});
assert.equal(decoded,true);
await assert.rejects(waitForPrintReady({querySelectorAll:()=>[{naturalWidth:0,decode:async()=>{throw Error('Missing image');}}]}),/Missing image/);
delete globalThis.document;
console.log('Shared objectives, stable assignments, reorder, autosave snapshots/coalescing/retry/races passed.');
