import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,chooseWorkout,finishWorkout,parseState,parseBackup,backupJSON,historyCSV,overallPlan,saveOverallPlan,restartPlan,makeDraft,mergeExercises,exerciseHistory,activeExercises,makeEntry,updateSavedSession,addPostWorkoutCardio,type Session} from '../lib/workouts.ts';
import {mergeNotebooks,SyncConflict,equal} from '../lib/sync-merge.ts';
import {NotebookSync,type LocalRecord} from '../lib/notebook-sync.ts';
import {saveDraftRoutine} from '../lib/workouts.ts';
const strength=()=>{const s=initialState();return chooseWorkout(s,s.queue[1].id);};
function completed(){const s=strength();s.draft!.entries[0].sets[0]={...s.draft!.entries[0].sets[0],weight:50,reps:8,completed:true};return s;}
const cardio:Session['cardio']={activity:'Run',duration:20,distance:null,heartRate:null,unit:'mi'};

test('consecutive draft saves survive schema field reordering in device storage',async()=>{
 let record:LocalRecord={state:parseState(completed()),base:null,revision:0,dirty:true,lastSyncAt:null};
 const sync=new NotebookSync({read:async()=>({...structuredClone(record),state:parseState(record.state)}),write:async r=>{record=structuredClone(r);},lock:async fn=>fn()},null);
 const before=await sync.load(),attached={...before,draft:{...before.draft!,extraCardio:{...cardio,duration:null}}};
 await sync.save(attached,before);
 const entered={...attached,draft:{...attached.draft,extraCardio:cardio}};await sync.save(entered,attached);
 assert.equal(record.state.draft!.extraCardio!.duration,20);assert.equal(sync.status.phase,'local');sync.stop();
 assert.ok(equal({a:1,b:[2,3]},{b:[2,3],a:1}));assert.ok(!equal({a:[2,3]},{a:[3,2]}));
});

test('attached cardio persists with the draft and finishing saves both while advancing once',()=>{
 const s=completed();s.draft!.extraCardio=cardio;const reloaded=parseBackup(backupJSON(s));
 assert.deepEqual(reloaded.draft!.extraCardio,cardio);const next=finishWorkout(reloaded,'2026-10-15T18:00:00.000Z');
 assert.equal(next.history.length,2);assert.equal(next.queue.length,9);assert.equal(next.history[0].afterWorkoutId,next.history[1].id);
 assert.deepEqual(next.history[0].cardio,cardio);assert.equal(next.history[0].completedAt,next.history[1].completedAt);assert.equal(next.history[1].extraCardio,undefined);
 assert.deepEqual(parseBackup(backupJSON(next)),next);assert.ok(historyCSV(next).includes('"20","","","mi"'));
});
test('invalid attached cardio blocks completion without losing strength or changing the queue',()=>{
 const s=completed();s.draft!.extraCardio={...cardio,duration:null};const before=structuredClone(s);assert.throws(()=>finishWorkout(s),/duration/);assert.deepEqual(s,before);
 delete s.draft!.extraCardio;assert.equal(finishWorkout(s).history.length,1);
});
test('attached cardio at the last plan day starts exactly one new cycle',()=>{
 const s=completed();s.queue=[s.queue[0]];s.draft!.extraCardio=cardio;const next=finishWorkout(s);assert.equal(next.cycle,2);assert.equal(next.queue.length,10);assert.equal(next.history[0].cycle,1);
});
test('saved session edits preserve its identity/date and leave the current workout and queue intact',()=>{
 const s=finishWorkout(completed()),old=s.history[0],edit=structuredClone(old);edit.entries[0].sets[0].weight=65;edit.notes='Corrected';edit.id='not-allowed';edit.completedAt='2020-01-01T00:00:00.000Z';
 const next=updateSavedSession(s,old,edit);assert.equal(next.history[0].id,old.id);assert.equal(next.history[0].completedAt,old.completedAt);assert.equal(next.history[0].entries[0].sets[0].weight,65);
 assert.deepEqual(next.queue,s.queue);assert.deepEqual(next.draft,s.draft);assert.deepEqual(next.timer,s.timer);assert.equal(s.history[0].entries[0].sets[0].weight,50);
 assert.throws(()=>updateSavedSession(next,old,edit),/changed elsewhere/);
});
test('adding and editing cardio on a previous workout uses its day and never duplicates or advances',()=>{
 let s=finishWorkout(completed(),'2026-10-10T18:00:00.000Z');const parent=s.history[0],q=s.queue;
 s=updateSavedSession(s,parent,parent,cardio);const extra=s.history[0];assert.equal(extra.completedAt,parent.completedAt);assert.equal(extra.afterWorkoutId,parent.id);
 s=updateSavedSession(s,parent,parent,{...cardio,duration:35},extra);assert.equal(s.history[0].id,extra.id);assert.equal(s.history[0].cardio.duration,35);assert.equal(s.history.length,2);assert.deepEqual(s.queue,q);
 assert.throws(()=>updateSavedSession(s,parent,parent,cardio,extra),/cardio changed elsewhere/);
 s=updateSavedSession(s,parent,parent,null,s.history[0]);assert.equal(s.history.length,1);assert.deepEqual(s.history[0],parent);
});
test('saved strength edits reject missing values and empty completed history',()=>{
 const s=finishWorkout(completed()),old=s.history[0],edit=structuredClone(old);edit.entries[0].sets[0].weight=null;assert.throws(()=>updateSavedSession(s,old,edit),/missing values/);
 edit.entries=[];assert.throws(()=>updateSavedSession(s,old,edit),/completed set/);assert.equal(s.history[0].entries[0].sets[0].weight,50);
});
test('overall plan is anchored to Day 1 independently of the remaining queue',()=>{
 const s=finishWorkout(completed()),plan=overallPlan(s);assert.equal(plan.length,10);assert.equal(plan[0].templateId,'cardio');assert.equal(plan[1].templateId,'push-a');assert.equal(s.queue.some(q=>q.templateId==='push-a'),false);
});
test('editing a plan day preserves active sets and historical snapshots, applies to future sessions',()=>{
 const s=completed();s.draft!.startedAt='2026-10-15T18:00:00.000Z';const days=structuredClone(overallPlan(s));days[1].exercises[0].sets=2;
 const next=saveOverallPlan(s,days);assert.deepEqual(next.draft,s.draft);assert.deepEqual(next.queue,s.queue);assert.deepEqual(next.history,s.history);
 const future=makeDraft(next,{id:'future',templateId:'push-a',cycle:2,planDayId:days[1].id});assert.equal(future.entries[0].sets.length,2);
 assert.deepEqual(parseBackup(backupJSON(next)),next);
});
test('repeated routines can have different per-day exercises and set counts',()=>{
 const s=initialState(),days=structuredClone(overallPlan(s));days.push({...structuredClone(days[1]),id:'repeat-push'});days.at(-1)!.exercises=[{exerciseId:'ex-2',sets:2,optional:false}];
 const next=saveOverallPlan(s,days),first=makeDraft(next,{id:'a',templateId:'push-a',cycle:1,planDayId:days[1].id}),second=makeDraft(next,{id:'b',templateId:'push-a',cycle:1,planDayId:'repeat-push'});
 assert.equal(first.entries.length,4);assert.equal(second.entries.length,1);assert.equal(second.entries[0].sets.length,2);
});
test('restart from a chosen day replaces unfinished queue only, then loops to Day 1',()=>{
 const s=finishWorkout(completed()),days=overallPlan(s),next=restartPlan(s,days.at(-1)!.id);
 assert.equal(next.queue.length,1);assert.equal(next.cycle,s.cycle+1);assert.deepEqual(next.history,s.history);assert.equal(next.draft!.kind,'rest');
 const done=finishWorkout(next);assert.deepEqual(done.queue.map(q=>q.templateId),s.defaultOrder);assert.equal(done.queue[0].planDayId,days[0].id);
 assert.throws(()=>restartPlan(s,'missing'));
});
test('plan and order merge atomically and conflicting plan edits require a choice',()=>{
 const base=initialState(),days=structuredClone(overallPlan(base));days.reverse();const local=saveOverallPlan(base,days),remote={...base,settings:{...base.settings,sound:true}};
 const merged=mergeNotebooks(base,local,remote);assert.deepEqual(merged.planDays,days);assert.equal(merged.settings.sound,true);
 const other=structuredClone(overallPlan(base));other.pop();assert.throws(()=>mergeNotebooks(base,local,saveOverallPlan(base,other)),SyncConflict);
});
test('merging duplicate exercises combines charts while preserving exact historical entries',()=>{
 const s=finishWorkout(completed()),source={id:'duplicate',name:'Incline dumbbell press',step:5,perHand:true};s.library.push(source);
 const another=structuredClone(s.history[0]);another.id='another';another.entries[0].exerciseId=source.id;another.entries[0].name=source.name;another.entries[0].sets[0].weight=60;s.history.unshift(another);
 const history=structuredClone(s.history),next=mergeExercises(s,source.id,'ex-1');assert.equal(activeExercises(next).length,20);assert.deepEqual(next.history,history);
 const rows=exerciseHistory(next,'ex-1');assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.weight).sort(),[50,60]);assert.equal(makeEntry(next,source.id,'push-a').exerciseId,'ex-1');
 assert.deepEqual(parseBackup(backupJSON(next)),next);assert.throws(()=>mergeExercises(s,'ex-2','ex-1'),/weight conventions/);
});
test('merged aliases retain offline additions without dropping historical data',()=>{
 const base=finishWorkout(completed());base.library.push({id:'duplicate',name:'Incline dumbbell press',step:5,perHand:true});
 const local=mergeExercises(base,'duplicate','ex-1'),remote=structuredClone(base),session=structuredClone(remote.history[0]);session.id='offline-session';session.entries[0].exerciseId='duplicate';remote.history.unshift(session);
 const merged=mergeNotebooks(base,local,remote);assert.equal(exerciseHistory(merged,'ex-1').length,2);assert.equal(activeExercises(merged).length,20);
});
test('exercise charts exclude skipped sets and keep zero-weight completed sets',()=>{
 const s=finishWorkout(completed());s.history[0].entries[0].sets[0].weight=0;s.history[0].entries[0].sets[1].weight=1000;
 const row=exerciseHistory(s,'ex-1')[0];assert.equal(row.weight,0);assert.equal(row.reps,8);assert.equal(row.volume,0);
});
test('malformed plan references and cyclic exercise aliases are rejected',()=>{
 const s=initialState();assert.throws(()=>parseState({...s,planDays:[{id:'x',templateId:'missing',exercises:[]}]}));
 s.library[0].mergedInto=s.library[1].id;s.library[1].mergedInto=s.library[0].id;assert.throws(()=>parseState(s),/loop/);
});

test('saving a routine updates its plan occurrence while preserving the repeated day and optional choices',()=>{
 const s=strength(),days=structuredClone(overallPlan(s));days[1].exercises.push({exerciseId:'ex-6',sets:2,optional:true});days.push({...structuredClone(days[1]),id:'second-push'});
 let state=saveOverallPlan(s,days);state=restartPlan(state,'plan-2');state.draft!.entries[0].sets=state.draft!.entries[0].sets.slice(0,2);
 const updated=saveDraftRoutine(state);assert.equal(updated.planDays![1].exercises[0].sets,2);assert.equal(updated.planDays!.at(-1)!.exercises[0].sets,3);assert.ok(updated.planDays![1].exercises.some(e=>e.exerciseId==='ex-6'&&e.optional));assert.deepEqual(updated.draft,state.draft);
 const empty=structuredClone(days);empty[1].exercises=[];assert.throws(()=>saveOverallPlan(s,empty),/non-optional/);
});

test('adding cardio to an older workout keeps the history in date order',()=>{
 const s=finishWorkout(completed(),'2026-10-10T18:00:00.000Z'),old=s.history[0],recent={...structuredClone(old),id:'newer',completedAt:'2026-10-15T18:00:00.000Z'};s.history.unshift(recent);
 const next=updateSavedSession(s,old,old,cardio);assert.equal(next.history[0].id,'newer');assert.equal(next.history[1].afterWorkoutId,old.id);assert.deepEqual(next.queue,s.queue);
});
