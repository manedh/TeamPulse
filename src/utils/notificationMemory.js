// Keep only opaque event fingerprints between app openings. Message history stays in the tab.
const limit=5000;
const fallback=new Map();
export function notificationFingerprint(id){
 let value=String(id);try{const parsed=JSON.parse(value);if(Array.isArray(parsed))value=JSON.stringify(parsed.map(part=>part==null?'':String(part)));}catch{}
 let first=2166136261,second=2246822507;
 for(let index=0;index<value.length;index++){const code=value.charCodeAt(index);first=Math.imul(first^code,16777619);second=Math.imul(second^code,3266489909);}
 return (first>>>0).toString(16).padStart(8,'0')+(second>>>0).toString(16).padStart(8,'0');
}
export function notificationMemoryKey(userId){return 'teampulse-notification-receipts-v1:'+encodeURIComponent(userId);}
export function createNotificationMemory(userId,storage){
 const key=notificationMemoryKey(userId);
 const empty=()=>({seen:[],read:[]});
 const clean=value=>({seen:Array.isArray(value?.seen)?value.seen.filter(item=>typeof item==='string'&&/^[a-f0-9]{16}$/.test(item)).slice(-limit):[],read:Array.isArray(value?.read)?value.read.filter(item=>typeof item==='string'&&/^[a-f0-9]{16}$/.test(item)).slice(-limit):[]});
 function load(){let saved=empty();try{saved=clean(JSON.parse(storage?.getItem(key)||'null'));}catch{}const local=fallback.get(key)||empty();return {seen:[...new Set([...local.seen,...saved.seen])].slice(-limit),read:[...new Set([...local.read,...saved.read])].slice(-limit)};}
 function store(state){const saved={seen:[...new Set(state.seen)].slice(-limit),read:[...new Set(state.read)].slice(-limit)};fallback.set(key,saved);try{storage?.setItem(key,JSON.stringify(saved));}catch{}return saved;}
 return {
  key,
  remember(items){const state=load();for(const item of items){const fingerprint=notificationFingerprint(item.id);state.seen.push(fingerprint);if(item.read)state.read.push(fingerprint);}store(state);},
  receive(events,initial=false){const state=load(),seen=new Set(state.seen),read=new Set(state.read);const unique=[...new Map(events.map(event=>[notificationFingerprint(event.id),event])).values()];const fresh=unique.filter(event=>!seen.has(notificationFingerprint(event.id)));for(const event of unique)state.seen.push(notificationFingerprint(event.id));store(state);return {items:fresh.map(event=>({...event,read:read.has(notificationFingerprint(event.id))})),fresh:initial?[]:fresh};},
  markRead(ids){const state=load();for(const id of ids){const fingerprint=notificationFingerprint(id);state.seen.push(fingerprint);state.read.push(fingerprint);}store(state);},
  isRead(id){return load().read.includes(notificationFingerprint(id));}
 };
}
