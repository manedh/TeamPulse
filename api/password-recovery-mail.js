import {timingSafeEqual} from 'node:crypto';
import nodemailer from 'nodemailer';

function mailConfig(env){
 const port=Number(env.SMTP_PORT);
 let appUrl;
 try{
  const parsed=new URL(env.APP_URL);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error();
  appUrl=parsed.origin;
 }catch{throw Error('APP_URL must be the HTTPS origin of the deployed TeamPulse app.');}
 if(!env.SMTP_HOST||!Number.isInteger(port)||port!==587||!env.SMTP_USER||!env.SMTP_PASS||!env.MAIL_FROM)throw Error('SMTP_HOST, SMTP_PORT=587, SMTP_USER, SMTP_PASS and MAIL_FROM must be configured.');
 return {appUrl,host:env.SMTP_HOST,port,user:env.SMTP_USER,password:env.SMTP_PASS,from:env.MAIL_FROM};
}

function validEmail(value){
 return typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function smtpErrorDetails(error,password){
 const detail=[error&&error.code,error&&error.responseCode&&'SMTP '+error.responseCode,error&&error.command,error&&error.response,error&&error.message].filter(Boolean).join(' | ');
 return detail.slice(0,800).split(password).join('[redacted]')||'Unknown SMTP error.';
}

export async function sendRecoveryMail({kind,to,token,env=process.env,createTransport=nodemailer.createTransport}){
 if(!validEmail(to))throw Error('A valid recipient email is required.');
 if(!['password-reset','password-changed'].includes(kind))throw Error('Unsupported recovery email type.');
 if(kind==='password-reset'&&(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token)))throw Error('A valid reset token is required.');
 const config=mailConfig(env),transport=createTransport({
  host:config.host,
  port:config.port,
  secure:false,
  requireTLS:true,
  auth:{user:config.user,pass:config.password}
 });
 const resetUrl=kind==='password-reset'?config.appUrl+'/reset-password#token='+token:'';
 const message=kind==='password-reset'
  ?{subject:'TeamPulse: reset your password',text:'A password reset was requested for your TeamPulse account.\n\nOpen this secure link within 15 minutes:\n'+resetUrl+'\n\nThis link can be used once. If you did not request this, ignore this email. Your password has not changed.'}
  :{subject:'TeamPulse: your password was changed',text:'Your TeamPulse password was reset successfully. All previous sessions have been signed out. If you did not make this change, contact your administrator immediately. No password is included in this email.'};
 try{
  await transport.sendMail({from:{name:'TeamPulse',address:config.from},to,subject:message.subject,text:message.text});
 }catch(error){
  const detail=smtpErrorDetails(error,config.password);
  console.error('TeamPulse SMTP delivery failed:',detail);
  throw Error(detail);
 }
}

function authorized(req,secret){
 const header=req.headers&&req.headers.authorization||'',provided=header.startsWith('Bearer ')?header.slice(7):'';
 const expected=Buffer.from(secret||''),actual=Buffer.from(provided);
 return expected.length>=32&&actual.length===expected.length&&timingSafeEqual(actual,expected);
}

function readPayload(body){
 if(typeof body==='string'){
  if(Buffer.byteLength(body,'utf8')>2048)throw Error('Request is too large.');
  body=JSON.parse(body);
 }
 if(!body||typeof body!=='object'||Array.isArray(body)||!Object.keys(body).every(key=>['kind','to','token'].includes(key)))throw Error('Invalid email request.');
 if(!validEmail(body.to)||!['password-reset','password-changed'].includes(body.kind))throw Error('Invalid email request.');
 if(body.kind==='password-reset'&&(Object.keys(body).length!==3||typeof body.token!=='string'||! /^[a-f0-9]{64}$/.test(body.token)))throw Error('Invalid email request.');
 if(body.kind==='password-changed'&&(Object.keys(body).length!==2||'token'in body))throw Error('Invalid email request.');
 return body;
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'POST required.'});}
 if(!authorized(req,process.env.MAILER_API_SECRET))return res.status(401).json({error:'Unauthorized.'});
 let payload;
 try{payload=readPayload(req.body);}catch(error){return res.status(400).json({error:error.message||'Invalid email request.'});}
 try{
  await sendRecoveryMail(payload);
  return res.status(200).json({ok:true});
 }catch(error){
  const message=error&&typeof error.message==='string'?error.message:'Unable to send recovery email.';
  return res.status(502).json({error:message});
 }
}
