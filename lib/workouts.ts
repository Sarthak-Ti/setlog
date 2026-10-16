import { z } from 'zod';
const idS=z.string().min(1).max(100), nameS=z.string().trim().min(1).max(100), num=z.number().finite().min(0).max(10000).nullable();
const exerciseS=z.object({id:idS,name:nameS,step:z.number().positive().max(100),perHand:z.boolean(),mergedInto:idS.optional()});
const setS=z.object({id:idS,weight:num,reps:z.number().int().min(1).max(1000).nullable(),completed:z.boolean(),weightEdited:z.boolean().optional()});
const entryS=z.object({id:idS,exerciseId:idS,name:nameS,step:z.number().positive().max(100),perHand:z.boolean(),sets:z.array(setS).max(100)});
const templateS=z.object({id:idS,name:nameS,kind:z.enum(['strength','cardio','rest']),focus:z.string().max(200),exercises:z.array(z.object({exerciseId:idS,sets:z.number().int().min(1).max(100),optional:z.boolean()})).max(100)});
const planDayS=z.object({id:idS,templateId:idS,exercises:templateS.shape.exercises});
const queueS=z.object({id:idS,templateId:idS,cycle:z.number().int().positive(),planDayId:idS.optional()});
const cardioS=z.object({activity:z.enum(['Run','Zone 2 Elliptical']),duration:num,heartRate:z.number().int().min(1).max(300).nullable(),distance:num,unit:z.enum(['mi','km'])});
const sessionS=z.object({id:idS,queueId:idS.nullable(),templateId:idS,name:nameS,kind:z.enum(['strength','cardio','rest']),cycle:z.number().int().positive(),startedAt:z.string().datetime().nullable(),completedAt:z.string().datetime().nullable(),entries:z.array(entryS).max(100),cardio:cardioS,extraCardio:cardioS.optional(),afterWorkoutId:idS.optional(),planDayId:idS.optional(),notes:z.string().max(5000)});
export const stateSchema=z.object({version:z.literal(1),library:z.array(exerciseS).min(1).max(5000),templates:z.array(templateS).min(1).max(100),defaultOrder:z.array(idS).min(1).max(100),planDays:z.array(planDayS).min(1).max(100).optional(),queue:z.array(queueS).max(100),cycle:z.number().int().positive(),draft:sessionS.nullable(),history:z.array(sessionS).max(50000),settings:z.object({restSeconds:z.number().int().min(15).max(3600),autoTimer:z.boolean(),sound:z.boolean(),vibration:z.boolean(),distanceUnit:z.enum(['mi','km'])}),timer:z.object({endsAt:z.number().finite().nullable(),duration:z.number().min(0).max(86400),pausedRemaining:z.number().min(0).max(86400).nullable()})});
export type AppState=z.infer<typeof stateSchema>;
export type Exercise=z.infer<typeof exerciseS>;
export type Entry=z.infer<typeof entryS>;
export type WorkoutSet=z.infer<typeof setS>;
export type Template=z.infer<typeof templateS>;
export type QueueItem=z.infer<typeof queueS>;
export type Session=z.infer<typeof sessionS>;
export type PlanDay=z.infer<typeof planDayS>;
export const uid=()=>crypto.randomUUID();
export function canonicalExerciseId(state:Pick<AppState,'library'>,id:string):string{
 const seen=new Set<string>();let current=id;
 while(true){if(seen.has(current))throw new Error('Exercise aliases contain a loop.');seen.add(current);const exercise=state.library.find(e=>e.id===current);if(!exercise)throw new Error('An exercise is missing from the library.');if(!exercise.mergedInto)return current;current=exercise.mergedInto;}
}
export const activeExercises=(state:AppState)=>state.library.filter(e=>!e.mergedInto);
export function overallPlan(state:AppState):PlanDay[]{return state.planDays??state.defaultOrder.map((templateId,i)=>({id:`plan-${i+1}`,templateId,exercises:state.templates.find(t=>t.id===templateId)!.exercises}));}
export function queuePlanDay(state:AppState,item:QueueItem):PlanDay|undefined{
 const days=overallPlan(state);if(item.planDayId)return days.find(d=>d.id===item.planDayId&&d.templateId===item.templateId);
 const matches=days.filter(d=>d.templateId===item.templateId);return matches.length===1?matches[0]:undefined;
}
export function validateCardio(input:Session['cardio']):Session['cardio']{
 const result=cardioS.safeParse(input);
 if(!result.success)throw new Error('Check your cardio values: duration and distance must be at most 10,000, and heart rate a whole number from 1–300.');
 if(result.data.duration===null||result.data.duration<=0)throw new Error('Enter a duration greater than 0 minutes (up to 10,000).');
 return result.data;
}
export function saveOverallPlan(state:AppState,input:PlanDay[]):AppState{
 const days=z.array(planDayS).min(1).max(100).parse(input);
 if(days.some(d=>state.templates.find(t=>t.id===d.templateId)?.kind==='strength'&&!d.exercises.some(e=>!e.optional)))throw new Error('Every strength day needs at least one non-optional exercise.');
 const next=parseState({...state,planDays:days,defaultOrder:days.map(d=>d.templateId)});
 // An active session is a snapshot; only unstarted sessions take plan edits.
 if(next.draft&&!next.draft.startedAt&&!next.draft.entries.some(e=>e.sets.some(s=>s.completed))){
  const item=next.queue.find(q=>q.id===next.draft!.queueId);if(item)next.draft=makeDraft(next,item);
 }
 return next;
}
export function saveDraftRoutine(state:AppState):AppState{
 const draft=state.draft;if(!draft||draft.kind!=='strength')throw new Error('Open a strength workout first.');
 const template=state.templates.find(t=>t.id===draft.templateId)!;
 const day=state.queue.find(q=>q.id===draft.queueId),planDay=day?queuePlanDay(state,day):undefined;
 const exercises=[...draft.entries.map(e=>({exerciseId:canonicalExerciseId(state,e.exerciseId),sets:e.sets.length,optional:false})),...(planDay?.exercises??template.exercises).filter(e=>e.optional&&!draft.entries.some(a=>canonicalExerciseId(state,a.exerciseId)===canonicalExerciseId(state,e.exerciseId)))];
 return {...state,templates:state.templates.map(t=>t.id===template.id?{...t,exercises}:t),...(state.planDays?{planDays:state.planDays.map(d=>d.id===planDay?.id?{...d,exercises}:d)}:{})};
}
export function restartPlan(state:AppState,dayId:string):AppState{
 const days=overallPlan(state),at=days.findIndex(d=>d.id===dayId);if(at<0)throw new Error('Choose a day in your plan.');
 const cycle=state.cycle+1,queue=days.slice(at).map(d=>({id:uid(),templateId:d.templateId,planDayId:d.id,cycle}));
 const next={...state,cycle,queue,draft:null,timer:{...state.timer,endsAt:null,pausedRemaining:null}} as AppState;
 next.draft=makeDraft(next,queue[0]);return next;
}
export function mergeExercises(state:AppState,sourceId:string,targetId:string):AppState{
 const source=state.library.find(e=>e.id===sourceId),target=state.library.find(e=>e.id===targetId);
 if(!source||!target||source.mergedInto||target.mergedInto||sourceId===targetId)throw new Error('Choose two different exercises.');
 if(source.perHand!==target.perHand)throw new Error('These exercises use different weight conventions. Keep them separate until you have checked their logs.');
 // Retain the source ID as an alias so old/offline history stays intact.
 const remap=(exercises:Template['exercises'])=>exercises.map(e=>({...e,exerciseId:canonicalExerciseId(next,e.exerciseId)})).reduce<Template['exercises']>((all,e)=>{const existing=all.find(x=>x.exerciseId===e.exerciseId);if(existing){existing.sets=Math.min(100,existing.sets+e.sets);existing.optional=existing.optional&&e.optional;}else all.push({...e});return all;},[]);
 const next={...state,library:state.library.map(e=>e.id===sourceId?{...e,mergedInto:targetId}:e)};
 return {...next,templates:next.templates.map(t=>({...t,exercises:remap(t.exercises)})),...(next.planDays?{planDays:next.planDays.map(d=>({...d,exercises:remap(d.exercises)}))}:{})};
}
export function exerciseHistory(state:AppState,exerciseId:string){
 const canonical=canonicalExerciseId(state,exerciseId);
 return state.history.filter(s=>s.kind==='strength').flatMap(session=>{
  const entries=session.entries.filter(e=>canonicalExerciseId(state,e.exerciseId)===canonical);
  const sets=entries.flatMap(e=>e.sets.filter(s=>s.completed));if(!sets.length)return [];
  return [{session,entries,sets,weight:Math.max(...sets.map(s=>s.weight??0)),reps:sets.reduce((n,s)=>n+(s.reps??0),0),volume:sets.reduce((n,s)=>n+(s.weight??0)*(s.reps??0),0)}];
 }).sort((a,b)=>b.session.completedAt!.localeCompare(a.session.completedAt!));
}
export function updateSavedSession(state:AppState,original:Session,edited:Session,extra?:Session['cardio']|null,originalExtra?:Session):AppState{
 const current=state.history.find(s=>s.id===original.id);
 const same=(a:Session|undefined,b:Session|undefined)=>JSON.stringify(a&&sessionS.parse(a))===JSON.stringify(b&&sessionS.parse(b));
 if(!current||!same(current,original))throw new Error('This workout changed elsewhere. Close it and reopen the latest version before editing.');
 const saved=sessionS.parse({...current,entries:edited.entries,cardio:edited.cardio,notes:edited.notes});
 if(saved.kind==='strength'&&!setCount(saved))throw new Error('Keep at least one completed set in a saved workout.');
 if(saved.kind==='cardio')saved.cardio=validateCardio(saved.cardio);
 let next={...state,history:state.history.map(s=>s.id===saved.id?saved:s)};
 if(saved.kind==='strength'&&extra!==undefined){
  const existing=state.history.find(s=>s.kind==='cardio'&&s.afterWorkoutId===saved.id);
  if(!same(existing,originalExtra))throw new Error('This workout’s cardio changed elsewhere. Close and reopen it before editing.');
  if(extra){const cardio=validateCardio(extra);next=existing?{...next,history:next.history.map(s=>s.id===existing.id?{...s,cardio}:s)}:addPostWorkoutCardio(next,saved.id,cardio,saved.completedAt!);}
  else if(existing)next={...next,history:next.history.filter(s=>s.id!==existing.id)};
 }
 return parseState(next);
}
export function initialState():AppState{
 const names=['Incline DB Press','Chest Fly','Side Lateral Fly','Overhead DB Triceps','Zercher Squat','Leg Curl','Leg Extension','Calves','Cable Row','Cable Lat Pulldown','Incline DB Curl','Forearms','Overhead Shoulder Press','Flat DB Press','Cable Triceps Pushdown','RDL','Leg Press (wide / glute)','Face Pull','Rear Delt Fly','Zottman Curl'];
 const library:Exercise[]=names.map((name,i)=>({id:`ex-${i+1}`,name,step:5,perHand:['Incline DB Press','Side Lateral Fly','Incline DB Curl','Overhead Shoulder Press','Flat DB Press','Rear Delt Fly','Zottman Curl'].includes(name)}));
 const list=(indices:number[])=>indices.map(i=>({exerciseId:`ex-${i}`,sets:3,optional:false}));
 const templates:Template[]=[
 {id:'cardio',name:'Cardio',kind:'cardio',focus:'Run or Zone 2 elliptical',exercises:[]},
 {id:'push-a',name:'Push A',kind:'strength',focus:'Chest · Shoulders · Triceps',exercises:list([1,2,3,4])},
 {id:'leg-a',name:'Leg A',kind:'strength',focus:'Quads · Hamstrings · Calves',exercises:list([5,6,7,8])},
 {id:'pull-a',name:'Pull A',kind:'strength',focus:'Back · Biceps · Forearms',exercises:list([9,10,11,12])},
 {id:'rest',name:'Rest',kind:'rest',focus:'Recovery day',exercises:[]},
 {id:'push-b',name:'Push B',kind:'strength',focus:'Shoulders · Chest · Triceps',exercises:list([13,14,3,15])},
 {id:'leg-b',name:'Leg B',kind:'strength',focus:'Glutes · Hamstrings · Quads',exercises:[...list([16,17,7,8]),{exerciseId:'ex-6',sets:3,optional:true}]},
 {id:'pull-b',name:'Pull B',kind:'strength',focus:'Back · Rear delts · Biceps',exercises:list([10,9,18,20])}];
 const defaultOrder=['cardio','push-a','leg-a','pull-a','rest','cardio','push-b','leg-b','pull-b','rest'];
 const state:AppState={version:1,library,templates,defaultOrder,queue:defaultOrder.map(templateId=>({id:uid(),templateId,cycle:1})),cycle:1,draft:null,history:[],settings:{restSeconds:90,autoTimer:false,sound:false,vibration:false,distanceUnit:'mi'},timer:{endsAt:null,duration:90,pausedRemaining:null}};
 state.draft=makeDraft(state,state.queue[0]);return state;
}
export function lastEntry(state:AppState,exerciseId:string,templateId:string):{entry:Entry;session:Session}|null{
 const canonical=canonicalExerciseId(state,exerciseId);
 const find=(same:boolean)=>{for(const session of state.history){if(same&&session.templateId!==templateId)continue;const entry=session.entries.find(e=>canonicalExerciseId(state,e.exerciseId)===canonical&&e.sets.some(s=>s.completed));if(entry)return {entry,session};}return null;};return find(true)??find(false);
}
export function makeEntry(state:AppState,exerciseId:string,templateId:string,count?:number):Entry{
 exerciseId=canonicalExerciseId(state,exerciseId);
 const ex=state.library.find(e=>e.id===exerciseId)!;const previous=lastEntry(state,exerciseId,templateId)?.entry.sets.filter(s=>s.completed);
 const target=count??previous?.length??3;
 return {id:uid(),exerciseId,name:ex.name,step:ex.step,perHand:ex.perHand,sets:Array.from({length:target},(_,i)=>{const last=previous?.[i]??previous?.at(-1);return {id:uid(),weight:last?.weight??null,reps:last?.reps??8,completed:false};})};
}
export function resizeSets(entry:Entry,count:number):Entry{
 if(!Number.isInteger(count)||count<1||count>100)throw new Error('Choose between 1 and 100 sets.');
 if(count<=entry.sets.length)return {...entry,sets:entry.sets.slice(0,count)};
 const last=entry.sets.at(-1);
 return {...entry,sets:[...entry.sets,...Array.from({length:count-entry.sets.length},()=>({id:uid(),weight:last?.weight??null,reps:last?.reps??8,completed:false}))]};
}
/** Carry suggestions forward, preserving weights explicitly entered this session. */
export function toggleCompletedSet(entry:Entry,setId:string):Entry{
 const at=entry.sets.findIndex(s=>s.id===setId);if(at<0)return entry;
 const current=entry.sets[at];
 if(!current.completed&&(current.weight===null||current.reps===null))throw new Error('Enter a weight and reps first. Use 0 lbs for unweighted sets.');
 const next=current.completed?-1:entry.sets.findIndex((s,i)=>i>at&&!s.completed);
 return {...entry,sets:entry.sets.map((s,i)=>i===at?{...s,completed:!s.completed}:i===next&&!s.weightEdited?{...s,weight:current.weight}:s)};
}
export function addQueueSession(queue:QueueItem[],templateId:string,cycle:number,afterIndex=queue.length-1):QueueItem[]{
 if(queue.length>=100)throw new Error('A cycle can contain up to 100 sessions.');
 if(afterIndex < -1 || afterIndex >= queue.length)throw new Error('Choose a valid session position.');
 return [...queue.slice(0,afterIndex+1),{id:uid(),templateId,cycle},...queue.slice(afterIndex+1)];
}
export function applyCycleEdits(state:AppState,queue:QueueItem[]):AppState{
 if(queue.length>100)throw new Error('A cycle can contain up to 100 sessions.');
 if(new Set(queue.map(q=>q.id)).size!==queue.length||queue.some(q=>!state.templates.some(t=>t.id===q.templateId)||q.cycle!==state.cycle))throw new Error('Invalid cycle sessions.');
 if(state.draft?.startedAt&&queue.some(q=>q.id===state.draft!.queueId)&&queue[0].id!==state.draft.queueId)throw new Error('Keep the active workout first, or remove it from this cycle.');
 const next={...state,queue};
 if(queue[0]?.id===state.draft?.queueId)return next;
 return {...next,draft:queue.length?makeDraft(next,queue[0]):null,timer:{...state.timer,endsAt:null,pausedRemaining:null}};
}
export function makeDraft(state:AppState,item:QueueItem):Session{
 const t=state.templates.find(t=>t.id===item.templateId)!;
 const day=queuePlanDay(state,item),exercises=day?.exercises??t.exercises;
 return {id:uid(),queueId:item.id,templateId:t.id,name:t.name,kind:t.kind,cycle:item.cycle,...(day?{planDayId:day.id}:{}),startedAt:null,completedAt:null,entries:exercises.filter(e=>!e.optional).map(e=>makeEntry(state,e.exerciseId,t.id,e.sets)),cardio:{activity:'Run',duration:null,heartRate:null,distance:null,unit:state.settings.distanceUnit},notes:''};
}
export function move<T>(items:T[],from:number,to:number):T[]{if(from<0||to<0||from>=items.length||to>=items.length)return items;const next=[...items];const [item]=next.splice(from,1);next.splice(to,0,item);return next;}
/** Viewing a queued day never changes the current session or cycle. */
export function viewWorkout(state:AppState,queueId:string|null):Session|null{
 if(!queueId||queueId===state.draft?.queueId)return state.draft;
 const item=state.queue.find(q=>q.id===queueId);
 return item?makeDraft(state,item):state.draft;
}
export function chooseWorkout(state:AppState,queueId:string):AppState{
 const idx=state.queue.findIndex(q=>q.id===queueId);if(idx<0)return state;const queue=move(state.queue,idx,0);
 return {...state,queue,draft:makeDraft({...state,queue},queue[0]),timer:{...state.timer,endsAt:null,pausedRemaining:null}};
}
export function finishWorkout(state:AppState,now=new Date().toISOString()):AppState{
 const draft=state.draft;if(!draft)throw new Error('No workout to finish.');
 if(draft.kind==='strength'&&!draft.entries.some(e=>e.sets.some(s=>s.completed)))throw new Error('Complete at least one set first.');
 if(draft.kind==='cardio'&&!(draft.cardio.duration&&draft.cardio.duration>0))throw new Error('Add your cardio duration first.');
 for(const e of draft.entries)for(const s of e.sets)if(s.completed&&(s.weight===null||s.reps===null||s.reps<1))throw new Error('Completed sets need a weight and reps. Use 0 lbs for unweighted sets.');
 let queue=state.queue.filter(q=>q.id!==draft.queueId),cycle=state.cycle;
 if(draft.extraCardio)validateCardio(draft.extraCardio);
 if(!queue.length){cycle++;queue=overallPlan(state).map(day=>({id:uid(),templateId:day.templateId,planDayId:day.id,cycle}));}
 const {extraCardio,...saved}=draft;
 let next:AppState={...state,queue,cycle,history:[{...saved,startedAt:draft.startedAt??now,completedAt:now},...state.history],timer:{...state.timer,endsAt:null,pausedRemaining:null},draft:null};
 if(draft.kind==='strength'&&extraCardio)next=addPostWorkoutCardio(next,draft.id,extraCardio,now);
 next.draft=makeDraft(next,queue[0]);return next;
}
export function takeExtraRest(state:AppState):AppState{
 const now=new Date().toISOString(),day=(iso:string)=>new Date(iso).toLocaleDateString();
 if(state.history.some(s=>s.queueId===null&&s.kind==='rest'&&s.completedAt&&day(s.completedAt)===day(now)))return state;
 const s:Session={id:uid(),queueId:null,templateId:'rest',name:'Extra rest',kind:'rest',cycle:state.cycle,startedAt:now,completedAt:now,entries:[],cardio:{activity:'Run',duration:null,heartRate:null,distance:null,unit:state.settings.distanceUnit},notes:'Queue paused'};
 return {...state,history:[s,...state.history]};
}
/** An ordinary cardio history record: no queue, draft, or timer changes. */
export function addPostWorkoutCardio(state:AppState,workoutId:string,input:Session['cardio'],now=new Date().toISOString()):AppState{
 const parent=state.history.find(s=>s.id===workoutId&&s.kind==='strength'&&s.completedAt);
 if(!parent)throw new Error('Save your strength workout first.');
 if(state.history.some(s=>s.afterWorkoutId===workoutId&&s.kind==='cardio'))return state;
 const cardio=validateCardio(input);
 const session:Session={id:uid(),queueId:null,templateId:state.templates.find(t=>t.kind==='cardio')?.id??parent.templateId,name:`${parent.name.slice(0,88)} · cardio`,kind:'cardio',cycle:parent.cycle,startedAt:now,completedAt:now,entries:[],cardio,afterWorkoutId:parent.id,notes:''};
 return {...state,history:[session,...state.history].sort((a,b)=>b.completedAt!.localeCompare(a.completedAt!))};
}
export function parseState(value:unknown):AppState{
 const state=stateSchema.parse(value),libIds=new Set(state.library.map(e=>e.id)),templateIds=new Set(state.templates.map(t=>t.id));
 if(libIds.size!==state.library.length||templateIds.size!==state.templates.length||new Set(state.queue.map(q=>q.id)).size!==state.queue.length)throw new Error('Duplicate identifiers in backup.');
 if(state.defaultOrder.some(id=>!templateIds.has(id))||state.queue.some(q=>!templateIds.has(q.templateId))||state.templates.some(t=>t.exercises.some(e=>!libIds.has(e.exerciseId))))throw new Error('Backup contains missing exercise or routine references.');
 for(const ex of state.library)canonicalExerciseId(state,ex.id);
 if(state.planDays&&(new Set(state.planDays.map(d=>d.id)).size!==state.planDays.length||state.planDays.some(d=>!templateIds.has(d.templateId)||d.exercises.some(e=>!libIds.has(e.exerciseId)))||JSON.stringify(state.planDays.map(d=>d.templateId))!==JSON.stringify(state.defaultOrder)))throw new Error('The saved overall plan is invalid.');
 if(state.draft&&!state.queue.some(q=>q.id===state.draft!.queueId&&q.templateId===state.draft!.templateId))throw new Error('The saved workout is missing from the queue.');
 for(const session of [...state.history,...(state.draft?[state.draft]:[])]){
 if(!templateIds.has(session.templateId)||session.entries.some(e=>!libIds.has(e.exerciseId)))throw new Error('Workout references are incomplete.');
 if(session.entries.some(e=>e.sets.some(s=>s.completed&&(s.weight===null||s.reps===null))))throw new Error('A completed set has missing values.');
 }
 if(state.history.some(s=>!s.completedAt)||(state.draft&&state.draft.completedAt))throw new Error('Invalid workout completion state.');
 if(!state.draft&&state.queue.length)state.draft=makeDraft(state,state.queue[0]);return state;
}
export function parseBackup(text:string):AppState{const backup=z.object({format:z.literal('setlog'),version:z.literal(1),data:z.unknown()}).parse(JSON.parse(text));return parseState(backup.data);}
export function backupJSON(state:AppState){return JSON.stringify({format:'setlog',version:1,exportedAt:new Date().toISOString(),data:state},null,2);}
export function historyCSV(state:AppState){
 const rows:unknown[][]=[['date','workout','type','exercise','set','weight_lbs','reps','completed','per_hand','duration_min','avg_hr','distance','distance_unit','notes']];
 for(const s of state.history){if(s.kind==='strength')for(const e of s.entries)e.sets.forEach((set,i)=>rows.push([s.completedAt,s.name,s.kind,e.name,i+1,set.weight,set.reps,set.completed,e.perHand,'','','','',s.notes]));else rows.push([s.completedAt,s.name,s.kind,s.kind==='cardio'?s.cardio.activity:'','','','','','',s.cardio.duration,s.cardio.heartRate,s.cardio.distance,s.cardio.unit,s.notes]);}
 return rows.map(row=>row.map(v=>{let text=String(v??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
}
export function fuzzyMatch(name:string,query:string){const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');const n=norm(name),q=norm(query);if(n.includes(q))return true;let at=0;for(const char of q){at=n.indexOf(char,at);if(at<0)return false;at++;}return true;}
export function setCount(s:Session){return s.entries.reduce((n,e)=>n+e.sets.filter(s=>s.completed).length,0);}
export function volume(s:Session){return s.entries.reduce((n,e)=>n+e.sets.filter(s=>s.completed).reduce((a,s)=>a+(s.weight??0)*(s.reps??0),0),0);}

export function appendWorkout(state:AppState,templateId:string,afterIndex=state.queue.length-1):AppState{
 if(!state.templates.some(t=>t.id===templateId))throw new Error('Choose a saved workout.');
 return applyCycleEdits(state,addQueueSession(state.queue,templateId,state.cycle,afterIndex));
}
export function removeQueueWorkout(state:AppState,queueId:string):AppState{
 return applyCycleEdits(state,state.queue.filter(q=>q.id!==queueId));
}
export function createWorkoutTemplate(state:AppState,name:string,exerciseIds:string[]):AppState{
 const clean=name.trim().replace(/\s+/g,' ');
 if(!clean||clean.length>100)throw new Error('Give your workout a name of 1–100 characters.');
 if(state.templates.some(t=>t.name.trim().toLowerCase()===clean.toLowerCase()))throw new Error('A workout with this name is already saved.');
 if(state.templates.length>=100)throw new Error('Your library can contain up to 100 workouts.');
 const selected=[...new Set(exerciseIds)];
 if(!selected.length||selected.length>100)throw new Error('Select at least one exercise, up to 100.');
 if(selected.some(id=>!state.library.some(e=>e.id===id)))throw new Error('An exercise could not be found in your library.');
 const template:Template={id:uid(),name:clean,kind:'strength',focus:`${selected.length} exercises`,exercises:selected.map(exerciseId=>({exerciseId,sets:3,optional:false}))};
 return {...state,templates:[...state.templates,template]};
}
export function rankedWorkouts(templates:Template[],query:string):Template[]{
 const q=query.trim().toLowerCase();if(!q)return templates;
 const score=(name:string)=>{const n=name.toLowerCase();if(n===q)return 0;if(n.startsWith(q))return 10+n.length/1000;if(n.split(/\s+/).some(w=>w.startsWith(q)))return 20+n.length/1000;const at=n.indexOf(q);if(at>=0)return 30+at/100;if(fuzzyMatch(n,q))return 40+n.length/1000;return Infinity;};
 return templates.map((t,i)=>({t,i,score:score(t.name)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>a.score-b.score||a.i-b.i).map(x=>x.t);
}
