import { parseState, type AppState } from './workouts.ts';
export class SyncConflict extends Error { sections:string[]; constructor(sections:string[]){super('Both devices changed '+sections.join(', '));this.sections=sections;} }
export const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function value<T>(base:T,local:T,remote:T,label:string):T{
 if(equal(local,remote)||equal(base,remote))return local;
 if(equal(base,local))return remote;
 throw new SyncConflict([label]);
}
function records<T extends {id:string}>(base:T[],local:T[],remote:T[],label:string):T[]{
 const b=new Map(base.map(x=>[x.id,x])),l=new Map(local.map(x=>[x.id,x])),r=new Map(remote.map(x=>[x.id,x]));
 const result:T[]=[];
 for(const id of new Set([...local.map(x=>x.id),...remote.map(x=>x.id),...base.map(x=>x.id)])){
  const item=value(b.get(id),l.get(id),r.get(id),label);if(item)result.push(item);
 }
 return result;
}
export function mergeNotebooks(base:AppState|null,local:AppState,remote:AppState):AppState{
 if(!base){if(equal(local,remote))return local;throw new SyncConflict(['this notebook']);}
 const active=(s:AppState)=>({queue:s.queue,cycle:s.cycle,draft:s.draft});
 const current=value(active(base),active(local),active(remote),'the current workout or queue');
 const settings={...local.settings};
 for(const key of Object.keys(settings) as (keyof typeof settings)[]){(settings as Record<string,unknown>)[key]=value(base.settings[key],local.settings[key],remote.settings[key],'settings');}
 return parseState({...local,...current,settings,
  library:records(base.library,local.library,remote.library,'the exercise library'),
  templates:records(base.templates,local.templates,remote.templates,'saved routines'),
  defaultOrder:value(base.defaultOrder,local.defaultOrder,remote.defaultOrder,'the default split'),
  history:records(base.history,local.history,remote.history,'a completed workout').sort((a,b)=>b.completedAt!.localeCompare(a.completedAt!)||a.id.localeCompare(b.id)),
  // Rest timers are transient and stay with this device.
  timer:local.timer,
 });
}
