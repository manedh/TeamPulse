import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import {backend,password} from './helpers/backend.mjs';
function recovery(){
 const b=backend('e@company.test');b.properties.APP_URL='https://team.example.test';b.properties.MAILER_API_SECRET='m'.repeat(64);b.properties.PASSWORD_RESET_SECRET='a'.repeat(64);
 b.mail=[];b.requests=[];b.waits=[];b.ctx.Utilities.sleep=ms=>b.waits.push(ms);b.ctx.Utilities.computeHmacSha256Signature=(message,key)=>[...crypto.createHmac('sha256',key).update(message).digest()];
 b.ctx.UrlFetchApp={fetch:(url,options)=>{
  const payload=JSON.parse(options.payload);b.requests.push({url,options,payload});
  const reset=payload.kind==='password-reset',link=reset?'https://team.example.test/reset-password#token='+payload.token:'';
  b.mail.push({kind:payload.kind,to:payload.to,subject:reset?'TeamPulse: reset your password':'TeamPulse: your password was changed',body:link});
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true})};
 }};
 b.issue=(email='e@company.test')=>b.call('requestPasswordReset',{email},'');
 b.tokenFromMail=()=>b.mail.findLast(m=>m.kind==='password-reset')?.body.match(/#token=([a-f0-9]{64})/)[1];
 b.reset=(token=b.tokenFromMail(),newPassword='New secure password 2026!')=>b.call('resetPassword',{token,newPassword,confirmPassword:newPassword},'');
 return b;
}
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function allowResend(b,email='e@company.test'){const key='RESET_EMAIL_'+hash(email),bucket=JSON.parse(b.properties[key]);bucket.last=Date.now()-61000;b.properties[key]=JSON.stringify(bucket);}

test('reset request is generic for known/unknown/inactive emails and stores only token hashes',()=>{
 const b=recovery();const known=b.issue();const token=b.tokenFromMail();assert.match(token,/^[a-f0-9]{64}$/);
 const unknown=b.issue('unknown@example.test');assert.deepEqual(JSON.parse(JSON.stringify(known)),JSON.parse(JSON.stringify(unknown)));assert.equal(b.mail.length,1);
 b.sheets.employees.find(r=>r[0]==='x')[6]='Inactive';assert.deepEqual(JSON.parse(JSON.stringify(b.issue('x@company.test'))),JSON.parse(JSON.stringify(known)));
 assert.equal(b.sheets.passwordResets.length,2);assert.equal(b.sheets.passwordResets[1][2],hash(token));assert.equal(JSON.stringify(b.sheets).includes(token),false);assert.equal(JSON.stringify(known).includes(token),false);assert.ok(b.waits.every(ms=>ms>2000&&ms<=2500));
 assert.match(b.mail[0].body,/https:\/\/team.example.test\/reset-password#token=/);assert.equal(b.mail[0].to,'e@company.test');
 const lookup=b.call('checkAccount',{email:'e@company.test'},'');const absent=b.call('checkAccount',{email:'absent@example.test'},'');assert.deepEqual(JSON.parse(JSON.stringify(lookup)),JSON.parse(JSON.stringify(absent)));assert.equal(lookup.data.exists,undefined);
});
test('successful reset uses bcrypt policy, consumes token, revokes sessions, confirms by email and does not sign in',()=>{
 const b=recovery();b.issue();const token=b.tokenFromMail(),result=b.reset();assert.equal(result.ok,true);assert.equal(result.data.token,undefined);assert.ok(b.sheets.sessions[1][4]);assert.ok(b.sheets.passwordResets[1][4]);
 const credential=b.sheets.credentials.find(r=>r[1]==='e');assert.match(credential[3],/^\$2b\$12\$/);assert.equal(bcrypt.compareSync('New secure password 2026!',credential[3]),true);
 assert.equal(b.call('bootstrap').code,'UNAUTHENTICATED');assert.equal(b.reset(token).code,'INVALID_RESET_LINK');assert.equal(b.mail.length,2);assert.equal(b.mail[1].body.includes('New secure password 2026!'),false);
 assert.equal(b.call('login',{email:'e@company.test',password},'').ok,false);assert.equal(b.call('login',{email:'e@company.test',password:'New secure password 2026!'},'').ok,true);
});
test('expired, used, malformed, inactive and account-changed reset links are rejected',()=>{
 for(const reason of ['expired','used','invalid','inactive','email','password']){
  const b=recovery();b.issue();let token=b.tokenFromMail();
  if(reason==='expired')b.sheets.passwordResets[1][3]=new Date(Date.now()-1).toISOString();
  if(reason==='used')b.sheets.passwordResets[1][4]=new Date().toISOString();
  if(reason==='invalid')token='f'.repeat(64);
  if(reason==='inactive')b.sheets.employees.find(r=>r[0]==='e')[6]='Inactive';
  if(reason==='email')b.sheets.credentials.find(r=>r[1]==='e')[2]='changed@example.test';
  if(reason==='password')b.sheets.credentials.find(r=>r[1]==='e')[3]='changed';
  assert.equal(b.reset(token).code,'INVALID_RESET_LINK',reason);
 }
});
test('replacement token invalidates earlier links and resend cooldown applies without revealing accounts',()=>{
 const b=recovery();b.issue();const old=b.tokenFromMail();b.issue();assert.equal(b.mail.length,1);allowResend(b);b.issue();const newer=b.tokenFromMail();assert.notEqual(old,newer);assert.equal(b.reset(old).code,'INVALID_RESET_LINK');assert.equal(b.reset(newer).ok,true);
});
test('per-account and global request limits and reset submission limits are enforced',()=>{
 const b=recovery();for(let i=0;i<6;i++){b.issue();allowResend(b);}assert.equal(b.mail.length,5);
 const c=recovery();c.properties.RESET_REQUEST_GLOBAL=JSON.stringify({start:Date.now(),count:20,last:0});assert.equal(c.issue().ok,true);assert.equal(c.mail.length,0);
 const d=recovery();d.issue();d.properties.RESET_SUBMIT_GLOBAL=JSON.stringify({start:Date.now(),count:50,last:0});assert.equal(d.reset().ok,false);assert.equal(d.sheets.passwordResets[1][4],'');
});
test('input policy and origin allowlist reject unsafe input without credential writes',()=>{
 const b=recovery();assert.equal(b.issue('not-email').ok,false);b.issue();const token=b.tokenFromMail(),before=b.sheets.credentials.find(r=>r[1]==='e')[3];
 for(const pass of ['short','a'.repeat(73),'😀'.repeat(19)])assert.equal(b.reset(token,pass).ok,false);
 assert.equal(b.call('resetPassword',{token,newPassword:'Password long enough',confirmPassword:'different'},'').ok,false);assert.equal(b.sheets.credentials.find(r=>r[1]==='e')[3],before);
 assert.equal(b.call('requestPasswordReset',{email:'e@company.test',frontendUrl:'https://evil.test'},'').ok,false);
 for(const url of ['https://evil.test/path','https://team.example.test@evil.test','https://team.example.test/?next=evil','http://team.example.test']){const c=recovery();c.properties.APP_URL=url;assert.equal(c.issue().ok,false);assert.equal(c.mail.length,0);}
});
test('SMTP delivery failures invalidate the unsent link and retain generic response',()=>{
 const b=recovery();b.ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>502,getContentText:()=>JSON.stringify({error:'Invalid login: 535 Authentication failed'})});
 assert.equal(b.issue().ok,true);assert.ok(b.sheets.passwordResets[1][4]);
 const c=recovery();c.issue();c.ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>502,getContentText:()=>JSON.stringify({error:'SMTP confirmation unavailable'})});assert.equal(c.reset().ok,true);
});
test('same-token requests cannot both succeed; simulated lock contention cannot reuse it',async()=>{
 const b=recovery();b.issue();const token=b.tokenFromMail();const results=await Promise.all([Promise.resolve().then(()=>b.reset(token)),Promise.resolve().then(()=>b.reset(token))]);assert.equal(results.filter(r=>r.ok).length,1);
 const c=recovery();c.issue();c.ctx.testResetToken=c.tokenFromMail();
 vm.runInContext("const originalUpdate=updateRaw_;let attempted=false;let concurrentResult;updateRaw_=function(k,r){if(k==='passwordResets'&&r.usedAt&&!attempted){attempted=true;concurrentResult=api({action:'resetPassword',payload:{token:testResetToken,newPassword:'Concurrent password 2026!',confirmPassword:'Concurrent password 2026!'}});}return originalUpdate(k,r);};",c.ctx);
 assert.equal(c.reset().ok,true);assert.equal(vm.runInContext('concurrentResult.ok',c.ctx),false);assert.equal(c.reset().code,'INVALID_RESET_LINK');
});
test('additive recovery migration never changes existing credentials or employee records',()=>{
 const b=recovery(),before=JSON.stringify([b.sheets.employees,b.sheets.credentials]);delete b.sheets.passwordResets;vm.runInContext('preparePasswordRecovery_();preparePasswordRecovery_();',b.ctx);assert.equal(b.sheets.passwordResets.length,1);assert.equal(JSON.stringify([b.sheets.employees,b.sheets.credentials]),before);
});
test('frontend reset URL avoids query tokens, strips fragment and has a direct Vercel route',()=>{
 const main=fs.readFileSync('src/main.jsx','utf8');assert.match(main,/window\.history\.replaceState/);assert.match(main,/window\.location\.hash/);
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));assert.ok(config.rewrites.some(r=>r.source==='/reset-password'&&r.destination==='/index.html'));
 const login=fs.readFileSync('src/pages/Login.jsx','utf8');assert.match(login,/Forgot password\?/);assert.doesNotMatch(login,/result\.exists/);
});

test('recovery screens render prefilled email, password fields, invalid-link and token-free markup',async t=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server'),{createServer}=await import('vite');
 globalThis.sessionStorage={getItem:()=>null};const server=await createServer({server:{middlewareMode:true},appType:'custom'});t.after(async()=>{await server.close();delete globalThis.sessionStorage;});
 const {default:Screen}=await server.ssrLoadModule('/src/pages/PasswordRecovery.jsx');
 const request=renderToStaticMarkup(React.createElement(Screen,{email:'user@example.test',onBack(){}}));assert.match(request,/user@example.test/);assert.match(request,/Send reset link/);
 const reset=renderToStaticMarkup(React.createElement(Screen,{mode:'reset',token:'a'.repeat(64),onBack(){}}));assert.match(reset,/New password/);assert.match(reset,/Confirm password/);assert.equal(reset.includes('a'.repeat(64)),false);
 const invalid=renderToStaticMarkup(React.createElement(Screen,{mode:'reset',token:null,onBack(){}}));assert.match(invalid,/invalid or missing/);assert.doesNotMatch(invalid,/name="newPassword"/);
});

test('reset processing failures stay generic and diagnostics contain no request secrets',()=>{
 const b=recovery(),logs=[];b.ctx.console.error=text=>logs.push(text);vm.runInContext("const realAppend=appendRaw_;appendRaw_=function(k,r){if(k==='passwordResets')throw Error('simulated storage failure');return realAppend(k,r);};",b.ctx);
 const failed=b.issue(),unknown=b.issue('unknown@example.test');assert.deepEqual(JSON.parse(JSON.stringify(failed)),JSON.parse(JSON.stringify(unknown)));assert.equal(b.mail.length,0);assert.equal(logs.some(text=>text.includes('e@company.test')),false);
 const c=recovery(),safeLogs=[];c.ctx.console.error=text=>safeLogs.push(text);c.issue();const token=c.tokenFromMail();c.reset(token,'short');assert.equal(JSON.stringify(safeLogs).includes(token),false);assert.equal(JSON.stringify(safeLogs).includes('short'),false);
});

test('recovery mail is sent through the authenticated Vercel endpoint',()=>{
 const b=recovery();b.issue();
 const request=b.requests[0];assert.equal(request.url,'https://team.example.test/api/password-recovery-mail');
 assert.equal(request.options.headers.Authorization,'Bearer '+'m'.repeat(64));
 assert.deepEqual(JSON.parse(JSON.stringify(request.payload)),{kind:'password-reset',to:'e@company.test',token:b.tokenFromMail()});
});
