/** Find the nearest original row center; the active first session can stay pinned. */
export function dragTarget(centers:number[],center:number,minimumIndex=0):number{
 if(!centers.length)return -1;
 let result=minimumIndex;
 for(let i=minimumIndex;i<centers.length;i++)if(Math.abs(centers[i]-center)<Math.abs(centers[result]-center))result=i;
 return result;
}
export function swipeOutcome(offset:number,width:number):'remove'|'reveal'|'close'{
 if(offset<=-Math.min(width*.58,220))return 'remove';
 return offset<-42?'reveal':'close';
}
export function shiftedRow(index:number,from:number,to:number,space:number):number{
 if(from<to&&index>from&&index<=to)return -space;
 if(from>to&&index>=to&&index<from)return space;
 return 0;
}
