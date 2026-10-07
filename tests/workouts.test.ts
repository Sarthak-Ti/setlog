import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dragTarget,swipeOutcome,shiftedRow} from '../lib/queue-gestures.ts';
import {initialState,viewWorkout,chooseWorkout,finishWorkout,takeExtraRest,makeDraft,lastEntry,makeEntry,parseBackup,backupJSON,historyCSV,move,parseState,fuzzyMatch,resizeSets,addQueueSession,applyCycleEdits,appendWorkout,removeQueueWorkout,createWorkoutTemplate,rankedWorkouts} from '../lib/workouts.ts';

test('default split has ten distinct occurrences and preserves original order on manual selection',()=>{
 const s=initialState();assert.equal(s.queue.length,10);assert.equal(new Set(s.queue.map(q=>q.id)).size,10);
 assert.deepEqual(s.queue.map(q=>q.templateId),['cardio','push-a','leg-a','pull-a','rest','cardio','push-b','leg-b','pull-b','rest']);
 const selected=s.queue[3];const next=chooseWorkout(s,selected.id);assert.equal(next.draft?.templateId,'pull-a');assert.deepEqual(next.queue.slice(1),s.queue.filter(q=>q.id!==selected.id));
});
test('only finishing advances the queue; completed sets seed suggestions without being completed',()=>{
 let s=initialState();s=chooseWorkout(s,s.queue[1].id);
 assert.throws(()=>finishWorkout(s));const draft=s.draft!;draft.entries[0].sets[0]={...draft.entries[0].sets[0],weight:75,reps:8,completed:true};
 const next=finishWorkout(s);assert.equal(next.queue.length,9);assert.equal(next.history[0].name,'Push A');assert.equal(next.history[0].entries[0].sets.filter(s=>s.completed).length,1);
 const suggestion=makeEntry(next,draft.entries[0].exerciseId,'push-a');assert.equal(suggestion.sets.length,1);assert.equal(suggestion.sets[0].weight,75);assert.equal(suggestion.sets[0].completed,false);
});
test('unscheduled rest preserves draft, queue and records only once per local day',()=>{
 const s=initialState(),r=takeExtraRest(s);assert.deepEqual(r.queue,s.queue);assert.deepEqual(r.draft,s.draft);assert.equal(r.history.length,1);assert.equal(takeExtraRest(r).history.length,1);
});
test('a new full cycle begins after its final scheduled rest',()=>{
 const s=initialState();s.queue=[s.queue.at(-1)!];s.draft=makeDraft(s,s.queue[0]);const next=finishWorkout(s);assert.equal(next.cycle,2);assert.equal(next.queue.length,10);assert.equal(next.draft?.templateId,'cardio');assert.ok(next.queue.every(q=>q.cycle===2));
});
test('cardio duration is required and optional metrics stay optional',()=>{
 const s=initialState();assert.throws(()=>finishWorkout(s));s.draft!.cardio.duration=25;const n=finishWorkout(s);assert.equal(n.history[0].cardio.heartRate,null);assert.equal(n.history[0].cardio.duration,25);
});
test('backup round-trip keeps library, active sets, queue, timer, settings and history',()=>{
 let s=initialState();s=takeExtraRest(s);s=chooseWorkout(s,s.queue[2].id);s.draft!.entries[0].sets[0].weight=95;s.timer.endsAt=Date.now()+60000;s.settings.sound=true;
 assert.deepEqual(parseBackup(backupJSON(s)),s);assert.throws(()=>parseBackup('{"format":"setlog","version":99,"data":{}}'));assert.throws(()=>parseState({...s,queue:[{id:'x',templateId:'missing',cycle:1}]}));
});
test('last performance prefers same routine and histories remain snapshots',()=>{
 let s=initialState();s=chooseWorkout(s,s.queue[1].id);const e=s.draft!.entries[0];e.sets[0]={...e.sets[0],weight:75,reps:8,completed:true};s=finishWorkout(s);s.library.find(x=>x.id===e.exerciseId)!.name='Renamed';assert.equal(s.history[0].entries[0].name,'Incline DB Press');assert.equal(lastEntry(s,e.exerciseId,'push-a')?.entry.sets[0].weight,75);
});
test('CSV escapes spreadsheet formulas and quotes; fuzzy search supports abbreviations',()=>{
 let s=takeExtraRest(initialState());s.history[0].notes='=SUM(1,2)';const csv=historyCSV(s);assert.ok(csv.includes("'=SUM(1,2)"));assert.ok(fuzzyMatch('Cable Lat Pulldown','clpd'));assert.deepEqual(move([1,2,3],2,0),[3,1,2]);
});

test('removing earlier sessions starts mid-cycle without recording fake history or changing default split',()=>{
 const s=initialState(),edited=s.queue.slice(3),next=applyCycleEdits(s,edited);
 assert.equal(next.draft?.templateId,'pull-a');assert.deepEqual(next.queue,edited);assert.deepEqual(next.defaultOrder,s.defaultOrder);assert.deepEqual(next.history,[]);assert.equal(next.cycle,1);
 const empty=applyCycleEdits(s,[]);assert.equal(empty.queue.length,0);assert.equal(empty.draft,null);assert.equal(s.queue.length,10);
});
test('repeating days creates independent occurrences, and finishing one leaves the other queued',()=>{
 let s=initialState();const queue=addQueueSession(s.queue,'cardio',s.cycle,0);
 assert.equal(queue.length,11);assert.equal(queue[0].templateId,queue[1].templateId);assert.notEqual(queue[0].id,queue[1].id);
 s=applyCycleEdits(s,queue);s.draft!.cardio.duration=20;const done=finishWorkout(s);
 assert.equal(done.draft?.queueId,queue[1].id);assert.equal(done.draft?.cardio.duration,null);assert.equal(done.history.length,1);
 assert.deepEqual(parseBackup(backupJSON(done)),done);
});
test('new sessions can be appended to an empty editor and saved',()=>{
 const s=initialState(),queue=addQueueSession([],'rest',s.cycle),next=applyCycleEdits(s,queue);
 assert.equal(next.queue.length,1);assert.equal(next.draft?.kind,'rest');assert.equal(finishWorkout(next).cycle,2);
});
test('editing future sessions preserves active sets and timer; removing active draft clears only the draft',()=>{
 let s=initialState();s=chooseWorkout(s,s.queue[1].id);s.draft!.startedAt=new Date().toISOString();s.draft!.entries[0].sets[0]={...s.draft!.entries[0].sets[0],weight:75,reps:8,completed:true};s.timer.endsAt=Date.now()+60000;
 const q=addQueueSession(s.queue,'push-b',s.cycle),next=applyCycleEdits(s,q);
 assert.deepEqual(next.draft,s.draft);assert.deepEqual(next.timer,s.timer);
 assert.throws(()=>applyCycleEdits(s,move(s.queue,0,1)));
 const removed=applyCycleEdits(s,s.queue.slice(1));assert.equal(removed.draft?.templateId,'cardio');assert.equal(removed.timer.endsAt,null);assert.deepEqual(removed.history,s.history);
});
test('set count can shrink to two or grow without completing new sets or mutating history',()=>{
 let s=initialState();s=chooseWorkout(s,s.queue[1].id);const original=s.draft!.entries[0];original.sets[0]={...original.sets[0],weight:75,reps:8,completed:true};
 const two=resizeSets(original,2);assert.equal(two.sets.length,2);assert.equal(two.sets[0].completed,true);assert.equal(original.sets.length,3);
 const four=resizeSets(two,4);assert.equal(four.sets.length,4);assert.ok(four.sets.slice(2).every(s=>!s.completed));assert.equal(new Set(four.sets.map(s=>s.id)).size,4);
 assert.throws(()=>resizeSets(two,0));assert.throws(()=>resizeSets(two,101));
});
test('saved routine set counts override history length while retaining last weights and reps',()=>{
 let s=initialState();s=chooseWorkout(s,s.queue[1].id);const exId=s.draft!.entries[0].exerciseId;s.draft!.entries[0].sets=s.draft!.entries[0].sets.map((s,i)=>({...s,weight:75,reps:8-i,completed:true}));s=finishWorkout(s);
 const t=s.templates.find(t=>t.id==='push-a')!;t.exercises[0].sets=2;
 const d=makeDraft(s,{id:'test-queue',templateId:'push-a',cycle:1});assert.equal(d.entries[0].sets.length,2);assert.deepEqual(d.entries[0].sets.map(s=>s.reps),[8,7]);assert.ok(d.entries[0].sets.every(s=>s.weight===75&&!s.completed));assert.equal(s.history[0].entries[0].sets.length,3);
 const four=makeEntry(s,exId,'push-a',4);assert.equal(four.sets.length,4);assert.equal(four.sets[3].reps,6);
});


test('removing a queued workout preserves its reusable template and allows adding it again',()=>{
 const s=initialState(),id=s.queue[1].id,templateId=s.queue[1].templateId;
 const removed=removeQueueWorkout(s,id);assert.equal(removed.queue.length,9);assert.deepEqual(removed.templates,s.templates);
 const added=appendWorkout(removed,templateId);assert.equal(added.queue.length,10);assert.equal(added.queue.at(-1)?.templateId,templateId);assert.notEqual(added.queue.at(-1)?.id,id);assert.deepEqual(added.defaultOrder,s.defaultOrder);
});
test('an empty cycle survives backup/reload and begins with the next explicitly added workout',()=>{
 let s=initialState();for(const q of [...s.queue])s=removeQueueWorkout(s,q.id);
 assert.equal(s.queue.length,0);assert.equal(s.draft,null);assert.deepEqual(parseBackup(backupJSON(s)),s);assert.equal(s.history.length,0);
 const restored=appendWorkout(s,'pull-b');assert.equal(restored.queue.length,1);assert.equal(restored.draft?.name,'Pull B');assert.equal(restored.cycle,s.cycle);
});
test('creating a workout saves its selected exercises in order without appending to or altering the cycle',()=>{
 const s=initialState(),ids=[s.library[4].id,s.library[0].id,s.library[6].id];
 const saved=createWorkoutTemplate(s,'  Upper / Lower  ',ids);const t=saved.templates.at(-1)!;
 assert.equal(t.name,'Upper / Lower');assert.deepEqual(t.exercises.map(e=>e.exerciseId),ids);assert.deepEqual(saved.queue,s.queue);assert.deepEqual(saved.draft,s.draft);assert.deepEqual(saved.defaultOrder,s.defaultOrder);
 assert.deepEqual(parseBackup(backupJSON(saved)),saved);
 const used=appendWorkout(saved,t.id);assert.equal(used.queue.at(-1)?.templateId,t.id);
 const today=chooseWorkout(used,used.queue.at(-1)!.id);assert.equal(today.draft?.name,'Upper / Lower');assert.deepEqual(today.draft?.entries.map(e=>e.exerciseId),ids);
});
test('creation rejects duplicate names, empty selection, and invalid exercise IDs',()=>{
 const s=initialState(),ids=[s.library[0].id];
 assert.throws(()=>createWorkoutTemplate(s,'push a',ids));assert.throws(()=>createWorkoutTemplate(s,'Custom',[]));assert.throws(()=>createWorkoutTemplate(s,'Custom',['missing']));
 const saved=createWorkoutTemplate(s,'Custom',ids);assert.throws(()=>createWorkoutTemplate(saved,' CUSTOM ',ids));assert.equal(s.templates.length,8);
});
test('workout search ranks exact matches before prefixes and fuzzy matches',()=>{
 const s=createWorkoutTemplate(initialState(),'Push A extra',['ex-1']);
 assert.equal(rankedWorkouts(s.templates,'Push A')[0].name,'Push A');assert.equal(rankedWorkouts(s.templates,'Push A')[1].name,'Push A extra');assert.ok(rankedWorkouts(s.templates,'plb').some(t=>t.name==='Pull B'));assert.equal(rankedWorkouts(s.templates,'unmatched qzx').length,0);
});

test('drag target follows row centers, respects active-session pinning, and shifts intervening rows',()=>{
 const centers=[45,145,245,345];assert.equal(dragTarget(centers,240),2);assert.equal(dragTarget(centers,20,1),1);assert.equal(dragTarget(centers,500),3);assert.equal(shiftedRow(1,0,2,100),-100);assert.equal(shiftedRow(1,3,0,100),100);assert.equal(shiftedRow(3,0,2,100),0);
});
test('swipes distinguish accidental horizontal movement, reveal, and full removal at phone/desktop widths',()=>{
 assert.equal(swipeOutcome(-20,330),'close');assert.equal(swipeOutcome(-70,330),'reveal');assert.equal(swipeOutcome(-200,330),'remove');assert.equal(swipeOutcome(-200,700),'reveal');assert.equal(swipeOutcome(-230,700),'remove');assert.equal(swipeOutcome(10,330),'close');
});

test('viewing a different day preserves cycle order, active sets, history and timer',()=>{
 const s=initialState();s.draft!.startedAt=new Date().toISOString();s.draft!.cardio.duration=17;s.timer.endsAt=Date.now()+60000;
 const before=backupJSON(s),originalDraft=s.draft,selected=s.queue[3],preview=viewWorkout(s,selected.id);
 assert.equal(preview?.queueId,selected.id);assert.equal(preview?.name,'Pull A');
 assert.equal(s.draft,originalDraft);assert.equal(s.draft!.cardio.duration,17);
 assert.deepEqual(parseBackup(before),s);assert.equal(viewWorkout(s,null),originalDraft);
 assert.equal(viewWorkout(s,s.draft!.queueId),originalDraft);
});
test('browsing repeated days uses occurrence IDs and falls back when the viewed day was removed',()=>{
 let s=initialState();const a=viewWorkout(s,s.queue[0].id),b=viewWorkout(s,s.queue[5].id);
 assert.equal(a?.templateId,b?.templateId);assert.notEqual(a?.queueId,b?.queueId);
 const id=s.queue[5].id;s=removeQueueWorkout(s,id);assert.equal(viewWorkout(s,id),s.draft);
 const empty=applyCycleEdits(s,[]);assert.equal(viewWorkout(empty,id),null);
});
