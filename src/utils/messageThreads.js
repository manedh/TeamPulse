export function messageThreads(messages,people,userId){
 const latest=new Map();
 for(const message of messages){const id=message.senderId===userId?message.recipientId:message.senderId;const old=latest.get(id);if(!old||message.created.localeCompare(old.created)>=0)latest.set(id,message);}
 return people.filter(p=>p.id!==userId).map(p=>({...p,lastMessage:latest.get(p.id)})).sort((a,b)=>(b.lastMessage?.created||'').localeCompare(a.lastMessage?.created||'')||a.name.localeCompare(b.name));
}
export function enterSends(event){return event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent?.isComposing&&!event.isComposing&&event.keyCode!==229;}
