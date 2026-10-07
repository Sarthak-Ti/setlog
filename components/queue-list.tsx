'use client';
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {Menu,MoreHorizontal,Trash2,Repeat2,ChevronUp,ChevronDown,Dumbbell,Activity,Moon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from '@/components/ui/dropdown-menu';
import {type QueueItem,type Template,move} from '@/lib/workouts';
import {dragTarget,shiftedRow,swipeOutcome} from '@/lib/queue-gestures';

type Lift={id:string;from:number;over:number;dy:number;startY:number;scrollY:number;centers:number[];space:number;top:number;left:number;width:number;height:number;viewportY:number};
type Swipe={id:string;x:number;moving:boolean};
export default function QueueList({items,templates,currentId,activeId,onReorder,onRemove,onRepeat,onChoose}:{items:QueueItem[];templates:Template[];currentId:string|null;activeId:string|null;onReorder:(items:QueueItem[])=>void;onRemove:(id:string)=>void;onRepeat:(id:string)=>void;onChoose:(id:string)=>void}){
 const [lift,setLift]=useState<Lift|null>(null),[swipe,setSwipe]=useState<Swipe|null>(null),[announcement,setAnnouncement]=useState('');
 const slots=useRef(new Map<string,HTMLDivElement>()),liveLift=useRef<Lift|null>(null),hold=useRef<ReturnType<typeof setTimeout>|null>(null),raf=useRef(0),pointerY=useRef(0),itemsRef=useRef(items),blockedClick=useRef(0);
 const touch=useRef<{id:string;pointerId:number;x:number;y:number;origin:number;offset:number;locked:boolean}|null>(null);
 itemsRef.current=items;
 const pinned=!!activeId&&items[0]?.id===activeId;
 const cancelHold=()=>{if(hold.current){clearTimeout(hold.current);hold.current=null;}};
 const clearDrag=()=>{cancelHold();cancelAnimationFrame(raf.current);liveLift.current=null;setLift(null);};
 useEffect(()=>()=>{if(hold.current)clearTimeout(hold.current);cancelAnimationFrame(raf.current);},[]);
 const signature=items.map(q=>q.id).join('|');
 useEffect(()=>{cancelHold();cancelAnimationFrame(raf.current);liveLift.current=null;setLift(null);touch.current=null;setSwipe(null);},[signature]);
 const name=(id:string)=>templates.find(t=>t.id===itemsRef.current.find(q=>q.id===id)?.templateId)?.name??'Workout';
 const updateDrag=()=>{
  const d=liveLift.current;if(!d)return;
  const dy=pointerY.current-d.startY+window.scrollY-d.scrollY;
  const over=dragTarget(d.centers,d.centers[d.from]+dy,pinned?1:0);
  const next={...d,dy,over,viewportY:d.top+pointerY.current-d.startY};liveLift.current=next;setLift(next);
 };
 const scrollFrame=()=>{
  if(!liveLift.current)return;
  const y=pointerY.current,top=76,bottom=window.innerHeight-100;
  const speed=y<top?-Math.min(13,(top-y)/5):y>bottom?Math.min(13,(y-bottom)/5):0;
  if(speed)window.scrollBy(0,speed);
  updateDrag();raf.current=requestAnimationFrame(scrollFrame);
 };
 const beginHold=(event:ReactPointerEvent<HTMLButtonElement>,item:QueueItem,index:number)=>{
  if(item.id===activeId||!event.isPrimary||event.button!==0)return;
  event.preventDefault();event.stopPropagation();cancelHold();setSwipe(null);touch.current=null;
  event.currentTarget.setPointerCapture(event.pointerId);pointerY.current=event.clientY;
  const startY=event.clientY;
  hold.current=setTimeout(()=>{
   hold.current=null;const list=itemsRef.current,rects=list.map(q=>slots.current.get(q.id)?.getBoundingClientRect());
   if(!rects[index]||rects.some(r=>!r))return;
   const centers=rects.map(r=>r!.top+r!.height/2),space=rects[index]!.height+10;
   const next:Lift={id:item.id,from:index,over:index,dy:0,startY,scrollY:window.scrollY,centers,space,top:rects[index]!.top,left:rects[index]!.left,width:rects[index]!.width,height:rects[index]!.height,viewportY:rects[index]!.top};
   liveLift.current=next;setLift(next);setAnnouncement(`${name(item.id)} picked up. Drag to a new position.`);raf.current=requestAnimationFrame(scrollFrame);
  },180);
 };
 const endDrag=(commit:boolean)=>{
  const d=liveLift.current;clearDrag();
  if(d){blockedClick.current=Date.now()+300;if(commit&&d.over!==d.from){onReorder(move(itemsRef.current,d.from,d.over));setAnnouncement(`${name(d.id)} moved to position ${d.over+1}.`);}else setAnnouncement('Reorder cancelled.');}
 };
 const startSwipe=(event:ReactPointerEvent<HTMLDivElement>,item:QueueItem)=>{
  if(liveLift.current||!event.isPrimary||event.button!==0||(event.target as HTMLElement).closest('button,input,a,[role="button"]'))return;
  const origin=swipe?.id===item.id?swipe.x:0;
  touch.current={id:item.id,pointerId:event.pointerId,x:event.clientX,y:event.clientY,origin,offset:origin,locked:false};
  setSwipe({id:item.id,x:origin,moving:false});
 };
 const moveSwipe=(event:ReactPointerEvent<HTMLDivElement>)=>{
  const t=touch.current;if(!t||t.pointerId!==event.pointerId)return;
  const dx=event.clientX-t.x,dy=event.clientY-t.y;
  if(!t.locked){if(Math.abs(dy)>10&&Math.abs(dy)>=Math.abs(dx)){touch.current=null;setSwipe(null);return;}if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.2)return;t.locked=true;event.currentTarget.setPointerCapture(event.pointerId);}
  event.preventDefault();const width=event.currentTarget.clientWidth;t.offset=Math.min(0,Math.max(-width,t.origin+dx));setSwipe({id:t.id,x:t.offset,moving:true});
 };
 const endSwipe=(event:ReactPointerEvent<HTMLDivElement>,cancel=false)=>{
  const t=touch.current;if(!t||t.pointerId!==event.pointerId)return;touch.current=null;
  if(cancel){setSwipe(null);return;}if(!t.locked){if(t.origin)setSwipe(null);return;}
  blockedClick.current=Date.now()+300;
  const action=swipeOutcome(t.offset,event.currentTarget.clientWidth);
  if(action==='remove'){setSwipe(null);onRemove(t.id);}else setSwipe(action==='reveal'?{id:t.id,x:-92,moving:false}:null);
 };
 const liftedTemplate=lift?templates.find(t=>t.id===items.find(q=>q.id===lift.id)?.templateId):null;
 return <div className="queue-direct" aria-label="Current cycle"><p id="queue-gesture-help" className="sr-only">Hold the three-line handle to drag. With the handle focused, use up and down arrow keys to reorder. Swipe a row left to remove, or use its options menu.</p><div role="status" aria-live="polite" className="sr-only">{announcement}</div>
  {items.map((item,index)=>{
   const template=templates.find(t=>t.id===item.templateId)!,active=item.id===activeId,current=item.id===currentId,dragging=lift?.id===item.id;
   const x=swipe?.id===item.id?swipe.x:0,swiping=swipe?.id===item.id&&swipe.moving;
   const shift=lift&&!dragging?shiftedRow(index,lift.from,lift.over,lift.space):0;
   return <div key={item.id} ref={el=>{if(el)slots.current.set(item.id,el);else slots.current.delete(item.id);}} className={`queue-slot ${dragging?'drag-origin':''}`} style={{transform:shift?`translateY(${shift}px)`:undefined,zIndex:dragging?0:1}}>
    <div className="queue-swipe-shell" style={{opacity:dragging?0:undefined}}>
     <div className={`queue-remove-underlay ${x<-150?'swipe-commit':''}`} aria-hidden={x===0}><button className="queue-remove-button" tabIndex={x<0?0:-1} aria-label={`Remove ${template.name} from this cycle`} onClick={()=>{setSwipe(null);onRemove(item.id);}}><Trash2 size={19}/><span>Remove</span></button></div>
     <div className={`queue-surface ${current?'is-current':''}`} style={{transform:`translateX(${x}px)`,transition:swiping?'none':undefined}} onPointerDown={e=>startSwipe(e,item)} onPointerMove={moveSwipe} onPointerUp={e=>endSwipe(e)} onPointerCancel={e=>endSwipe(e,true)} onClickCapture={e=>{if(Date.now()<blockedClick.current){e.preventDefault();e.stopPropagation();}}}>
      <button className="queue-drag-handle" aria-label={`Reorder ${template.name}`} aria-describedby="queue-gesture-help" disabled={active} title={active?'The active workout stays first':'Hold and drag to reorder'} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>beginHold(e,item,index)} onPointerMove={e=>{pointerY.current=e.clientY;if(liveLift.current)e.preventDefault();}} onPointerUp={()=>endDrag(true)} onPointerCancel={()=>endDrag(false)} onLostPointerCapture={()=>{if(liveLift.current||hold.current)endDrag(false);}} onKeyDown={e=>{if(e.key==='Escape'){endDrag(false);return;}if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const to=index+(e.key==='ArrowUp'?-1:1);if(to>=(pinned?1:0)&&to<items.length){onReorder(move(items,index,to));setAnnouncement(`${template.name} moved to position ${to+1}.`);}}}}><Menu size={20} strokeWidth={1.8}/></button>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><p className="font-semibold text-base">{template.name}</p>{current&&<span className="pill !text-[10px] !py-0.5 !px-1.5">{active?'ACTIVE':'NEXT'}</span>}</div><p className="fine mt-1">{template.focus}</p></div>
      {!current&&<Button variant="ghost" className="h-11 px-2 text-sm shrink-0" aria-label={`Do ${template.name} today`} onClick={()=>onChoose(item.id)}>Do today</Button>}
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-9 shrink-0" aria-label={`Options for ${template.name} at position ${index+1}`}><MoreHorizontal size={19}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={active||index===(pinned?1:0)} onSelect={()=>onReorder(move(items,index,index-1))}><ChevronUp/>Move earlier</DropdownMenuItem><DropdownMenuItem disabled={active||index===items.length-1} onSelect={()=>onReorder(move(items,index,index+1))}><ChevronDown/>Move later</DropdownMenuItem><DropdownMenuItem disabled={items.length>=100} onSelect={()=>onRepeat(item.id)}><Repeat2/>Repeat workout</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onSelect={()=>onRemove(item.id)}><Trash2/>Remove from cycle</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
     </div>
    </div>
   </div>;
  })}
  {lift&&liftedTemplate&&createPortal(<div aria-hidden="true" className="queue-drag-overlay" style={{top:lift.viewportY,left:lift.left,width:lift.width,height:lift.height}}>
   <div className="queue-swipe-shell is-lifted"><div className={`queue-surface ${lift.id===currentId?'is-current':''}`} style={{minHeight:lift.height}}>
    <span className="queue-drag-handle"><Menu size={20} strokeWidth={1.8}/></span>
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><p className="font-semibold text-base">{liftedTemplate.name}</p>{lift.id===currentId&&<span className="pill !text-[10px] !py-0.5 !px-1.5">NEXT</span>}</div><p className="fine mt-1">{liftedTemplate.focus}</p></div>
    {lift.id!==currentId&&<span className="inline-flex h-11 items-center px-2 text-sm shrink-0 font-medium">Do today</span>}<span className="inline-flex h-11 w-9 items-center justify-center shrink-0"><MoreHorizontal size={19}/></span>
   </div></div>
  </div>,document.body)}
 </div>;
}
