import {indiaDate} from '../utils/attendance.js';
export const today=()=>indiaDate();
export const emptyData=()=>({teamPresence:[],employees:[],projects:[],tasks:[],attendance:[],worklogs:[],leaves:[],announcements:[]});
let token=sessionStorage.getItem('teampulse-session')||'';
export const hasSession=()=>Boolean(token);
export function setSession(value){token=value||'';if(token)sessionStorage.setItem('teampulse-session',token);else sessionStorage.removeItem('teampulse-session');}
export async function request(action,payload={}){
 const body={action,payload,token};let response;
 if(window.google?.script?.run){response=await new Promise((resolve,reject)=>window.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).api(body));}
 else{let r;try{r=await fetch('/api/teampulse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});response=await r.json();}catch{throw new Error('Cannot connect to TeamPulse. Please try again.');}}
 if(!response.ok){const e=new Error(response.error==='Unknown action.'?'The Apps Script backend is outdated. Deploy the latest deployment/Code.gs and deployment/Index.html as a new version, then reload.':response.error||'Unable to complete request.');e.code=response.code;if(e.code==='UNAUTHENTICATED')setSession('');throw e;}return response.data;
}
