import { initialState, parseState, type AppState } from './workouts.ts';
import { equal, mergeNotebooks, SyncConflict } from './sync-merge.ts';
export type LocalRecord={state:AppState;base:AppState|null;revision:number;dirty:boolean;lastSyncAt:string|null};
export type CloudRecord={state:AppState;revision:number};
export type SyncStatus={phase:'local'|'pending'|'syncing'|'synced'|'offline'|'error'|'conflict';message:string;lastSyncAt:string|null;conflict?:CloudRecord};
export interface LocalStore {read():Promise<LocalRecord|null>;write(record:LocalRecord):Promise<void>;lock<T>(fn:()=>Promise<T>):Promise<T>}
export interface CloudStore {read():Promise<CloudRecord|null>;write(state:AppState,revision:number):Promise<CloudRecord>}
export class NotebookSync {
 status:SyncStatus={phase:'local',message:'Saved on this device',lastSyncAt:null};
 private running:Promise<void>|null=null;
 private stopped=false;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private local:LocalStore;private cloud:CloudStore|null;private changed:(state?:AppState)=>void;private isOnline:()=>boolean;
 constructor(local:LocalStore,cloud:CloudStore|null,changed:(state?:AppState)=>void=()=>{},isOnline=()=>true){this.local=local;this.cloud=cloud;this.changed=changed;this.isOnline=isOnline;}
 private report(phase:SyncStatus['phase'],message:string,extra:Partial<SyncStatus>={}){if(this.stopped)return;this.status={phase,message,lastSyncAt:this.status.lastSyncAt,...extra};this.changed();}
 async load(){const r=await this.local.lock(async()=>{const existing=await this.local.read();if(existing)return existing;const fresh:LocalRecord={state:initialState(),base:null,revision:0,dirty:false,lastSyncAt:null};await this.local.write(fresh);return fresh;});this.status.lastSyncAt=r.lastSyncAt;this.schedule();return r.state;}
 async save(state:AppState,previous?:AppState){const saved=await this.local.lock(async()=>{const r=await this.local.read();const next=r&&previous&&!equal(r.state,previous)?mergeNotebooks(previous,state,r.state):state;await this.local.write({state:next,base:r?.base??null,revision:r?.revision??0,dirty:true,lastSyncAt:r?.lastSyncAt??null});if(!this.stopped&&!equal(state,next))this.changed(next);return next;});this.report(this.cloud?'pending':'local',this.cloud?'Saved here · waiting to sync':'Saved on this device');this.schedule();return saved;}
 schedule(){if(this.stopped||!this.cloud)return;clearTimeout(this.timer);this.timer=setTimeout(()=>void this.sync(),1000);}
 stop(){this.stopped=true;clearTimeout(this.timer);}
 async sync():Promise<void>{
  if(this.stopped||!this.cloud)return;
  if(this.running)return this.running;
  this.running=this.perform().finally(()=>{this.running=null;});return this.running;
 }
 private async perform(){
  if(!this.isOnline()){this.report('offline','Saved here · offline');return;}
  this.report('syncing','Syncing…');
  try{
   // Retry CAS races; every write remains conditional on the revision we read.
   for(let attempt=0;attempt<3;attempt++){
    const remote=await this.cloud!.read();if(this.stopped)return;
    const local=await this.local.read();if(!local)return;
    let next:AppState;
    try{next=remote?(local.dirty?mergeNotebooks(local.base,local.state,remote.state):{...remote.state,timer:local.state.timer}):local.state;}
    catch(e){if(e instanceof SyncConflict&&remote){this.report('conflict',e.message,{conflict:remote});return;}throw e;}
    if(!remote&&local.base)throw new Error('Your cloud notebook is missing. Export a backup before reconnecting.');
    let saved:CloudRecord;
    try{saved=remote&&equal(next,remote.state)?remote:await this.cloud!.write(next,remote?.revision??0);}
    catch(e){if((e as {code?:string}).code==='PT409')continue;throw e;}
    if(this.stopped)return;
    let pending=false;
    await this.local.lock(async()=>{
     const latest=(await this.local.read())!;
     // Preserve edits made while the network request was in flight.
     const state=equal(latest.state,local.state)?next:mergeNotebooks(local.state,latest.state,next);
     pending=!equal(state,saved.state);
     const record={state,base:saved.state,revision:saved.revision,dirty:pending,lastSyncAt:new Date().toISOString()};
     await this.local.write(record);this.status.lastSyncAt=record.lastSyncAt;
     if(!this.stopped&&!equal(latest.state,state))this.changed(state);
    });
    this.report(pending?'pending':'synced',pending?'Saved here · waiting to sync':'Synced to cloud');
    if(pending)this.schedule();return;
   }
   this.report('pending','Cloud changed. Retrying shortly.');this.schedule();
  }catch(e){this.report(this.isOnline()?'error':'offline',this.isOnline()?'Saved here · cloud unavailable. Retry when connected.':'Saved here · offline');}
 }
 async resolve(choice:'device'|'cloud'){
  const conflict=this.status.conflict;if(this.stopped||!conflict||!this.cloud)return;
  const remote=await this.cloud.read();
  if(this.stopped)return;
  if(!remote||remote.revision!==conflict.revision){await this.sync();throw new Error('The cloud copy changed again. Please review the latest version.');}
  await this.local.lock(async()=>{if(this.stopped)return;const local=(await this.local.read())!;const state=choice==='cloud'?{...remote.state,timer:local.state.timer}:local.state;await this.local.write({...local,state,base:remote.state,revision:remote.revision,dirty:choice==='device'});if(!this.stopped)this.changed(state);});
  this.report('pending','Resolving…');await this.sync();
 }
}
