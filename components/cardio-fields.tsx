import { Activity, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Session } from '@/lib/workouts';

export default function CardioFields({value,onChange}:{value:Session['cardio'];onChange:(value:Session['cardio'])=>void}){
 const number=(text:string,min:number,max:number,integer=false)=>text===''?null:Math.max(min,Math.min(max,integer?Math.round(Number(text)):Number(text)));
 return <div className="space-y-4">
  <div className="activity-choice !my-3" role="group" aria-label="Cardio activity">{(['Run','Zone 2 Elliptical'] as const).map(activity=><Button type="button" key={activity} variant={value.activity===activity?'default':'outline'} aria-pressed={value.activity===activity} className="h-11" onClick={()=>onChange({...value,activity})}>{activity==='Run'?<Footprints size={16}/>:<Activity size={16}/>} {activity}</Button>)}</div>
  <div className="grid grid-cols-2 gap-4">
   <label><span className="field-label">Duration / min</span><input className="big-input" type="number" min="0.1" max="10000" step="any" inputMode="decimal" aria-label="Cardio duration in minutes" value={value.duration??''} onChange={e=>onChange({...value,duration:number(e.target.value,0,10000)})}/></label>
   <label><span className="field-label">Distance / {value.unit}</span><input className="big-input" type="number" min="0" max="10000" step="any" inputMode="decimal" placeholder="Optional" aria-label={`Cardio distance in ${value.unit}`} value={value.distance??''} onChange={e=>onChange({...value,distance:number(e.target.value,0,10000)})}/></label>
   <label className="col-span-2"><span className="field-label">Average heart rate / bpm</span><input className="big-input" type="number" min="1" max="300" step="1" inputMode="numeric" placeholder="Optional" aria-label="Average heart rate" value={value.heartRate??''} onChange={e=>onChange({...value,heartRate:number(e.target.value,1,300,true)})}/></label>
  </div>
  <p className="fine">Duration is required. Distance and heart rate are optional.</p>
 </div>;
}
