// Capture only on an explicit location/punch action. No background tracking.
export function locationMessage(location){
 const status=location?.status;
 if(status==='captured')return 'Device location ready (accuracy '+Math.round(location.accuracy)+' m). It is saved when you punch in or out.';
 return {denied:'Location permission is blocked. Allow Location in the browser site settings and enable device Location Services, then retry.',blocked:'This embedded page blocks location. Open the standalone TeamPulse website in Chrome or Edge and allow Location.',insecure:'Location needs HTTPS or localhost. Open the secure TeamPulse website.',unsupported:'This browser does not support location. Open TeamPulse in Chrome or Edge.',timeout:'Location took too long. Enable device Location Services, move near a window and retry.',unavailable:'The device could not find a location. Enable Location Services / Wi-Fi and retry.'}[status]||'Location is requested when you punch in or out.';
}
export async function captureLocation({precise=false}={}){
 if(!globalThis.isSecureContext)return {status:'insecure'};
 if(!navigator.geolocation)return {status:'unsupported'};
 const policy=globalThis.document?.permissionsPolicy||globalThis.document?.featurePolicy;
 try{if(policy?.allowsFeature&&!policy.allowsFeature('geolocation'))return {status:'blocked'};}catch{}
 const attempt=(high,timeout)=>new Promise(resolve=>{
  let finished=false;const done=result=>{if(finished)return;finished=true;clearTimeout(timer);resolve(result);};
  // Browser timeout excludes permission prompts. Allow time to answer before ending capture.
  const timer=setTimeout(()=>done({status:'timeout'}),Math.max(60000,timeout+1000));
  try{navigator.geolocation.getCurrentPosition(p=>{
   const {latitude,longitude,accuracy}=p.coords;
   if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(accuracy)||accuracy<0){done({status:'unavailable'});return;}
   done({status:'captured',latitude,longitude,accuracy});
  },e=>done({status:e.code===1?'denied':e.code===3?'timeout':'unavailable'}),{enableHighAccuracy:high,timeout,maximumAge:0});}catch{done({status:'unavailable'});}
 });
 const result=await attempt(precise,precise?20000:10000);
 if(['timeout','unavailable'].includes(result.status))return attempt(!precise,precise?10000:20000);
 return result;
}
