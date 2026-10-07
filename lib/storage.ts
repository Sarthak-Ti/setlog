import { parseState, type AppState } from './workouts';
import { NotebookSync, type LocalRecord, type LocalStore } from './notebook-sync';
import { cloudStore, supabase } from './cloud';
let database:Promise<IDBDatabase>|null=null;
let account='device';
let fallback=false;
let engine:NotebookSync|null=null;
let lockChain:Promise<unknown>=Promise.resolve();
export function currentSync(){return engine;}
function openDB(){if(!database)database=new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('setlog-v2',1);req.onupgradeneeded=()=>req.result.createObjectStore('notebooks');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Close other Setlog tabs and reload.'));});return database;}
function storeFor(key:string):LocalStore{
 const fallbackKey='setlog-v2:'+key;
 return {
  async read(){let raw:LocalRecord|null=null;try{const db=await openDB();raw=await new Promise((resolve,reject)=>{const req=db.transaction('notebooks').objectStore('notebooks').get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);});}catch{fallback=true;}
   let alt:string|null=null;try{alt=localStorage.getItem(fallbackKey);}catch(e){if(fallback)throw e;}if(alt)raw=JSON.parse(alt);
   if(raw){raw.state=parseState(raw.state);if(raw.base)raw.base=parseState(raw.base);}return raw;
  },
  async write(record){if(fallback){localStorage.setItem(fallbackKey,JSON.stringify(record));return;}const db=await openDB();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('notebooks','readwrite');tx.objectStore('notebooks').put(record,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});try{localStorage.removeItem(fallbackKey);}catch{}},
  async lock<T>(fn:()=>Promise<T>):Promise<T>{if(navigator.locks)return navigator.locks.request('setlog-notebook:'+key,fn);const work=lockChain.catch(()=>{}).then(fn);lockChain=work;return work;}
 };
}
export function configureStorage(userId:string|null){engine?.stop();account=userId??'device';fallback=false;engine=new NotebookSync(storeFor(account),userId&&supabase?cloudStore(userId):null,state=>{window.dispatchEvent(new CustomEvent('setlog-sync-status'));if(state)window.dispatchEvent(new CustomEvent('setlog-cloud-state',{detail:state}));},()=>navigator.onLine);}
export async function loadState(){if(!engine)configureStorage(null);return {state:await engine!.load(),fallback};}
export async function saveState(state:AppState,previous?:AppState){if(!engine)configureStorage(null);return engine!.save(state,previous);}
export const storageScope=()=>account;
