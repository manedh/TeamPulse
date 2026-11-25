export function mergePopupQueue(previous,result){
 const active=new Set(result.activePopupIds||[]),kept=previous.filter(item=>active.has(item.id));
 const ids=new Set(kept.map(item=>item.id));
 return [...kept,...(result.freshItems||result.items||[]).filter(item=>!item.read&&result.freshIds?.includes(item.id)&&!ids.has(item.id))].slice(0,100);
}
