import {useEffect,useState} from 'react';
import {request} from '../data/client.js';
// Message navigation keeps its unread badge; the server inbox owns all popup delivery.
export default function useMessageAlerts(userId){
 const [snapshot,setSnapshot]=useState({messages:[],people:[]});
 useEffect(()=>{setSnapshot({messages:[],people:[]});if(!userId)return;let active=true,inFlight=false,version=0;
  function accept(data){if(active)setSnapshot(data);}
  async function refresh(){if(inFlight||document.visibilityState==='hidden')return;inFlight=true;const current=++version;try{const data=await request('messageSnapshot');if(active&&current===version)accept(data);}catch{}finally{inFlight=false;}}
  const sync=event=>{version++;accept(event.detail);};window.addEventListener('teampulse-messages',sync);window.addEventListener('focus',refresh);refresh();const timer=setInterval(refresh,10000);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('teampulse-messages',sync);window.removeEventListener('focus',refresh);};
 },[userId]);
 return {unread:snapshot.messages.filter(m=>m.recipientId===userId&&!m.readAt).length,popup:null,dismiss:()=>{}};
}
