/* Private server helpers: trailing underscores prevent direct google.script.run calls. */
function authError_(){const e=new Error('Your session has expired. Please log in again.');e.code='UNAUTHENTICATED';return e;}
function email_(value){require_(typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),'Enter a valid email address.');return value.trim().toLowerCase();}
function password_(value){require_(typeof value==='string'&&value.length>=12&&!bcrypt.truncates(value),'Password must contain at least 12 characters and at most 72 UTF-8 bytes.');}
function digest_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(b=>(b&255).toString(16).padStart(2,'0')).join('');}
function hashPassword_(password){password_(password);const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.getUuid()+Utilities.getUuid(),Utilities.Charset.UTF_8).slice(0,16).map(b=>b&255);return bcrypt.hashSync(password,'$2b$12$'+bcrypt.encodeBase64(bytes,16));}
function publicUser_(u){return Object.fromEntries(SCHEMA.employees.map(k=>[k,u[k]||'']));}
function limitAuth_(action){const props=PropertiesService.getScriptProperties();const key='AUTH_RATE_'+action;let r;try{r=JSON.parse(props.getProperty(key)||'null');}catch{}const now=Date.now();if(!r||now-r.start>=900000)r={start:now,count:0};require_(r.count<(action==='register'?20:150),'Too many requests. Please try again later.');r.count++;props.setProperty(key,JSON.stringify(r));}
function audit_(actor,action,target){append_('audit',{id:Utilities.getUuid(),actor,action,target,created:new Date().toISOString()});}
function authentication_(action,p){
 limitAuth_(action);const email=email_(p.email);if(action==='register')password_(p.password);else require_(typeof p.password==='string'&&p.password.length>0&&!bcrypt.truncates(p.password),'Enter your password.');
 const existing=rows_('employees').find(e=>e.email.toLowerCase()===email);let credential=rows_('credentials').find(c=>c.email===email);
 if(action==='register'){
 require_(!credential,'This account already exists. Use Log in.');
 require_(!existing||!['Admin','HR','Team Leader'].includes(existing.role),'This account is managed by your administrator.');
 ['name','department','designation'].forEach(k=>require_(typeof p[k]==='string'&&p[k].trim().length>=2&&p[k].length<=150,'Enter your '+k+'.'));
 const now=new Date().toISOString();const u=existing||{id:Utilities.getUuid(),email,created:now};
 u.name=p.name.trim();u.department=p.department.trim();u.designation=p.designation.trim();u.role='Employee';u.status='Pending';
 const passwordHash=hashPassword_(p.password);
 if(existing)update_('employees',u);else append_('employees',u);
 append_('credentials',{id:Utilities.getUuid(),employeeId:u.id,email,passwordHash,failedAttempts:0,lockedUntil:'',created:now,lastLogin:''});audit_(u.id,'register',u.id);
 return {pending:true,message:'Your account has been created. Admin/HR can now see your profile in Employees. Once approved, log in with your email and password.'};
 }
 // A fixed dummy bcrypt comparison makes unknown accounts follow the same expensive path.
 require_(!credential||!credential.lockedUntil||Date.parse(credential.lockedUntil)<=Date.now(),'Too many failed attempts. Try again after 15 minutes.');
 const valid=bcrypt.compareSync(p.password,credential?credential.passwordHash:'$2b$12$LQv3c1yqBWVHxkd0LHAkCOYHVEfFQRH7V6M4K8E9Q0fR4/46.dJLS');
 if(!credential||!valid){if(credential){credential.failedAttempts=Number(credential.failedAttempts||0)+1;if(credential.failedAttempts>=5){credential.lockedUntil=new Date(Date.now()+900000).toISOString();credential.failedAttempts=0;}update_('credentials',credential);}throw Error('Email or password is incorrect.');}
 const u=rows_('employees').find(e=>e.id===credential.employeeId);require_(u,'Account unavailable. Contact your administrator.');
 require_(u.status==='Active',u.status==='Pending'?'Your account is awaiting Admin/HR approval.':'Your account is inactive. Contact your administrator.');
 credential.failedAttempts=0;credential.lockedUntil='';credential.lastLogin=new Date().toISOString();update_('credentials',credential);
 const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
 append_('sessions',{id:Utilities.getUuid(),employeeId:u.id,tokenHash:digest_(token),expires:new Date(Date.now()+28800000).toISOString(),revoked:'',created:new Date().toISOString()});audit_(u.id,'login',u.id);
 return {token,user:publicUser_(u),db:state_(u)};
}
function revokeSessions_(employeeId){rows_('sessions').filter(s=>s.employeeId===employeeId&&!s.revoked).forEach(s=>{s.revoked=new Date().toISOString();update_('sessions',s);});}
function changePassword_(u,p){password_(p.newPassword);require_(typeof p.currentPassword==='string'&&!bcrypt.truncates(p.currentPassword),'Current password is invalid.');const c=rows_('credentials').find(c=>c.employeeId===u.id);require_(c&&bcrypt.compareSync(p.currentPassword,c.passwordHash),'Current password is incorrect.');c.passwordHash=hashPassword_(p.newPassword);c.failedAttempts=0;c.lockedUntil='';update_('credentials',c);revokeSessions_(u.id);audit_(u.id,'changePassword',u.id);}

// Coordinates are supplied by the device. Legacy clients may record an unavailable status.
function validLocation_(l){return !!l&&l.status==='captured'&&typeof l.latitude==='number'&&isFinite(l.latitude)&&Math.abs(l.latitude)<=90&&typeof l.longitude==='number'&&isFinite(l.longitude)&&Math.abs(l.longitude)<=180&&typeof l.accuracy==='number'&&isFinite(l.accuracy)&&l.accuracy>=0;}
function accessEvent_(u,action,location,attendanceId){
 const book=spreadsheet_();if(!book.getSheetByName('accessEvents')){const sheet=book.insertSheet('accessEvents');sheet.appendRow(SCHEMA.accessEvents);sheet.setFrozenRows(1);}
 const l=location||{};const valid=validLocation_(l);
 const status=valid?'captured':['denied','blocked','timeout','unavailable','unsupported','insecure'].includes(l.status)?l.status:'unavailable';
 const event={id:attendanceId?attendanceId+':'+action:Utilities.getUuid(),employeeId:u.id,action,status,latitude:valid?l.latitude:'',longitude:valid?l.longitude:'',accuracy:valid?l.accuracy:'',created:new Date().toISOString()};append_('accessEvents',event);return event;
}
function setInitialPassword_(u,p){
 require_(['Admin','HR'].includes(u.role),'Permission denied.');const e=rows_('employees').find(e=>e.id===p.employeeId);require_(e,'Employee not found.');
 require_(u.role==='Admin'||!['Admin','HR'].includes(e.role),'Only Admin can manage privileged accounts.');require_(!rows_('credentials').some(c=>c.employeeId===e.id),'This account already has a password.');password_(p.password);
 append_('credentials',{id:Utilities.getUuid(),employeeId:e.id,email:e.email.toLowerCase(),passwordHash:hashPassword_(p.password),failedAttempts:0,lockedUntil:'',created:new Date().toISOString(),lastLogin:''});audit_(u.id,'setInitialPassword',e.id);
}


const resetRequestMessage_='If an eligible account matches this email, a reset link will be sent. Check your inbox and spam folder. You can try again after 60 seconds.';
function resetConfig_(){
 const props=PropertiesService.getScriptProperties(),appUrl=props.getProperty('APP_URL')||'',secret=props.getProperty('PASSWORD_RESET_SECRET')||'',mailerSecret=props.getProperty('MAILER_API_SECRET')||'';
 const match=/^(https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)\/?$/.exec(appUrl);
 require_(match&&/^[a-f0-9]{64}$/.test(secret)&&mailerSecret.length>=32,'Password recovery is not configured. Contact your administrator.');
 return {appUrl:match[1],secret,mailerSecret};
}
function sendRecoveryMail_(config,message){
 const response=UrlFetchApp.fetch(config.appUrl+'/api/password-recovery-mail',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+config.mailerSecret},payload:JSON.stringify(message),muteHttpExceptions:true});
 const status=response.getResponseCode();if(status===200)return;
 let detail='SMTP delivery failed with HTTP '+status;try{const result=JSON.parse(response.getContentText());if(result&&typeof result.error==='string'&&result.error)detail=result.error;}catch{}
 throw new Error(detail);
}
function resetBucket_(key,maximum,windowMs,now){
 const props=PropertiesService.getScriptProperties();let bucket;try{bucket=JSON.parse(props.getProperty(key)||'null');}catch{}
 if(!bucket||!Number.isFinite(bucket.start)||!Number.isFinite(bucket.count)||now-bucket.start>=windowMs)bucket={start:now,count:0,last:0};
 const allowed=bucket.count<maximum;bucket.count++;props.setProperty(key,JSON.stringify(bucket));return {allowed,bucket};
}
function newResetToken_(secret){
 // HMAC-SHA256 is a cryptographic PRF. The owner supplies a CSPRNG-generated 256-bit secret.
 // A lock-protected counter + UUID ensures unique inputs; secrecy never relies on UUID randomness.
 const props=PropertiesService.getScriptProperties(),counter=Number(props.getProperty('PASSWORD_RESET_COUNTER')||'0')+1;
 require_(Number.isSafeInteger(counter),'Password recovery needs administrator maintenance.');props.setProperty('PASSWORD_RESET_COUNTER',String(counter));
 return Utilities.computeHmacSha256Signature('TeamPulse password reset v1:'+counter+':'+Utilities.getUuid(),secret,Utilities.Charset.UTF_8).map(b=>(b&255).toString(16).padStart(2,'0')).join('');
}
function requestPasswordReset_(p){
 const started=Date.now();
 try{
  require_(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='email'),'Invalid reset request.');const email=email_(p.email),config=resetConfig_(),now=Date.now();
  try{
  const global=resetBucket_('RESET_REQUEST_GLOBAL',20,900000,now);if(!global.allowed)return {message:resetRequestMessage_};
  const key='RESET_EMAIL_'+digest_(email),account=resetBucket_(key,5,3600000,now),last=account.bucket.last||0;
  if(!account.allowed||last&&now-last<60000)return {message:resetRequestMessage_};
  account.bucket.last=now;PropertiesService.getScriptProperties().setProperty(key,JSON.stringify(account.bucket));
  ensureReportSheet_('passwordResets');
  const credentials=rows_('credentials'),matching=credentials.filter(c=>String(c.email).trim().toLowerCase()===email),credential=matching.length===1?matching[0]:null,employee=rows_('employees').find(e=>credential&&e.id===credential.employeeId&&e.status==='Active'&&String(e.email).trim().toLowerCase()===email);
  // Unknown, disabled and unprovisioned accounts take the same response path and cooldown.
  const token=newResetToken_(config.secret),tokenHash=digest_(token),createdAt=new Date(now).toISOString();
  if(!credential||!employee)return {message:resetRequestMessage_};
  for(const row of rows_('passwordResets').filter(r=>r.employeeId===employee.id&&!r.usedAt))updateRaw_('passwordResets',{...row,usedAt:createdAt});
  const record={id:Utilities.getUuid(),employeeId:employee.id,tokenHash,expires:new Date(now+900000).toISOString(),usedAt:'',createdAt,credentialHash:digest_(credential.passwordHash),emailHash:digest_(email)};
  appendRaw_('passwordResets',record);
  try{
   sendRecoveryMail_(config,{kind:'password-reset',to:email,token});
  }catch(error){updateRaw_('passwordResets',{...record,usedAt:new Date().toISOString()});console.error('Password reset email delivery failed:',error);}
  return {message:resetRequestMessage_};
  }catch{console.error('Password reset request temporarily unavailable.');return {message:resetRequestMessage_};}
 }finally{
  // Equal minimum response time for eligible, unknown and throttled requests; never log mail exceptions.
  const remaining=2500-(Date.now()-started);if(remaining>0)Utilities.sleep(remaining);
 }
}
function resetLinkError_(){const error=new Error('This reset link is invalid, expired or already used. Request a new link.');error.code='INVALID_RESET_LINK';return error;}
function resetPassword_(p){
 require_(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['token','newPassword','confirmPassword'].includes(k)),'Invalid reset request.');
 const now=Date.now(),limit=resetBucket_('RESET_SUBMIT_GLOBAL',50,900000,now);require_(limit.allowed,'Too many reset attempts. Please retry later.');
 if(typeof p.token!=='string'||! /^[a-f0-9]{64}$/.test(p.token))throw resetLinkError_();
 password_(p.newPassword);require_(p.newPassword===p.confirmPassword,'Passwords do not match.');ensureReportSheet_('passwordResets');
 const row=rows_('passwordResets').find(r=>r.tokenHash===digest_(p.token));
 if(!row||row.usedAt||!Number.isFinite(Date.parse(row.expires))||Date.parse(row.expires)<=now)throw resetLinkError_();
 const employee=rows_('employees').find(e=>e.id===row.employeeId&&e.status==='Active'),credential=rows_('credentials').find(c=>c.employeeId===row.employeeId);
 if(!employee||!credential||row.credentialHash!==digest_(credential.passwordHash)||row.emailHash!==digest_(String(credential.email).trim().toLowerCase())||row.emailHash!==digest_(String(employee.email).trim().toLowerCase()))throw resetLinkError_();
 const hash=hashPassword_(p.newPassword),usedAt=new Date(now).toISOString();
 // api() holds the script lock through validation, token consumption and credential writes.
 // Consume first, then revoke sessions, then save: partial storage failures fail closed.
 updateRaw_('passwordResets',{...row,usedAt});
 for(const previous of rows_('passwordResets').filter(r=>r.employeeId===employee.id&&!r.usedAt))updateRaw_('passwordResets',{...previous,usedAt});
 revokeSessions_(employee.id);
 updateRaw_('credentials',{...credential,passwordHash:hash,failedAttempts:0,lockedUntil:''});
 try{audit_(employee.id,'passwordReset',employee.id);}catch{console.error('Password reset audit unavailable.');}
 try{sendRecoveryMail_(resetConfig_(),{kind:'password-changed',to:credential.email});}catch(error){console.error('Password reset confirmation email failed:',error);}
 return {message:'Your password has been reset. Sign in with your new password.'};
}
// Owner-run additive migration only. Does not provision Admins or modify existing credentials.
function preparePasswordRecovery_(){
 const lock=LockService.getScriptLock();lock.waitLock(30000);requestBook_=null;
 try{resetConfig_();ensureReportSheet_('passwordResets');rows_('passwordResets');}finally{requestBook_=null;lock.releaseLock();}
}
