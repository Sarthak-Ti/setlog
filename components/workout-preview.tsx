'use client';
import {Activity,BookOpen,Moon} from 'lucide-react';
import {type AppState,type Session,lastEntry} from '@/lib/workouts';

export default function WorkoutPreview({session,state}:{session:Session;state:AppState}){
 if(session.kind==='rest')return <div className="empty-state !py-10"><Moon className="mx-auto text-primary" size={34}/><h3>Recovery day.</h3><p>A scheduled rest day in your cycle.</p></div>;
 if(session.kind==='cardio')return <div className="py-6 space-y-4"><Activity className="text-primary" size={30}/><h3 className="font-semibold text-lg">Run or Zone 2 elliptical</h3><p className="text-sm text-muted-foreground leading-relaxed">Log duration, with optional distance and average heart rate when this day comes up.</p></div>;
 return <div className="space-y-4">{session.entries.map((entry,index)=>{
  const previous=lastEntry(state,entry.exerciseId,session.templateId)?.entry;
  return <section key={entry.id} className="exercise !mb-0"><div className="exercise-head"><span className="exercise-index">{String(index+1).padStart(2,'0')}</span><div className="min-w-0 flex-1"><h3 className="exercise-name">{entry.name}</h3><p className="fine mt-1">{entry.sets.length} sets · {entry.perHand?'Weight per hand':'Total weight'}</p>{previous&&<p className="last-hint">Last: {previous.sets.filter(s=>s.completed).map(s=>`${s.weight??'—'} lbs × ${s.reps??'—'}`).join(', ')}</p>}</div></div><div className="px-4 pb-4">{entry.sets.map((set,i)=><div key={set.id} className="flex justify-between gap-4 border-t border-border py-3 text-sm"><span className="text-muted-foreground">Set {i+1}</span><span className="mono">{set.weight??'—'} lbs × {set.reps??'—'}</span></div>)}</div></section>;
 })}<p className="fine flex items-center gap-2 pt-2"><BookOpen size={15}/>Suggested sets for this day.</p></div>;
}
