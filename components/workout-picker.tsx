'use client';
import {useEffect,useRef,useState} from 'react';
import {Plus,Dumbbell,Activity,Moon,Search,Check} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from '@/components/ui/combobox';
import {type AppState,rankedWorkouts,fuzzyMatch} from '@/lib/workouts';
import {toast} from 'sonner';

type Choice={id:string;name:string;kind:string;focus:string};
export default function WorkoutPicker({open,onOpenChange,state,onAdd,onCreate}:{open:boolean;onOpenChange:(open:boolean)=>void;state:AppState;onAdd:(templateId:string)=>boolean;onCreate:(name:string,exerciseIds:string[])=>boolean}){
 const dialogRef=useRef<HTMLDivElement>(null);
 const [phase,setPhase]=useState<'search'|'create'>('search'),[query,setQuery]=useState(''),[name,setName]=useState(''),[exerciseQuery,setExerciseQuery]=useState(''),[selected,setSelected]=useState<string[]>([]);
 useEffect(()=>{if(open){setPhase('search');setQuery('');setName('');setExerciseQuery('');setSelected([]);}},[open]);
 const choices:Choice[]=rankedWorkouts(state.templates,query).map(t=>({id:t.id,name:t.name,kind:t.kind,focus:t.focus}));
 const clean=query.trim().replace(/\s+/g,' ');
 if(clean&&!state.templates.some(t=>t.name.trim().toLowerCase()===clean.toLowerCase()))choices.push({id:'__create',name:`Add workout “${clean.slice(0,100)}”`,kind:'create',focus:'Choose exercises and save a new workout'});
 const exercises=state.library.filter(e=>!e.mergedInto&&fuzzyMatch(e.name,exerciseQuery));
 const choose=(choice:Choice)=>{
  if(choice.id==='__create'){if(state.templates.length>=100){toast.error('Your library can contain up to 100 workouts.');return;}setName(clean.slice(0,100));setPhase('create');return;}
  if(onAdd(choice.id))onOpenChange(false);
 };
 const toggle=(id:string)=>setSelected(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent ref={dialogRef} className={`dialog-scroll content-start sm:max-w-xl ${phase==='search'?'h-[min(78dvh,640px)]':''}`}><DialogHeader><DialogTitle>{phase==='search'?'Add workout':'Create a workout'}</DialogTitle><DialogDescription>{phase==='search'?'Choose a saved workout to add to this cycle, or type a new name.':'Select exercises in the order you want to do them. Saving adds this workout to your library only.'}</DialogDescription></DialogHeader>
 {phase==='search'?<>
  <p className="fine leading-relaxed">Removed days stay in this list. Pick a workout again to repeat it.</p>
  <Combobox<Choice> items={choices} filter={null} value={null} inputValue={query} onInputValueChange={setQuery} onValueChange={choice=>{if(choice)choose(choice);}} itemToStringLabel={item=>item?.name??''} itemToStringValue={item=>item?.id??''} defaultOpen>
   <ComboboxInput autoFocus maxLength={100} placeholder="Search workouts or type a new name…" aria-label="Search saved workouts" className="!w-full h-12"/>
   <ComboboxContent container={dialogRef} className="border border-border"><ComboboxEmpty>No matching workouts.</ComboboxEmpty><ComboboxList>{(choice:Choice)=><ComboboxItem key={choice.id} value={choice} className="min-h-16 px-3 text-sm">
    {choice.kind==='create'?<Plus className="text-primary" size={19}/>:choice.kind==='cardio'?<Activity size={19}/>:choice.kind==='rest'?<Moon size={19}/>:<Dumbbell size={19}/>}<span className="min-w-0 [overflow-wrap:anywhere]"><span className="block font-medium">{choice.name}</span><span className="block text-xs text-muted-foreground mt-1">{choice.focus}</span></span>
   </ComboboxItem>}</ComboboxList></ComboboxContent>
  </Combobox>
 </>:<>
  <label className="block"><span className="field-label">Workout name</span><input className="w-full rounded-lg border border-input bg-background p-3 text-base" aria-label="New workout name" maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
  <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Choose exercises</p><span className="fine">{selected.length} selected</span></div>
  <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3"><Search size={17} className="text-muted-foreground shrink-0"/><input className="bg-transparent min-w-0 flex-1 h-11 outline-none text-sm" aria-label="Filter exercise checklist" placeholder="Find an exercise…" value={exerciseQuery} onChange={e=>setExerciseQuery(e.target.value)}/></div>
  <div className="workout-checklist">{exercises.map(ex=>{const checked=selected.includes(ex.id);return <label className={`workout-check-item ${checked?'selected':''}`} key={ex.id}><Checkbox aria-label={`Include ${ex.name}`} checked={checked} disabled={!checked&&selected.length>=100} onCheckedChange={()=>toggle(ex.id)}/><span className="flex-1 text-sm">{ex.name}</span>{checked&&<span className="mono text-xs text-primary">{String(selected.indexOf(ex.id)+1).padStart(2,'0')}</span>}</label>;})}{!exercises.length&&<p className="text-sm text-muted-foreground p-5 text-center">No exercises match your search.</p>}</div>
  <p className="fine leading-relaxed">This won’t add a day to your cycle. Find the saved workout through Add workout whenever you want to use it.</p>
  <div className="flex gap-3"><Button variant="outline" className="h-12" onClick={()=>setPhase('search')}>Back</Button><Button className="flex-1 h-12" disabled={!selected.length||!name.trim()} onClick={()=>{if(onCreate(name,selected))onOpenChange(false);}}><Check size={17}/>Save workout</Button></div>
 </>}
 </DialogContent></Dialog>;
}
