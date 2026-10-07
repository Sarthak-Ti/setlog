import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseState, type AppState } from './workouts';
import type { CloudStore } from './notebook-sync';
export let supabase:SupabaseClient|null=null;
export async function initializeCloud(){
 const config=await fetch(import.meta.env.BASE_URL+'cloud-config.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Cloud configuration unavailable.');return r.json();});
 if(!config.url||!config.publishableKey)return;
 if(new URL(config.url).protocol!=='https:'||!new URL(config.url).hostname.endsWith('.supabase.co')||!config.publishableKey.startsWith('sb_publishable_'))throw new Error('Invalid public cloud configuration.');
 supabase=createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'setlog-auth-v2',flowType:'implicit'},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(15000)})}});
}
export function cloudStore(userId:string):CloudStore{
 return {
  async read(){const {data,error}=await supabase!.from('notebooks').select('state,revision').eq('user_id',userId).maybeSingle();if(error)throw error;return data?{state:parseState(data.state),revision:data.revision}:null;},
  async write(state:AppState,revision:number){const {data,error}=await supabase!.rpc('save_notebook',{p_state:state,p_expected_revision:revision});if(error)throw error;return {state:parseState(data.state),revision:data.revision};}
 };
}
