import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{sendRecoveryMail} from '../api/password-recovery-mail.js';

const env={
 APP_URL:'https://team.example.test',
 MAILER_API_SECRET:'m'.repeat(64),
 SMTP_HOST:'smtp-relay.brevo.com',
 SMTP_PORT:'587',
 SMTP_USER:'c4e39d001@smtp-brevo.com',
 SMTP_PASS:'test-password',
 MAIL_FROM:'teampulse7875@gmail.com'
};

test('reset email uses Brevo SMTP with required STARTTLS and APP_URL reset link',async()=>{
 let options,message;
 await sendRecoveryMail({kind:'password-reset',to:'person@example.test',token:'a'.repeat(64),env,createTransport:config=>{
  options=config;return {sendMail:async mail=>{message=mail;}};
 }});
 assert.equal(options.host,'smtp-relay.brevo.com');
 assert.equal(options.port,587);
 assert.equal(options.secure,false);
 assert.equal(options.requireTLS,true);
 assert.deepEqual(options.auth,{user:'c4e39d001@smtp-brevo.com',pass:'test-password'});
 assert.deepEqual(message.from,{name:'TeamPulse',address:'teampulse7875@gmail.com'});
 assert.match(message.text,/https:\/\/team\.example\.test\/reset-password#token=a{64}/);
 assert.match(message.text,/within 15 minutes/);
});

test('mail endpoint requires the server secret and only allows POST',async()=>{
 const previous={...process.env};Object.assign(process.env,env);
 const response=()=>({headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
 try{
  const unauth=response();await handler({method:'POST',headers:{},body:{}},unauth);assert.equal(unauth.statusCode,401);
  const method=response();await handler({method:'GET',headers:{}},method);assert.equal(method.statusCode,405);
 }finally{
  for(const key of Object.keys(env))delete process.env[key];
  Object.assign(process.env,previous);
 }
});

test('SMTP errors are logged with server details and credentials are redacted',async()=>{
 const logs=[],original=console.error;console.error=(...args)=>logs.push(args);
 try{
  await assert.rejects(sendRecoveryMail({kind:'password-changed',to:'person@example.test',env,createTransport:()=>({sendMail:async()=>{const error=Error('535 Authentication failed');error.responseCode=535;error.response='535 '+env.SMTP_PASS;throw error;}})}),/535 Authentication failed/);
  assert.equal(JSON.stringify(logs).includes(env.SMTP_PASS),false);
  assert.match(JSON.stringify(logs),/535 Authentication failed/);
 }finally{console.error=original;}
});
