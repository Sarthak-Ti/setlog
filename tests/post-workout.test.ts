import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,chooseWorkout,finishWorkout,makeEntry,resizeSets,toggleCompletedSet,addPostWorkoutCardio,parseBackup,backupJSON,historyCSV,setCount,volume,type Session} from '../lib/workouts.ts';
import {mergeNotebooks} from '../lib/sync-merge.ts';

function strength(){const s=initialState();return chooseWorkout(s,s.queue[1].id);}
function savedStrength(){const s=strength();s.draft!.entries[0].sets[0]={...s.draft!.entries[0].sets[0],weight:75,reps:8,completed:true};return finishWorkout(s);}
const cardio:Session['cardio']={activity:'Run',duration:20,distance:null,heartRate:null,unit:'mi'};

test('completing a set overrides suggestions but preserves reps and completion of the next set',()=>{
 const s=strength(),entry=s.draft!.entries[0];entry.sets[0].weight=75;entry.sets[1].weight=50;entry.sets[1].reps=10;
 const next=toggleCompletedSet(entry,entry.sets[0].id);
 assert.equal(next.sets[0].completed,true);assert.equal(next.sets[1].weight,75);assert.equal(next.sets[1].reps,10);assert.equal(next.sets[1].completed,false);
 assert.equal(entry.sets[1].weight,50);assert.equal(next.sets[2],entry.sets[2]);assert.equal(s.draft!.entries[1].sets[0].weight,null);
});
test('carry-forward reaches the next unfinished set and leaves completed sets untouched',()=>{
 const entry=strength().draft!.entries[0];entry.sets[0].weight=0;entry.sets[1]={...entry.sets[1],weight:90,completed:true};
 const next=toggleCompletedSet(entry,entry.sets[0].id);assert.equal(next.sets[1],entry.sets[1]);assert.equal(next.sets[2].weight,0);
});
test('explicit weight edits, including a cleared weight, survive carry-forward and reload',()=>{
 for(const weight of [60,null]){let s=strength();const e=s.draft!.entries[0];e.sets[0].weight=75;e.sets[1]={...e.sets[1],weight,weightEdited:true};
 s=parseBackup(backupJSON(s));const loaded=s.draft!.entries[0],next=toggleCompletedSet(loaded,loaded.sets[0].id);assert.equal(next.sets[1].weight,weight);assert.equal(next.sets[1].weightEdited,true);}
});
test('unchecking and completing the final set do not propagate or add sets',()=>{
 const e=strength().draft!.entries[0];e.sets[0]={...e.sets[0],weight:75,completed:true};e.sets[1].weight=50;e.sets[2].weight=80;
 const unchecked=toggleCompletedSet(e,e.sets[0].id);assert.equal(unchecked.sets[1],e.sets[1]);
 const final=toggleCompletedSet(e,e.sets[2].id);assert.equal(final.sets.length,3);assert.equal(final.sets[0],e.sets[0]);assert.equal(final.sets[1],e.sets[1]);
 assert.throws(()=>toggleCompletedSet({...e,sets:[{...e.sets[2],weight:null}]},e.sets[2].id));
});
test('history weights become suggestions again in a new workout; new sets remain suggestions',()=>{
 const s=savedStrength();s.history[0].entries[0].sets[0].weightEdited=true;
 const e=makeEntry(s,s.history[0].entries[0].exerciseId,'push-a',2);assert.equal(e.sets[1].weightEdited,undefined);
 e.sets[0].weight=95;const next=toggleCompletedSet(e,e.sets[0].id);assert.equal(next.sets[1].weight,95);assert.equal(s.history[0].entries[0].sets[0].weight,75);
 assert.equal(resizeSets(next,3).sets[2].weightEdited,undefined);
});
test('optional cardio saves a normal history session and never changes queue, active draft, or timer',()=>{
 const s=savedStrength(),parent=s.history[0],next=addPostWorkoutCardio(s,parent.id,cardio);
 assert.equal(next.history.length,2);assert.equal(next.history[1],parent);assert.equal(next.history[0].queueId,null);assert.equal(next.history[0].kind,'cardio');assert.equal(next.history[0].afterWorkoutId,parent.id);
 assert.equal(next.queue,s.queue);assert.equal(next.draft,s.draft);assert.equal(next.timer,s.timer);assert.equal(next.cycle,s.cycle);assert.equal(next.queue.length,9);
 assert.equal(next.queue.filter(q=>q.templateId==='cardio').length,2);assert.equal(setCount(parent),1);assert.equal(volume(parent),600);
 assert.equal(next.history.filter(s=>s.kind==='cardio').reduce((sum,s)=>sum+(s.cardio.duration??0),0),20);
 assert.equal(addPostWorkoutCardio(next,parent.id,cardio),next);
});
test('cardio after the last strength day does not advance the new cycle',()=>{
 let s=strength();s.queue=[s.queue[0]];s.draft!.entries[0].sets[0]={...s.draft!.entries[0].sets[0],weight:0,completed:true};s=finishWorkout(s);
 const next=addPostWorkoutCardio(s,s.history[0].id,cardio);assert.equal(next.cycle,2);assert.equal(next.queue.length,10);assert.equal(next.history[0].cycle,1);
});
test('cardio rejects invalid numbers and non-strength parents without modifying saved strength',()=>{
 const s=savedStrength(),snapshot=backupJSON(s),id=s.history[0].id;
 for(const duration of [null,0,-1,NaN,Infinity,10001])assert.throws(()=>addPostWorkoutCardio(s,id,{...cardio,duration}));
 for(const distance of [-1,NaN,Infinity,10001])assert.throws(()=>addPostWorkoutCardio(s,id,{...cardio,distance}));
 for(const heartRate of [0,301,120.5,NaN])assert.throws(()=>addPostWorkoutCardio(s,id,{...cardio,heartRate}));
 assert.throws(()=>addPostWorkoutCardio(s,'missing',cardio));assert.deepEqual(parseBackup(snapshot),s);
});
test('extra cardio round-trips through JSON, CSV, and notebook merges with optional fields',()=>{
 const base=savedStrength(),next=addPostWorkoutCardio(base,base.history[0].id,{...cardio,activity:'Zone 2 Elliptical',distance:2.5,unit:'km',heartRate:135});
 assert.deepEqual(parseBackup(backupJSON(next)),next);
 const csv=historyCSV(next);assert.ok(csv.includes('Zone 2 Elliptical'));assert.ok(csv.includes('"20","135","2.5","km"'));
 const other=structuredClone(base);other.settings.sound=true;const merged=mergeNotebooks(base,next,other);
 assert.equal(merged.history.length,2);assert.deepEqual(merged.history.find(s=>s.kind==='cardio')!.cardio,next.history[0].cardio);assert.equal(merged.settings.sound,true);assert.deepEqual(merged.queue,base.queue);
});
