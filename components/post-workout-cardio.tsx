import { useState } from 'react';
import { Activity, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { Session } from '@/lib/workouts';

export default function PostWorkoutCardio({workout,unit,onClose,onSave}:{workout:Session;unit:'mi'|'km';onClose:()=>void;onSave:(cardio:Session['cardio'])=>Promise<void>}){
 const [adding,setAdding]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [activity,setActivity]=useState<Session['cardio']['activity']>('Run');
 const [duration,setDuration]=useState(''),[distance,setDistance]=useState(''),[heartRate,setHeartRate]=useState('');
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="dialog-scroll"><DialogHeader><DialogTitle>{adding?'Add cardio':'Workout saved'}</DialogTitle><DialogDescription>{workout.name} is saved. {adding?'Log a little extra movement.':'Any cardio to add?'}</DialogDescription></DialogHeader>
 {adding?<form className="space-y-5" onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');try{await onSave({activity,duration:duration===''?null:Number(duration),distance:distance===''?null:Number(distance),heartRate:heartRate===''?null:Number(heartRate),unit});onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <div className="activity-choice" role="group" aria-label="Cardio activity">{(['Run','Zone 2 Elliptical'] as const).map(value=><Button key={value} type="button" variant={activity===value?'default':'outline'} aria-pressed={activity===value} className="h-12" onClick={()=>setActivity(value)}>{value==='Run'?<Footprints size={17}/>:<Activity size={17}/>} {value}</Button>)}</div>
 <div className="grid grid-cols-2 gap-4"><label><span className="field-label">Duration / min</span><input required className="big-input" type="number" inputMode="decimal" min="0.1" max="10000" step="any" aria-label="Cardio duration in minutes" value={duration} onChange={e=>setDuration(e.target.value)}/></label><label><span className="field-label">Distance / {unit}</span><input className="big-input" type="number" inputMode="decimal" min="0" max="10000" step="any" placeholder="Optional" aria-label={`Cardio distance in ${unit}`} value={distance} onChange={e=>setDistance(e.target.value)}/></label><label className="col-span-2"><span className="field-label">Average heart rate / bpm</span><input className="big-input" type="number" inputMode="numeric" min="1" max="300" step="1" placeholder="Optional" aria-label="Average heart rate" value={heartRate} onChange={e=>setHeartRate(e.target.value)}/></label></div>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} type="submit" className="w-full h-12">{busy?'Saving…':'Save cardio'}</Button><Button disabled={busy} type="button" variant="ghost" className="w-full h-11" onClick={onClose}>Cancel cardio</Button>
 </form>:<div className="grid gap-3"><Button className="h-12" onClick={()=>setAdding(true)}><Activity size={17}/>Add cardio</Button><Button variant="outline" className="h-11" onClick={onClose}>Done</Button></div>}
 <p className="fine">Your strength workout stays saved. Extra cardio leaves your next workout unchanged.</p>
 </DialogContent></Dialog>;
}
