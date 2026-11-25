import {proxyAppsScript,readBody} from '../server/apps-script-proxy.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')res.setHeader('Allow','POST');
 try{const result=await proxyAppsScript({method:req.method,body:req.method==='POST'?await readBody(req):null,backendUrl:process.env.APPS_SCRIPT_URL});return res.status(result.status).json(result.body);}
 catch{return res.status(413).json({ok:false,code:'REQUEST_TOO_LARGE',error:'Unable to read request. Maximum body size is 32 KB.'});}
}
