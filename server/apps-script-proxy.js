const MAX_BODY_BYTES=32768;
export async function proxyAppsScript({method,body,backendUrl,fetchImpl=fetch}){
 const fail=(status,code,error)=>({status,body:{ok:false,code,error}});
 if(method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','POST required.');
 let payload;
 try{const raw=typeof body==='string'?body:JSON.stringify(body);if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)return fail(413,'REQUEST_TOO_LARGE','Request exceeds 32 KB.');payload=JSON.parse(raw);if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.action!=='string')return fail(400,'INVALID_REQUEST','Invalid API request.');}catch{return fail(400,'INVALID_JSON','Request must contain valid JSON.');}
 if(!backendUrl)return fail(503,'SETUP_REQUIRED','Google Sheets backend is not configured. Set APPS_SCRIPT_URL in the hosting environment and redeploy.');
 let endpoint;
 try{endpoint=new URL(backendUrl);if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname)||endpoint.search||endpoint.username||endpoint.password)throw Error();}catch{return fail(503,'INVALID_BACKEND_URL','APPS_SCRIPT_URL must be a Google Apps Script /exec deployment URL.');}
 try{
 const upstream=await fetchImpl(endpoint.toString(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow',signal:AbortSignal.timeout(55000)});
 if(upstream.status===401||upstream.status===403)return fail(502,'DEPLOYMENT_ACCESS_RESTRICTED','Google denied access to Apps Script. Check the approved deployment access setting and redeploy.');
 if(!upstream.ok)return fail(502,'BACKEND_UNAVAILABLE','Google Sheets backend is temporarily unavailable. Please try again.');
 let result;try{result=await upstream.json();}catch{return fail(502,'INVALID_BACKEND_RESPONSE','Apps Script did not return JSON. Check the deployment URL and access settings.');}
 if(!result||typeof result.ok!=='boolean')return fail(502,'INVALID_BACKEND_RESPONSE','Invalid Apps Script API response.');
 return {status:200,body:result};
 }catch(e){return fail(e.name==='TimeoutError'||e.name==='AbortError'?504:502,'BACKEND_UNAVAILABLE','Cannot reach the Google Sheets backend. Please try again.');}
}
export async function readBody(req){
 if(req.body!==undefined)return req.body;
 let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES){const e=new Error('Request exceeds 32 KB.');e.status=413;throw e;}}return raw;
}
