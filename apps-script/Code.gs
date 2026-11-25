/* TeamPulse password authentication and Sheets storage.
 * Run setup() with ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD before first deployment.
 * TeamPulse — owner-approved public web app; app sessions protect business records.
 * Set SPREADSHEET_ID and ADMIN_EMAIL in Project Settings > Script Properties. */
const TEAMPULSE_SPREADSHEET_ID = '1zsY6TWHvstFcN39kAGQziLwJG-jztdGwllS3SU-RxLs';
const SCHEMA = {
 passwordResets:['id','employeeId','tokenHash','expires','usedAt','createdAt','credentialHash','emailHash'],
 notificationEvents:['id','collection','recordId','record','recipients','created','delivered'],
 notifications:['id','eventId','recipientId','collection','recordId','message','created','readAt','dismissedAt','deliveredAt'],
 dailyReports:['id','employeeId','date','projectId','projectName','todayWork','doneToday','outputLinks','issues','pendingWork','status','remarks','created','updated','revision'],
 reportHistory:['id','reportId','revision','actor','snapshot','created'],
 reportComments:['id','reportId','actor','body','created'],
 settings:['id','value','updated','updatedBy'],
 employees:['id','name','email','role','department','designation','status','created','joiningDate','phone','photo','employeeCode','reportingManagerId'],
 projects:['id','name','department','owner','status','due','description','created'],
 tasks:['id','title','projectId','assignee','priority','status','due','created','description','attachments','managerId'],
 attendance:['id','employeeId','date','checkIn','checkOut','created','workMode'],
 worklogs:['id','employeeId','date','summary','hours','blockers','created'],
 leaves:['id','employeeId','type','start','end','reason','status','reviewer','created','duration','half','totalDays','approverId','rejectionReason','groupId','submittedBy'],
 messages:['id','senderId','recipientId','body','created','readAt'],
 announcements:['id','title','message','created'],
 audit:['id','actor','action','target','created'],
 credentials:['id','employeeId','email','passwordHash','failedAttempts','lockedUntil','created','lastLogin'],
 accessEvents:['id','employeeId','action','status','latitude','longitude','accuracy','created'],
 sessions:['id','employeeId','tokenHash','expires','revoked','created']
};
let requestBook_=null;
let requestRows_=null,notificationActor_=null;
function invalidateRows_(k){if(requestRows_)delete requestRows_[k];}
function rows_(k){if(!requestRows_)return rowsUncached_(k);if(!Object.prototype.hasOwnProperty.call(requestRows_,k))requestRows_[k]=rowsUncached_(k);return requestRows_[k].map(row=>({...row}));}
function spreadsheet_(){if(requestBook_)return requestBook_;const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')||TEAMPULSE_SPREADSHEET_ID;return requestBook_=SpreadsheetApp.openById(id)}
function setup(){
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{
 const props=PropertiesService.getScriptProperties();require_(props.getProperty('ADMIN_EMAIL'),'Set ADMIN_EMAIL in Script Properties before setup.');const email=email_(props.getProperty('ADMIN_EMAIL'));const book=spreadsheet_();
 if(!book.getSheetByName('credentials')||!rows_('credentials').some(c=>c.email===email))password_(props.getProperty('ADMIN_INITIAL_PASSWORD'));
 Object.keys(SCHEMA).forEach(k=>{let sheet=book.getSheetByName(k);if(!sheet){sheet=book.insertSheet(k);sheet.appendRow(SCHEMA[k]);sheet.setFrozenRows(1);}});
 const legacyPolicy=props.getProperty('LEAVE_POLICY');if(legacyPolicy&&!rows_('settings').some(row=>row.id==='leavePolicy')){JSON.parse(legacyPolicy);saveSheetSetting_('leavePolicy',legacyPolicy,'setup');}
 const employees=rows_('employees');const credentials=rows_('credentials');
 const matches=credentials.filter(c=>String(c.email).trim().toLowerCase()===email);
 require_(matches.length<=1,'Multiple Admin credentials found. Resolve duplicate rows before setup.');
 const credential=matches[0];
 const profiles=employees.filter(e=>String(e.email).trim().toLowerCase()===email);
 require_(profiles.length<=1,'Multiple Admin profiles found. Resolve duplicate rows before setup.');
 let admin=profiles[0];
 // Only owner-run setup repairs this link; login must never grant roles or recreate profiles.
 if(credential){
 require_(typeof credential.employeeId==='string'&&credential.employeeId.trim().length>0,'Admin credential has no employeeId. Restore it from backup.');
 const linked=employees.find(e=>e.id===credential.employeeId);
 require_(!linked||(admin&&linked.id===admin.id),'Admin credential points to another employee. Restore the correct link from backup.');
 require_(!credentials.some(c=>c!==credential&&c.employeeId===(admin?admin.id:credential.employeeId)),'Another credential uses the Admin profile. Resolve the conflict before setup.');
 }
 if(admin)require_(admin.role==='Admin'&&admin.status==='Active','ADMIN_EMAIL must belong to an active Admin.');
 if(!admin){admin={id:credential?credential.employeeId:Utilities.getUuid(),name:'Workspace Admin',email,role:'Admin',department:'Management',designation:'Administrator',status:'Active',created:new Date().toISOString()};append_('employees',admin);}
 if(credential){
 if(credential.employeeId!==admin.id||credential.email!==email){credential.employeeId=admin.id;credential.email=email;update_('credentials',credential);}
 }else{
 const password=props.getProperty('ADMIN_INITIAL_PASSWORD');password_(password);append_('credentials',{id:Utilities.getUuid(),employeeId:admin.id,email,passwordHash:hashPassword_(password),failedAttempts:0,lockedUntil:'',created:new Date().toISOString(),lastLogin:''});props.deleteProperty('ADMIN_INITIAL_PASSWORD');
 }
 }finally{lock.releaseLock();}
}
function doGet(){return HtmlService.createHtmlOutputFromFile('Index').setTitle('TeamPulse - Sawai Associates').setFaviconUrl('https://www.sawaiassociates.com/favicon-48.png')}
function rowsUncached_(k){const sheet=spreadsheet_().getSheetByName(k);if(!sheet)throw Error('Run setup() before opening TeamPulse.');if(k==='tasks')return readTasks_(sheet);if(k==='leaves')return readLeaves_(sheet);const data=sheet.getDataRange().getValues();if(k==='attendance'&&JSON.stringify(data[0])===JSON.stringify(SCHEMA.attendance.slice(0,-1))){sheet.getRange(1,SCHEMA.attendance.length,1,1).setValues([['workMode']]);data[0]=SCHEMA.attendance;}if(k==='employees'){const headers=data[0]||[];require_(JSON.stringify(headers.slice(0,8))===JSON.stringify(SCHEMA.employees.slice(0,8)),'Unexpected columns in employees');for(let i=8;i<SCHEMA.employees.length;i++){if(headers[i]===undefined||headers[i]===''){sheet.getRange(1,i+1,1,1).setValues([[SCHEMA.employees[i]]]);headers[i]=SCHEMA.employees[i];}}data[0]=headers;}if(JSON.stringify((data[0]||[]).slice(0,SCHEMA[k].length))!==JSON.stringify(SCHEMA[k]))throw Error('Unexpected columns in '+k);return data.slice(1).filter(r=>r[0]).map(r=>Object.fromEntries(SCHEMA[k].map((h,i)=>[h,sheetValue_(h,r[i])])))}
function cell_(v){return typeof v==='string'&&/^[=+\-@]/.test(v)?"'"+v:v}
function appendRaw_(k,r){invalidateRows_(k);if(k==='tasks')return writeTaskRow_(r,false);if(k==='leaves')return writeLeaveRow_(r,false);spreadsheet_().getSheetByName(k).appendRow(SCHEMA[k].map(h=>cell_(r[h]??'')))}
function updateRaw_(k,r){invalidateRows_(k);if(k==='tasks')return writeTaskRow_(r,true);if(k==='leaves')return writeLeaveRow_(r,true);const s=spreadsheet_().getSheetByName(k);const ids=s.getRange(1,1,s.getLastRow(),1).getValues();const i=ids.findIndex(row=>row[0]===r.id);if(i<1)throw Error('Record not found.');s.getRange(i+1,1,1,SCHEMA[k].length).setValues([SCHEMA[k].map(h=>cell_(r[h]??''))])}
function require_(condition,message){if(!condition)throw Error(message||'Permission denied.')}
function currentUser_(token){
 if(typeof token!=='string'||token.length<40||token.length>200)throw authError_();
 const session=rows_('sessions').find(x=>x.tokenHash===digest_(token)&&!x.revoked&&Date.parse(x.expires)>Date.now());
 if(!session)throw authError_();
 const u=rows_('employees').find(e=>e.id===session.employeeId&&e.status==='Active');if(!u)throw authError_();return u;
}

// Public team summary: never exposes sessions, contact details, locations or raw punches.
function teamPresence_(employees,attendance){
 const now=Date.now(),day=Utilities.formatDate(new Date(now),'Asia/Kolkata','yyyy-MM-dd');

 return employees.filter(e=>e.status!=='Deleted').map(e=>{
  const working=e.status==='Active'&&attendance.some(a=>String(a.employeeId)===String(e.id)&&a.date===day&&Number.isFinite(Date.parse(a.checkIn))&&Date.parse(a.checkIn)<=now&&!a.checkOut);
  return {id:e.id,name:e.name,photo:e.photo||'',role:e.role,department:e.department,designation:e.designation,status:e.status,working,workedMinutes:shiftMinutes(attendance,e.id,day,now),day};
 });
}

function teamDepartmentKey_(value){const aliases={"ai ml developer":"ai ml developer","ai ml":"ai ml developer","al ml":"ai ml developer","al ml developer":"ai ml developer","ai ml engineer":"ai ml developer","ai developer":"ai ml developer","ml developer":"ai ml developer","machine learning":"ai ml developer","machine learning engineer":"ai ml developer","artificial intelligence":"ai ml developer","artificial intelligence and machine learning":"ai ml developer","software developer":"software developer","software development":"software developer","software engineer":"software developer","software engineering":"software developer","software":"software developer","hr":"hr","human resources":"hr","human resource":"hr","human resource management":"hr","hr department":"hr","hr executive":"hr","hr manager":"hr","hr recruiter":"hr","recruiter":"hr","web development":"web development","web developer":"web development","frontend developer":"web development","front end developer":"web development","backend developer":"web development","back end developer":"web development","full stack developer":"web development","fullstack developer":"web development","mobile app development":"mobile app development","mobile developer":"mobile app development","mobile app developer":"mobile app development","android developer":"mobile app development","ios developer":"mobile app development","flutter developer":"mobile app development","react native developer":"mobile app development","data science":"data science","data scientist":"data science","data analyst":"data science","data analytics":"data science","data engineer":"data science","quality assurance testing":"quality assurance testing","qa":"quality assurance testing","quality assurance":"quality assurance testing","testing":"quality assurance testing","qa engineer":"quality assurance testing","software tester":"quality assurance testing","test engineer":"quality assurance testing","qa tester":"quality assurance testing","devops cloud":"devops cloud","devops":"devops cloud","cloud":"devops cloud","devops engineer":"devops cloud","cloud engineer":"devops cloud","cloud computing":"devops cloud","ui ux design":"ui ux design","ui ux":"ui ux design","ui ux designer":"ui ux design","ui designer":"ui ux design","ux designer":"ui ux design","ui ux developer":"ui ux design","product designer":"ui ux design","it support":"it support","technical support":"it support","it support engineer":"it support","technical support engineer":"it support","help desk":"it support","sales and marketing":"sales and marketing","sales":"sales and marketing","marketing":"sales and marketing","digital marketing":"sales and marketing","sales executive":"sales and marketing","marketing executive":"sales and marketing","business development":"sales and marketing","finance and accounts":"finance and accounts","finance":"finance and accounts","accounts":"finance and accounts","accounting":"finance and accounts","accountant":"finance and accounts","finance and accounting":"finance and accounts","operations":"operations","operation":"operations","operations executive":"operations","operations manager":"operations","management":"management","manager":"management","administrator":"management","administration":"management","others":"others","other":"others","other department":"others"};const key=String(value||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();return aliases[key]||key;}
function directoryPeople_(employees,u){if(['Admin','HR'].includes(u.role))return employees;const department=teamDepartmentKey_(u.department);return employees.filter(e=>String(e.id)===String(u.id)||department&&teamDepartmentKey_(e.department)===department);}
function employeeDirectory_(employees){return employees.filter(e=>e.status!=='Deleted').map(e=>({id:e.id,name:e.name,photo:e.photo||'',role:e.role,department:e.department,designation:e.designation,status:e.status}));}
function state_(u){requestRows_={};const db={};Object.keys(SCHEMA).filter(k=>!['audit','credentials','sessions','accessEvents','messages','settings','dailyReports','reportHistory','reportComments','notificationEvents','notifications','passwordResets'].includes(k)).forEach(k=>db[k]=rows_(k));const directoryPeople=directoryPeople_(db.employees,u);db.employeeDirectory=employeeDirectory_(directoryPeople);db.workReportReminder=workReportReminder_(u);db.leavePolicy=leavePolicy_();db.leaveRequestMembers=['Team Leader','Admin'].includes(u.role)?groupLeaveMembers_(u).map(e=>({id:e.id,name:e.name})):[];db.teamPresence=teamPresence_(directoryPeople,db.attendance);const creators=new Map(rows_('audit').filter(event=>event.action==='create').map(event=>[event.target,event.actor]));db.announcements=db.announcements.map(announcement=>{const creatorId=creators.get(announcement.id);const creator=db.employees.find(employee=>employee.id===creatorId);return {...announcement,createdBy:creatorId||'',createdByName:creator?creator.name:''};});const admin=['Admin','HR'].includes(u.role);db.taskAssignees=admin||u.role==='Team Leader'?db.employees.filter(employee=>employee.status==='Active').map(employee=>({id:employee.id,name:employee.name})):[];if(!admin){if(u.role==='Team Leader'){db.projects=db.projects.filter(p=>p.owner===u.id);db.tasks=db.tasks.filter(t=>db.projects.some(p=>p.id===t.projectId)||!t.projectId&&(t.managerId===u.id||t.assignee===u.id));const people=new Set([u.id,...db.tasks.map(t=>t.assignee)]);db.employees=db.employees.filter(e=>people.has(e.id));db.attendance=db.attendance.filter(a=>people.has(a.employeeId));db.worklogs=db.worklogs.filter(w=>people.has(w.employeeId))}else{db.tasks=db.tasks.filter(t=>t.assignee===u.id);db.projects=db.projects.filter(p=>db.tasks.some(t=>t.projectId===p.id));db.employees=db.employees.filter(e=>e.id===u.id);db.attendance=db.attendance.filter(a=>a.employeeId===u.id);db.worklogs=db.worklogs.filter(w=>w.employeeId===u.id)}db.leaves=db.leaves.filter(l=>l.employeeId===u.id||l.approverId===u.id||l.submittedBy===u.id)}return db}
function validate_(k,r,u,excludeId){const required={employees:['name','email','role','department','designation'],projects:['name','department','owner','due','status','description'],tasks:['title','description','assignee','priority','status'],worklogs:['date','summary','hours'],leaves:['type','start','end','reason'],announcements:['title','message']};if(k==='tasks'){r.projectId=r.projectId||'';r.due=r.due||'';r.status=r.status==='Done'?'Completed':r.status||'To do';r.attachments=r.attachments||'[]';}required[k].forEach(f=>require_(String(r[f]??'').trim(),'Missing '+f));Object.entries(r).forEach(([key,value])=>require_(typeof value==='string'&&value.length<=(k==='tasks'&&key==='attachments'?22000:k==='tasks'&&key==='description'?4000:1000),'Invalid field value.'));['date','due','start','end','joiningDate'].filter(f=>r[f]).forEach(f=>require_(/^\d{4}-\d{2}-\d{2}$/.test(r[f])&&!isNaN(Date.parse(r[f]))&&new Date(r[f]).toISOString().slice(0,10)===r[f],'Invalid date.'));if(k==='employees'){require_(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email),'Invalid email.');r.email=r.email.toLowerCase();require_(['Admin','HR','Team Leader','Employee'].includes(r.role),'Invalid role.');require_(!rows_('employees').some(e=>e.email.toLowerCase()===r.email),'Email already exists.');require_(u.role==='Admin'||!['Admin','HR'].includes(r.role),'Only Admin can create privileged accounts.');r.status='Active'}if(k==='projects'){require_(rows_('employees').some(e=>e.id===r.owner&&['Admin','Team Leader'].includes(e.role)),'Invalid project owner.');require_(['Planning','In progress','Completed'].includes(r.status),'Invalid project status.');require_(u.role!=='Team Leader'||r.owner===u.id,'You can only create your own projects.')}if(k==='tasks'){if(r.projectId){const project=rows_('projects').find(project=>project.id===r.projectId);require_(project,'Project not found.');require_(['Admin','HR'].includes(u.role)||project.owner===u.id,'You can only use your own projects.');}require_(rows_('employees').some(employee=>employee.id===r.assignee&&employee.status==='Active'),'Invalid assignee.');require_(['Low','Medium','High','Urgent'].includes(r.priority)&&['To do','In progress','Blocked','In review','Completed'].includes(r.status),'Invalid task values.');r.attachments=validateTaskLinks_(r.attachments);}if(k==='worklogs'){require_(Number(r.hours)>0&&Number(r.hours)<=24,'Hours must be between 0 and 24.');require_(r.date<=Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd'),'Work logs cannot be in the future.');r.employeeId=u.id}if(k==='leaves')validateLeave_(r,u,excludeId);}
function api(req){requestBook_=null;requestRows_={};notificationActor_=null;const lock=LockService.getScriptLock();try{require_(req&&typeof req.action==='string','Invalid request.');if(!['bootstrap','accessHistory','attendanceSnapshot'].includes(req.action))lock.waitLock(30000);const p=req.payload||{};
 if(req.action==='checkAccount'){limitAuth_('checkAccount');email_(p.email);return {ok:true,data:{continue:true}};}
 if(req.action==='requestPasswordReset')return {ok:true,data:requestPasswordReset_(p)};
 if(req.action==='resetPassword')return {ok:true,data:resetPassword_(p)};
 if(['register','login'].includes(req.action))return {ok:true,data:authentication_(req.action,p)};
 const u=currentUser_(req.token);notificationActor_=u.id;
 if(['notificationSnapshot','notificationRead','notificationDismiss','notificationOpen'].includes(req.action))return {ok:true,data:notificationsAction_(u,req.action,p)};
 if(['reportSnapshot','saveDailyReport','commentDailyReport','dailyReportHistory','rebuildReportSheet'].includes(req.action))return {ok:true,data:dailyReportsAction_(u,req.action,p)};
 if(req.action==='logout'){rows_('sessions').filter(x=>x.tokenHash===digest_(req.token)).forEach(x=>{x.revoked=new Date().toISOString();update_('sessions',x);});audit_(u.id,'logout',u.id);return {ok:true,data:{}};}
 if(req.action==='setInitialPassword'){setInitialPassword_(u,p);return {ok:true,data:{}};}
 if(['messageSnapshot','sendMessage'].includes(req.action))return {ok:true,data:messagesAction_(u,req.action,p)};
 if(req.action==='attendanceSnapshot')return {ok:true,data:attendanceSnapshot_(u)};
 if(req.action==='accessHistory'){return {ok:true,data:{events:(spreadsheet_().getSheetByName('accessEvents')?rows_('accessEvents'):[]).filter(e=>['punchIn','punchOut'].includes(e.action)&&(['Admin','HR'].includes(u.role)||e.employeeId===u.id)).slice(-200).reverse()}};}
 if(req.action==='updateProfile'){
 require_(Object.keys(p).every(k=>['name','phone','photo'].includes(k)),'Only personal details can be edited here.');
 require_(typeof p.name==='string'&&p.name.trim().length>0&&p.name.trim().length<=100,'Enter a name between 1 and 100 characters.');
 const profile=rows_('employees').find(e=>e.id===u.id);require_(profile,'Account not found.');
 if(p.phone!==undefined){require_(typeof p.phone==='string'&&(!p.phone||/^[+0-9 ()-]{7,25}$/.test(p.phone)),'Enter a valid phone number.');profile.phone=p.phone;}
 if(p.photo!==undefined){require_(typeof p.photo==='string'&&p.photo.length<=45000&&(!p.photo||/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.photo)),'Choose a valid profile photo.');profile.photo=p.photo;}
 profile.name=p.name.trim();update_('employees',profile);audit_(u.id,'updateProfile',u.id);return {ok:true,data:{user:publicUser_(profile),db:state_(profile)}};
 }
 if(req.action==='updateWorkDetails'){
 require_(['Admin','HR'].includes(u.role),'Only Admin and HR can update work details.');const employee=rows_('employees').find(e=>e.id===p.id&&e.status!=='Deleted');require_(employee,'Employee not found.');require_(u.role==='Admin'||employee.id===u.id||!['Admin','HR'].includes(employee.role),'Only Admin can update another privileged account.');
 require_(p.record&&Object.keys(p.record).every(k=>['employeeCode','email','designation','department','reportingManagerId','joiningDate'].includes(k)),'Invalid work details.');
 const record=p.record;for(const key of ['employeeCode','email','designation','department','reportingManagerId','joiningDate'])require_(typeof record[key]==='string'&&record[key].length<=254,'Invalid '+key+'.');
 record.email=email_(record.email);require_(!rows_('employees').some(e=>e.id!==employee.id&&e.email.toLowerCase()===record.email),'Email already exists.');require_(!record.employeeCode||!rows_('employees').some(e=>e.id!==employee.id&&e.employeeCode===record.employeeCode),'Employee ID already exists.');
 require_(!record.joiningDate||/^\d{4}-\d{2}-\d{2}$/.test(record.joiningDate)&&!isNaN(Date.parse(record.joiningDate))&&new Date(record.joiningDate).toISOString().slice(0,10)===record.joiningDate,'Enter a valid joining date.');
 require_(!record.reportingManagerId||rows_('employees').some(e=>e.id===record.reportingManagerId&&e.id!==employee.id&&e.status==='Active'),'Choose an active reporting manager.');require_(record.designation.trim()&&record.department.trim(),'Designation and department are required.');
 const credentials=rows_('credentials');require_(!credentials.some(c=>c.employeeId!==employee.id&&c.email===record.email),'Email already has credentials.');credentials.filter(c=>c.employeeId===employee.id).forEach(c=>update_('credentials',{...c,email:record.email}));update_('employees',{...employee,...record});audit_(u.id,'updateWorkDetails',employee.id);const fresh=rows_('employees').find(e=>e.id===u.id);return {ok:true,data:{user:publicUser_(fresh),db:state_(fresh)}};
 }
 if(req.action==='changePassword'){changePassword_(u,p);return {ok:true,data:{}};}
 if(req.action==='employeeDeletionPreview')return {ok:true,data:employeeDeletionPreview_(u,p)};
 if(req.action==='deleteEmployeeAccount')return {ok:true,data:deleteEmployeeAccount_(u,p)};
 if(req.action==='createGroupLeave')return {ok:true,data:createGroupLeave_(u,p)};
 if(req.action==='saveLeavePolicy')return {ok:true,data:saveLeavePolicy_(u,p)};
 if(req.action==='assignDepartments')return {ok:true,data:assignDepartments_(u,p)};
 if(['updateRecord','deleteRecord','createAttendance'].includes(req.action))return {ok:true,data:mutateRecord_(u,req.action,p)};
 const admin=['Admin','HR'].includes(u.role);const lead=admin||u.role==='Team Leader';if(req.action==='bootstrap')return {ok:true,data:{db:state_(u),user:u,attendanceLocationVersion:1}};let target='';if(req.action==='employeeAccess'){
 require_(admin);const e=rows_('employees').find(x=>x.id===p.id);require_(e&&e.status!=='Deleted','Employee not found.');require_(e.id!==u.id,'Ask another administrator to change your own role or access.');
 require_(['Active','Pending','Inactive'].includes(p.status)&&['Admin','HR','Team Leader','Employee'].includes(p.role),'Invalid access settings.');
 require_(u.role==='Admin'||(!['Admin','HR'].includes(e.role)&&!['Admin','HR'].includes(p.role)),'Only Admin can change privileged access.');
 require_(e.role!=='Admin'||(p.role==='Admin'&&p.status==='Active')||rows_('employees').some(x=>x.id!==e.id&&x.role==='Admin'&&x.status==='Active'),'Keep at least one active Admin.');
 e.role=p.role;e.status=p.status;update_('employees',e);if(e.status!=='Active')revokeSessions_(e.id);target=e.id;
 }else if(req.action==='deleteEmployee'){require_(admin,'Only Admin and HR can delete employees.');const employee=rows_('employees').find(e=>e.id===p.id&&e.status!=='Deleted');require_(employee,'Employee not found.');require_(employee.id!==u.id,'You cannot delete your own account.');require_(u.role==='Admin'||!['Admin','HR'].includes(employee.role),'Only Admin can delete privileged accounts.');require_(employee.role!=='Admin'||rows_('employees').some(e=>e.id!==employee.id&&e.role==='Admin'&&e.status==='Active'),'Keep at least one active Admin.');revokeSessions_(employee.id);employee.status='Deleted';update_('employees',employee);target=employee.id}else if(req.action==='deleteProject'){require_(admin,'Only Admin and HR can delete projects.');require_(typeof p.id==='string'&&p.id.length>0,'Project ID is required.');require_(rows_('projects').some(project=>project.id===p.id),'Project not found.');const linked=new Set(rows_('tasks').filter(task=>task.projectId===p.id).map(task=>task.id));const taskSheet=spreadsheet_().getSheetByName('tasks');const taskIds=taskSheet.getRange(1,1,taskSheet.getLastRow(),1).getValues();for(let index=taskIds.length-1;index>0;index--)if(linked.has(taskIds[index][0]))taskSheet.deleteRow(index+1);const sheet=spreadsheet_().getSheetByName('projects');const ids=sheet.getRange(1,1,sheet.getLastRow(),1).getValues();const index=ids.findIndex(row=>row[0]===p.id);require_(index>0,'Project not found.');sheet.deleteRow(index+1);target=p.id}else if(req.action==='deleteAnnouncement'){require_(admin,'Only Admin and HR can delete announcements.');require_(typeof p.id==='string'&&p.id.length>0,'Announcement ID is required.');require_(rows_('announcements').some(a=>a.id===p.id),'Announcement not found.');const sheet=spreadsheet_().getSheetByName('announcements');const ids=sheet.getRange(1,1,sheet.getLastRow(),1).getValues();const index=ids.findIndex(row=>row[0]===p.id);require_(index>0,'Announcement not found.');sheet.deleteRow(index+1);target=p.id}else if(req.action==='create'){const k=p.collection;require_(['employees','projects','tasks','worklogs','leaves','announcements'].includes(k),'Unknown collection.');require_(['employees','announcements'].includes(k)?admin:['projects','tasks'].includes(k)?lead:true);require_(p.record&&typeof p.record==='object','Invalid record.');const r={};SCHEMA[k].filter(f=>!['id','created','employeeId','reviewer','managerId','totalDays','approverId','rejectionReason','groupId','submittedBy'].includes(f)).forEach(f=>{if(p.record[f]!==undefined)r[f]=p.record[f]});validate_(k,r,u);r.id=Utilities.getUuid();r.created=new Date().toISOString();if(k==='tasks')r.managerId=u.id;append_(k,r);if(k==='leaves')notifyLeaveAdmins_(u,r);target=r.id}else if(req.action==='taskStatus'){const t=rows_('tasks').find(t=>t.id===p.id);require_(t,'Task not found.');require_(t.assignee===u.id||canManageTask_(u,t));const status=p.status==='Done'?'Completed':p.status;require_(['To do','In progress','Blocked','In review','Completed'].includes(status),'Invalid status.');t.status=status;update_('tasks',t);target=t.id}else if(['editLeave','deleteLeave'].includes(req.action)){
 const leave=rows_('leaves').find(row=>row.id===p.id);require_(leave,'Leave request not found.');require_(leave.employeeId===u.id,'You can only change your own leave requests.');require_(leave.status==='Pending','Only pending leave requests can be edited or deleted.');
 if(req.action==='editLeave'){require_(p.record&&typeof p.record==='object','Invalid leave details.');require_(Object.keys(p.record).every(key=>['type','start','end','reason','duration','half'].includes(key)),'Only leave details can be edited.');const record={type:p.record.type,start:p.record.start,end:p.record.end,reason:p.record.reason,duration:p.record.duration||'Full day',half:p.record.half||''};validate_('leaves',record,u,leave.id);update_('leaves',{...leave,...record});}
 else{const sheet=spreadsheet_().getSheetByName('leaves');const ids=sheet.getRange(1,1,sheet.getLastRow(),1).getValues();const index=ids.findIndex(row=>row[0]===leave.id);require_(index>0,'Leave request not found.');sheet.deleteRow(index+1);}
 target=leave.id;
 }else if(req.action==='leaveDecision'){
 const l=rows_('leaves').find(l=>l.id===p.id);require_(l&&l.status==='Pending','Leave is missing or already reviewed.');require_(l.employeeId!==u.id&&l.submittedBy!==u.id,'You cannot review your own leave or a group request you submitted.');require_(admin||l.approverId===u.id,'Only Admin, HR or the designated approver can review this request.');require_(['Approved','Rejected'].includes(p.status),'Invalid decision.');
 require_(p.status!=='Rejected'||typeof p.rejectionReason==='string','A rejection reason is required.');const rejectionReason=p.status==='Rejected'?p.rejectionReason.trim():'';require_(p.status!=='Rejected'||rejectionReason.length>0&&rejectionReason.length<=1000,'A rejection reason between 1 and 1000 characters is required.');l.status=p.status;l.reviewer=u.id;l.rejectionReason=rejectionReason;update_('leaves',l);target=l.id}else if(req.action==='attendance'){if(p.requireLocation===true)require_(validLocation_(p.location),'A valid current location is required. Allow location and try again.');const closedAttendanceIds=[];const date=Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd');const matches=rows_('attendance').filter(a=>String(a.employeeId)===String(u.id)&&a.date===date);let a=(p.kind==='out'&&p.attendanceId?matches.find(a=>String(a.id)===String(p.attendanceId)):null)||matches.find(a=>a.checkIn&&!a.checkOut)||matches[0];require_(['in','out'].includes(p.kind),'Invalid attendance action.');if(p.kind==='in'){require_(p.workMode===undefined||['Work from home','Work from office'].includes(p.workMode),'Choose a valid work mode.');require_(!matches.some(row=>row.checkIn&&!row.checkOut),'Punch out your open attendance before punching in again.');a={id:Utilities.getUuid(),employeeId:u.id,date,workMode:p.workMode||'',checkIn:new Date().toISOString(),checkOut:'',created:new Date().toISOString()};append_('attendance',a)}else{require_(a&&a.checkIn&&!a.checkOut,'No open punch-in for your account today. Attendance shown for other employees cannot be punched out by you.');a.checkOut=new Date().toISOString();update_('attendance',a);closedAttendanceIds.push(a.id);matches.filter(other=>other.id!==a.id&&other.checkIn&&!other.checkOut).forEach(other=>{other.checkOut=a.checkOut;update_('attendance',other);closedAttendanceIds.push(other.id);})}const event=accessEvent_(u,p.kind==='in'?'punchIn':'punchOut',p.location,a.id);target=a.id;if(p.compact===true){audit_(u.id,'attendance',a.id);return {ok:true,data:{attendance:a,event,closedAttendanceIds}};}}else throw Error('Unknown action.');append_('audit',{id:Utilities.getUuid(),actor:u.id,action:req.action,target,created:new Date().toISOString()});return {ok:true,data:{db:state_(u)}}}catch(e){console.error('TeamPulse API request failed.');return {ok:false,code:e.code,error:e.message||'Unable to complete request.'}}finally{requestBook_=null;requestRows_=null;notificationActor_=null;if(lock.hasLock())lock.releaseLock()}}


function doPost(e){let r;try{const text=e&&e.postData&&e.postData.contents;require_(typeof text==='string'&&text.length<=65536,'Invalid request.');r=api(JSON.parse(text));}catch{r={ok:false,error:'Invalid request.'};}return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);}

// Sheets auto-converts yyyy-MM-dd text into Date cells. Keep calendar dates separate from timestamps.
function sheetValue_(field,value){
 if(['date','due','start','end','joiningDate'].includes(field)&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&!isNaN(Date.parse(value)))return Utilities.formatDate(new Date(value),'Asia/Kolkata','yyyy-MM-dd');
 if(Object.prototype.toString.call(value)==='[object Date]'){
 if(['date','due','start','end','joiningDate'].includes(field)){const book=spreadsheet_();const zone=book.getSpreadsheetTimeZone?book.getSpreadsheetTimeZone():'Asia/Kolkata';return Utilities.formatDate(value,zone,'yyyy-MM-dd');}
 return value.toISOString();
 }
 return value;
}

function attendanceSnapshot_(u){
 const admin=['Admin','HR'].includes(u.role);const people=new Set([String(u.id)]);
 if(u.role==='Team Leader'){const projects=rows_('projects').filter(p=>p.owner===u.id);rows_('tasks').filter(t=>projects.some(p=>p.id===t.projectId)||!t.projectId&&t.managerId===u.id).forEach(t=>people.add(String(t.assignee)));}
 const allAttendance=rows_('attendance');const attendance=allAttendance.filter(a=>admin||people.has(String(a.employeeId)));
 const events=(spreadsheet_().getSheetByName('accessEvents')?rows_('accessEvents'):[]).filter(e=>['punchIn','punchOut'].includes(e.action)&&(admin||String(e.employeeId)===String(u.id))).reverse();
 const employees=directoryPeople_(rows_('employees'),u);return {attendance,events,employeeDirectory:employeeDirectory_(employees),teamPresence:teamPresence_(employees,allAttendance),syncedAt:new Date().toISOString()};
}
// Module edits are validated and written under api()'s script lock.
function deleteRowById_(collection,id){
 const sheet=spreadsheet_().getSheetByName(collection);const ids=sheet.getRange(1,1,sheet.getLastRow(),1).getValues();const index=ids.findIndex(row=>row[0]===id);require_(index>0,'Record not found.');sheet.deleteRow(index+1);invalidateRows_(collection);
}
function validateAttendanceCorrection_(record,id){
 require_(typeof record.employeeId==='string'&&rows_('employees').some(e=>e.id===record.employeeId&&e.status!=='Deleted'),'Employee not found.');
 require_(typeof record.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(record.date)&&!isNaN(Date.parse(record.date))&&new Date(record.date).toISOString().slice(0,10)===record.date,'Invalid attendance date.');
 for(const key of ['checkIn','checkOut'])require_(typeof record[key]==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(record[key])&&!isNaN(Date.parse(record[key])),'Enter valid punch in and punch out times.');
 const start=Date.parse(record.checkIn),end=Date.parse(record.checkOut);require_(end>start,'Punch out must be after punch in.');require_(start<=Date.now()&&end<=Date.now(),'Attendance times cannot be in the future.');
 require_(Utilities.formatDate(new Date(start),'Asia/Kolkata','yyyy-MM-dd')===record.date,'Attendance date must match the punch in date in IST.');
 require_(!rows_('attendance').some(row=>row.id!==id&&row.employeeId===record.employeeId&&Date.parse(row.checkIn)<end&&(!row.checkOut||Date.parse(row.checkOut)>start)),'Attendance overlaps an existing session.');
 record.checkIn=new Date(start).toISOString();record.checkOut=new Date(end).toISOString();
}
function mutateRecord_(u,action,p){
 const admin=['Admin','HR'].includes(u.role);const collection=action==='createAttendance'?'attendance':p.collection;
 const allowed={employees:['name','email','department','designation'],projects:['name','description','department','owner','due','status'],tasks:['title','description','projectId','assignee','priority','due','status','attachments'],worklogs:['date','summary','hours','blockers'],announcements:['title','message'],attendance:['employeeId','date','checkIn','checkOut']};
 require_(Object.prototype.hasOwnProperty.call(allowed,collection),'This module does not support this action.');
 const existing=action==='createAttendance'?null:rows_(collection).find(row=>row.id===p.id);require_(action==='createAttendance'||existing,'Record not found.');
 if(collection==='employees')require_(admin&&existing.status!=='Deleted'&&(u.role==='Admin'||existing.id===u.id||!['Admin','HR'].includes(existing.role)),'You cannot edit this employee.');
 if(collection==='projects')require_(admin||(u.role==='Team Leader'&&existing.owner===u.id),'You cannot edit this project.');
 if(collection==='tasks')require_(canManageTask_(u,existing),'Only the project owner, Admin or HR can manage task details.');
 if(collection==='worklogs')require_(admin||existing.employeeId===u.id,'You can only manage your own work logs.');
 if(collection==='announcements'||collection==='attendance')require_(admin,'Only Admin and HR can manage these records.');
 let target=existing&&existing.id;
 if(action==='deleteRecord'){
  require_(['tasks','worklogs','attendance'].includes(collection),'Use the module-specific delete action.');deleteRowById_(collection,existing.id);
 }else{
  require_(p.record&&typeof p.record==='object'&&!Array.isArray(p.record),'Invalid record.');require_(Object.keys(p.record).every(key=>allowed[collection].includes(key)),'Only editable fields can be changed.');
  const record={};for(const key of allowed[collection])record[key]=p.record[key]===undefined?(existing?existing[key]:''):p.record[key];
  if(collection==='worklogs'&&typeof record.hours==='number')record.hours=String(record.hours);Object.entries(record).forEach(([key,value])=>require_(typeof value==='string'&&value.length<=(collection==='tasks'&&key==='attachments'?22000:collection==='tasks'&&key==='description'?4000:1000),'Invalid field value.'));
  if(collection==='employees'){
   require_(u.role==='Admin'||!['email','department','designation'].some(key=>record[key]!==existing[key]),'Only Admin can update work details.');
   for(const key of allowed.employees){record[key]=record[key].trim();require_(record[key].length>=2&&record[key].length<=150,'Enter a valid '+key+'.');}
   record.email=email_(record.email);require_(!rows_('employees').some(employee=>employee.id!==existing.id&&employee.email.toLowerCase()===record.email),'Email already exists.');
   const credentials=rows_('credentials');require_(!credentials.some(credential=>credential.employeeId!==existing.id&&credential.email===record.email),'Email already has credentials.');
   credentials.filter(credential=>credential.employeeId===existing.id).forEach(credential=>{if(credential.email!==record.email){credential.email=record.email;update_('credentials',credential);}});
  }else if(collection==='attendance')validateAttendanceCorrection_(record,existing&&existing.id);
  else validate_(collection,record,collection==='worklogs'?{...u,id:existing.employeeId}:u,existing.id);
  if(action==='createAttendance'){
   target=Utilities.getUuid();append_('attendance',{...record,id:target,created:new Date().toISOString()});
  }else update_(collection,{...existing,...record,...(collection==='tasks'?{managerId:!record.projectId&&(existing.projectId||!existing.managerId)?u.id:existing.managerId}:{})});
 }
 audit_(u.id,action+':'+collection,target);
 const fresh=rows_('employees').find(employee=>employee.id===u.id);return {db:state_(fresh),user:publicUser_(fresh)};
}
function departmentOptions_(){return ['AI/ML Developer','Software Developer','HR','Web Development','Mobile App Development','Data Science','Quality Assurance / Testing','DevOps / Cloud','UI/UX Design','IT Support','Sales & Marketing','Finance & Accounts','Operations','Management','Others'];}
function assignDepartments_(u,p){
 require_(['Admin','HR'].includes(u.role),'Only Admin and HR can assign departments.');
 require_(Array.isArray(p.assignments)&&p.assignments.length>0&&p.assignments.length<=100,'Select between 1 and 100 department assignments.');
 const options=departmentOptions_(),seen=new Set(),tables={employees:rows_('employees'),projects:rows_('projects')};
 const changes=p.assignments.map(assignment=>{
  require_(assignment&&typeof assignment==='object'&&!Array.isArray(assignment)&&Object.keys(assignment).every(key=>['collection','id','previousDepartment','department'].includes(key)),'Invalid department assignment.');
  require_(['employees','projects'].includes(assignment.collection)&&typeof assignment.id==='string'&&typeof assignment.previousDepartment==='string','Invalid department record.');
  require_(options.includes(assignment.department),'Choose a department from the dropdown.');
  const key=assignment.collection+':'+assignment.id;require_(!seen.has(key),'A record can only be assigned once per batch.');seen.add(key);
  const row=tables[assignment.collection].find(record=>record.id===assignment.id);require_(row,'Department record not found. Refresh and try again.');
  if(assignment.collection==='employees')require_(['Admin','HR'].includes(u.role)&&row.status!=='Deleted'&&(u.role==='Admin'||row.id===u.id||!['Admin','HR'].includes(row.role)),'You cannot assign this employee’s department.');
  require_(String(row.department||'')===assignment.previousDepartment,'A department changed since it was reviewed. Refresh and compare the latest values.');
  return {collection:assignment.collection,row,department:assignment.department};
 }).filter(change=>change.row.department!==change.department);
 for(const change of changes){update_(change.collection,{...change.row,department:change.department});audit_(u.id,'assignDepartment:'+change.collection,change.row.id);}
 const fresh=rows_('employees').find(employee=>employee.id===u.id);return {updated:changes.length,db:state_(fresh),user:publicUser_(fresh)};
}
// Task extension columns are appended without moving legacy columns or unrelated Sheet data.
function taskLayout_(sheet,write){
 const base=SCHEMA.tasks.slice(0,8);let headers=sheet.getDataRange().getValues()[0]||[];
 require_(JSON.stringify(headers.slice(0,8))===JSON.stringify(base),'Unexpected columns in tasks');
 for(const name of SCHEMA.tasks.slice(8)){
  require_(headers.filter(header=>header===name).length<=1,'Duplicate task column '+name);
  if(write&&!headers.includes(name)){const column=headers.length+1;if(sheet.getMaxColumns&&column>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),column-sheet.getMaxColumns());sheet.getRange(1,column,1,1).setValues([[name]]);headers=[...headers,name];}
 }
 return headers;
}
function readTasks_(sheet){const data=sheet.getDataRange().getValues(),headers=taskLayout_(sheet,false);return data.slice(1).filter(row=>row[0]).map(row=>{const task=Object.fromEntries(SCHEMA.tasks.map(name=>[name,headers.includes(name)?sheetValue_(name,row[headers.indexOf(name)]??''):'']));if(task.status==='Done')task.status='Completed';return task;});}
function writeTaskRow_(record,existing){
 const sheet=spreadsheet_().getSheetByName('tasks'),headers=taskLayout_(sheet,true);
 if(!existing){sheet.appendRow(headers.map(name=>SCHEMA.tasks.includes(name)?cell_(record[name]??''):''));return;}
 const ids=sheet.getRange(1,1,sheet.getLastRow(),1).getValues();const index=ids.findIndex(row=>row[0]===record.id);require_(index>0,'Record not found.');
 sheet.getRange(index+1,1,1,8).setValues([SCHEMA.tasks.slice(0,8).map(name=>cell_(record[name]??''))]);
 for(const name of SCHEMA.tasks.slice(8))sheet.getRange(index+1,headers.indexOf(name)+1,1,1).setValues([[cell_(record[name]??'')]]);
}
function canManageTask_(u,task){return ['Admin','HR'].includes(u.role)||(u.role==='Team Leader'&&(task.projectId?rows_('projects').some(project=>project.id===task.projectId&&project.owner===u.id):task.managerId===u.id));}
function validateTaskLinks_(value){
 let items;try{items=JSON.parse(value||'[]');}catch{throw Error('Invalid attachment links.');}
 require_(Array.isArray(items)&&items.length<=10,'Add up to 10 links per task.');
 for(const item of items)require_(item&&item.type==='link'&&Object.keys(item).every(key=>['type','url','name'].includes(key))&&typeof item.url==='string'&&item.url.length<=2000&&/^https?:\/\/[^\s<>"'\\]+$/i.test(item.url),'Enter valid http:// or https:// links. File uploads require workspace storage approval.');
 return JSON.stringify(items.map(item=>({type:'link',url:item.url})));
}
function employeeAccountDeletion_(u,id){
 require_(['Admin','HR'].includes(u.role),'Only Admin and HR can delete employees.');const people=rows_('employees'),employee=people.find(row=>row.id===id);require_(employee,'Employee not found.');require_(employee.id!==u.id,'You cannot delete your own account.');require_(u.role==='Admin'||!['Admin','HR'].includes(employee.role),'Only Admin can delete privileged accounts.');require_(employee.role!=='Admin'||people.some(row=>row.id!==employee.id&&row.role==='Admin'&&row.status==='Active'),'Keep at least one active Admin.');
 const counts={credentials:rows_('credentials').filter(row=>row.employeeId===id).length,sessions:rows_('sessions').filter(row=>row.employeeId===id).length,tasks:rows_('tasks').filter(row=>row.assignee===id||!row.projectId&&row.managerId===id).length,projects:rows_('projects').filter(row=>row.owner===id).length};
 return {employee,counts};
}
function employeeDeletionPreview_(u,p){const {employee,counts}=employeeAccountDeletion_(u,p.id);return {employee:{id:employee.id,name:employee.name,email:employee.email},counts,canDelete:!counts.tasks&&!counts.projects};}
function deleteEmployeeAccount_(u,p){
 require_(p.confirmPermanent===true,'Confirm permanent account deletion.');const {employee,counts}=employeeAccountDeletion_(u,p.id);require_(!counts.tasks&&!counts.projects,'Reassign this employee’s tasks and owned projects before deleting the account.');
 update_('employees',{...employee,status:'Inactive'});
 for(const collection of ['sessions','credentials']){const ids=new Set(rows_(collection).filter(row=>row.employeeId===employee.id).map(row=>row.id));const sheet=spreadsheet_().getSheetByName(collection),values=sheet.getRange(1,1,sheet.getLastRow(),1).getValues();for(let index=values.length-1;index>0;index--)if(ids.has(values[index][0]))sheet.deleteRow(index+1);}
 deleteRowById_('employees',employee.id);audit_(u.id,'deleteEmployeeAccount',employee.id);return {db:state_(u)};
}

function leaveLayout_(sheet,write){
 const base=SCHEMA.leaves.slice(0,9);let headers=sheet.getDataRange().getValues()[0]||[];
 require_(JSON.stringify(headers.slice(0,9))===JSON.stringify(base),'Unexpected columns in leaves');
 for(const name of SCHEMA.leaves.slice(9)){
  require_(headers.filter(header=>header===name).length<=1,'Duplicate leave column '+name);
  if(write&&!headers.includes(name)){const column=headers.length+1;if(sheet.getMaxColumns&&column>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),column-sheet.getMaxColumns());sheet.getRange(1,column,1,1).setValues([[name]]);headers=[...headers,name];}
 }
 return headers;
}
function readLeaves_(sheet){const data=sheet.getDataRange().getValues(),headers=leaveLayout_(sheet,false);return data.slice(1).filter(row=>row[0]).map(row=>{const task=Object.fromEntries(SCHEMA.leaves.map(name=>[name,headers.includes(name)?sheetValue_(name,row[headers.indexOf(name)]??''):'']));return task;});}
function writeLeaveRow_(record,existing){
 const sheet=spreadsheet_().getSheetByName('leaves'),headers=leaveLayout_(sheet,true);
 if(!existing){sheet.appendRow(headers.map(name=>SCHEMA.leaves.includes(name)?cell_(record[name]??''):''));return;}
 const ids=sheet.getRange(1,1,sheet.getLastRow(),1).getValues();const index=ids.findIndex(row=>row[0]===record.id);require_(index>0,'Record not found.');
 sheet.getRange(index+1,1,1,9).setValues([SCHEMA.leaves.slice(0,9).map(name=>cell_(record[name]??''))]);
 for(const name of SCHEMA.leaves.slice(9))sheet.getRange(index+1,headers.indexOf(name)+1,1,1).setValues([[cell_(record[name]??'')]]);
}

// Shared leave calendar functions; parity is covered by tests.
const leaveTypes=['Casual','Sick','Earned/Annual','Unpaid','Other','Work from home (WFH)'];
const defaultLeavePolicy={workingDays:[1,2,3,4,5,6],holidays:[],approverId:''};
function leaveUnits(record,policy=defaultLeavePolicy){
 const start=Date.parse(record.start+'T00:00:00Z'),end=Date.parse(record.end+'T00:00:00Z');
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>365*86400000)return [];
 const half=record.duration==='Half day';if(half&&(start!==end||!['First half','Second half'].includes(record.half)))return [];
 const working=new Set(policy.workingDays||[1,2,3,4,5,6]),holidays=new Set(policy.holidays||[]),units=[];
 for(let stamp=start;stamp<=end;stamp+=86400000){const date=new Date(stamp),day=date.toISOString().slice(0,10);if(working.has(date.getUTCDay())&&!holidays.has(day))units.push({day,mask:half?(record.half==='First half'?1:2):3});}
 return units;
}
function totalLeaveDays(record,policy=defaultLeavePolicy){return leaveUnits(record,policy).reduce((days,unit)=>days+(unit.mask===3?1:0.5),0);}
function leaveOverlaps(a,b,policy=defaultLeavePolicy){const other=new Map(leaveUnits(b,policy).map(unit=>[unit.day,unit.mask]));return leaveUnits(a,policy).some(unit=>(other.get(unit.day)||0)&unit.mask);}

function saveSheetSetting_(id,value,updatedBy){
 const book=spreadsheet_();let sheet=book.getSheetByName('settings');if(!sheet){sheet=book.insertSheet('settings');sheet.appendRow(SCHEMA.settings);sheet.setFrozenRows(1);}
 const record={id,value,updated:new Date().toISOString(),updatedBy};if(rows_('settings').some(row=>row.id===id))update_('settings',record);else append_('settings',record);
}
function leavePolicy_(){const stored=spreadsheet_().getSheetByName('settings')?rows_('settings').find(row=>row.id==='leavePolicy'):null;const raw=stored?stored.value:PropertiesService.getScriptProperties().getProperty('LEAVE_POLICY');if(!raw)return {...defaultLeavePolicy};let policy;try{policy=JSON.parse(raw);}catch{throw Error('Invalid leave calendar configuration.');}return policy;}
function saveLeavePolicy_(u,p){
 require_(['Admin','HR'].includes(u.role),'Only Admin and HR can configure leave policy.');const policy=p.policy;require_(policy&&Object.keys(policy).every(k=>['workingDays','holidays','approverId'].includes(k)),'Invalid leave policy.');
 require_(Array.isArray(policy.workingDays)&&policy.workingDays.length>0&&policy.workingDays.length<=7&&policy.workingDays.every(day=>Number.isInteger(day)&&day>=0&&day<=6)&&new Set(policy.workingDays).size===policy.workingDays.length,'Choose valid working days.');
 require_(Array.isArray(policy.holidays)&&policy.holidays.length<=366&&policy.holidays.every(day=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&!isNaN(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day),'Enter valid holiday dates.');
 require_(typeof policy.approverId==='string'&&(!policy.approverId||rows_('employees').some(e=>e.id===policy.approverId&&e.status==='Active'&&['Admin','HR','Team Leader'].includes(e.role))),'Select an active approver.');
 saveSheetSetting_('leavePolicy',JSON.stringify({workingDays:policy.workingDays,holidays:[...new Set(policy.holidays)].sort(),approverId:policy.approverId}),u.id);audit_(u.id,'saveLeavePolicy','workspace');return {db:state_(u)};
}
function validateLeave_(r,u,excludeId){
 require_(r.end>=r.start,'Invalid leave date range.');r.type=r.type==='Earned'?'Earned/Annual':r.type;require_(leaveTypes.includes(r.type),'Invalid leave type.');r.duration=r.duration||'Full day';r.half=r.half||'';require_(['Full day','Half day'].includes(r.duration),'Select a valid duration.');require_(r.duration!=='Half day'||r.start===r.end&&['First half','Second half'].includes(r.half),'Half-day leave requires one date and a first or second half.');if(r.duration==='Full day')r.half='';
 const policy=leavePolicy_();r.totalDays=String(totalLeaveDays(r,policy));require_(Number(r.totalDays)>0,'Select at least one working leave day (up to 366 calendar days).');r.employeeId=u.id;r.status='Pending';r.rejectionReason='';
 require_(!rows_('leaves').some(l=>l.id!==excludeId&&l.employeeId===u.id&&l.status!=='Rejected'&&leaveOverlaps(r,l,policy)),'Leave overlaps an existing request.');
 const submittedBy=excludeId?rows_('leaves').find(l=>l.id===excludeId)?.submittedBy:'';const approvers=rows_('employees').filter(e=>e.id!==u.id&&e.id!==submittedBy&&e.status==='Active'&&['Admin','HR','Team Leader'].includes(e.role));const previousApprover=excludeId?rows_('leaves').find(l=>l.id===excludeId)?.approverId:'';const designated=approvers.find(e=>e.id===previousApprover)||approvers.find(e=>e.id===policy.approverId)||approvers.find(e=>e.role==='HR')||approvers.find(e=>e.role==='Admin');require_(designated,'No eligible leave approver is available. Ask Admin to configure one.');r.approverId=designated.id;
}

// Shift calculations shared with the attendance UI (9:30 am–6:30 pm IST).
function shiftDay(value){if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const stamp=value instanceof Date?value.getTime():Date.parse(value);return Number.isFinite(stamp)?new Date(stamp+330*60000).toISOString().slice(0,10):'';}
function shiftPunch(value,day){if(!value)return NaN;if(/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)){const parts=value.split(':');return Date.parse(day+'T'+parts[0].padStart(2,'0')+':'+parts[1]+':'+(parts[2]||'00')+'+05:30');}return Date.parse(value);}
function shiftMinutes(records,employeeId,day,now=Date.now()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return 0;
 const intervals=records.filter(row=>String(row.employeeId)===String(employeeId)&&shiftDay(row.date)===day).map(row=>[shiftPunch(row.checkIn,day),row.checkOut?shiftPunch(row.checkOut,day):Number(now)]).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((a,b)=>a[0]-b[0]);
 let total=0,lastEnd=-Infinity;for(const [a,b] of intervals){total+=Math.max(0,b-Math.max(a,lastEnd));lastEnd=Math.max(lastEnd,b);}return Math.floor(total/60000);
}
function hoursLabel(minutes){return Math.floor(minutes/60)+'h '+minutes%60+'m';}

function sendMail_(message){
 const props=PropertiesService.getScriptProperties(),key=props.getProperty('BREVO_API_KEY')||'';
 if(!key){MailApp.sendEmail(message);return;}
 const response=UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email',{
  method:'post',
  contentType:'application/json',
  headers:{'api-key':key,accept:'application/json'},
  muteHttpExceptions:true,
  payload:JSON.stringify({sender:{name:message.name||'TeamPulse',email:props.getProperty('BREVO_SENDER_EMAIL')},to:[{email:message.to}],subject:message.subject,textContent:message.body})
 });
 const code=response.getResponseCode();
 if(code!==200&&code!==201)throw new Error('Email unavailable');
}

// Mail errors must never turn a saved leave into a failed submission.
function notifyLeaveAdmins_(employee,leave){
 try{
  const configured=(PropertiesService.getScriptProperties().getProperty('LEAVE_NOTIFY_EMAILS')||'').split(',').map(v=>v.trim()).filter(Boolean),recipients=configured.length?configured:['asawai7875@gmail.com','bhushanchaudhari@gritznova.com','hr@sawaiassociates.com'];
  require_(recipients.length>0,'No active Admin email is configured.');
  const body=[
   leave.type==='Work from home (WFH)'?'A new WFH request is awaiting review in TeamPulse.':'A new leave request is awaiting review in TeamPulse.',
   '',
   'Employee: '+employee.name,
   'Email: '+employee.email,
   'Department: '+(employee.department||'-'),
   'Request type: '+leave.type,
   'Dates: '+leave.start+' to '+leave.end,
   'Duration: '+leave.duration+(leave.half?' ('+leave.half+')':''),
   'Working days: '+leave.totalDays,
   'Reason: '+leave.reason,
   '',
   'Open TeamPulse > Leaves to view the request. Admin, HR or the designated approver can approve or reject it.',
   'Request ID: '+leave.id
  ].join('\n');
  for(const recipient of recipients)sendMail_({to:recipient,subject:'TeamPulse: New '+(leave.type==='Work from home (WFH)'?'WFH':'leave')+' request ('+leave.start+' to '+leave.end+')',body,name:'TeamPulse'});
 }catch(error){
  console.error('Leave email notification failed for '+leave.id+': '+error.message);
  try{audit_(employee.id,'leaveEmailFailed',leave.id);}catch(auditError){console.error('Unable to record leave email failure.');}
 }
}


// Direct messages are returned only to their sender and recipient, including for Admin/HR.
function messagesAction_(u,action,p){
 const people=rows_('employees');
 let sheet=spreadsheet_().getSheetByName('messages');
 if(action==='sendMessage'){
  require_(typeof p.recipientId==='string'&&p.recipientId!==u.id,'Choose another teammate.');
  const recipient=people.find(person=>person.id===p.recipientId&&person.status==='Active');
  require_(recipient,'This teammate is unavailable.');
  require_(typeof p.body==='string'&&p.body.trim().length>0&&p.body.trim().length<=2000,'Enter a message between 1 and 2000 characters.');
  if(!sheet){sheet=spreadsheet_().insertSheet('messages');sheet.appendRow(SCHEMA.messages);sheet.setFrozenRows(1);}
  append_('messages',{id:Utilities.getUuid(),senderId:u.id,recipientId:recipient.id,body:p.body.trim(),created:new Date().toISOString(),readAt:''});
 }
 const messages=(sheet?rows_('messages'):[]).filter(message=>message.senderId===u.id||message.recipientId===u.id);
 if(typeof p.peerId==='string')for(const message of messages){if(message.senderId===p.peerId&&message.recipientId===u.id&&!message.readAt){message.readAt=new Date().toISOString();updateRaw_('messages',message);readMessageNotification_(u.id,message.id);}}
 const ids=new Set(messages.flatMap(message=>[message.senderId,message.recipientId]));
 return {directoryVersion:1,messages,people:people.filter(person=>person.status==='Active'||ids.has(person.id)).map(person=>({id:person.id,name:person.name,photo:person.photo||'',status:person.status,role:person.role,department:person.department||''}))};
}

// Group requests are available to Team Leaders and Admins for every active member.
function groupLeaveMembers_(u){
 return ['Team Leader','Admin'].includes(u.role)?rows_('employees').filter(e=>e.status==='Active'):[];
}
function createGroupLeave_(u,p){
 require_(['Team Leader','Admin'].includes(u.role),'Only Team Leaders and Admins can submit group requests.');
 const members=groupLeaveMembers_(u);
 require_(Array.isArray(p.employeeIds)&&p.employeeIds.length>0&&p.employeeIds.length<=members.length,'Select at least one team member.');
 require_(new Set(p.employeeIds).size===p.employeeIds.length&&p.employeeIds.every(id=>typeof id==='string'&&members.some(e=>e.id===id)),'Select active members only.');
 require_(p.record&&typeof p.record==='object','Invalid leave details.');
 const groupId=Utilities.getUuid(),created=new Date().toISOString();
 // Validate every employee before writing any request, including overlap and approver checks.
 const requests=p.employeeIds.map(id=>{
  const employee=members.find(e=>e.id===id),r={};
  for(const key of ['type','start','end','reason','duration','half'])if(p.record[key]!==undefined)r[key]=p.record[key];
  try{validate_('leaves',r,employee);}catch(error){throw Error(employee.name+': '+error.message);}
  if(r.approverId===u.id){
   const eligible=rows_('employees').filter(e=>e.status==='Active'&&e.id!==u.id&&e.id!==employee.id);
   const approver=eligible.find(e=>e.role==='HR')||eligible.find(e=>e.role==='Admin')||eligible.find(e=>e.role==='Team Leader');
   require_(approver,'No independent approver is available for '+employee.name+'.');r.approverId=approver.id;
  }
  return {employee,record:{...r,id:Utilities.getUuid(),created,groupId,submittedBy:u.id}};
 });
 for(const item of requests)append_('leaves',item.record);
 for(const item of requests){audit_(u.id,'createGroupLeave',item.record.id);notifyLeaveAdmins_(item.employee,item.record);}
 return {db:state_(u)};
}

// Daily Work Reports: separate storage preserves all legacy worklogs.
function reportRows_(name){return spreadsheet_().getSheetByName(name)?rows_(name):[];}
function ensureReportSheet_(name){const book=spreadsheet_();if(!book.getSheetByName(name)){const sheet=book.insertSheet(name);sheet.appendRow(SCHEMA[name]);sheet.setFrozenRows(1);}}
function reportTeam_(u){
 const people=rows_('employees').filter(e=>e.status!=='Deleted');if(['Admin','HR'].includes(u.role))return people;
 const projects=rows_('projects').filter(p=>p.owner===u.id),projectIds=new Set(projects.map(p=>p.id));
 const assigned=new Set(rows_('tasks').filter(t=>projectIds.has(t.projectId)||!t.projectId&&t.managerId===u.id).map(t=>t.assignee));
 return people.filter(e=>e.id===u.id||e.reportingManagerId===u.id||u.role==='Team Leader'&&assigned.has(e.id));
}
function reportProjects_(u){const projects=rows_('projects');if(['Admin','HR'].includes(u.role))return projects;const assigned=new Set(rows_('tasks').filter(t=>t.assignee===u.id).map(t=>t.projectId));return projects.filter(p=>p.owner===u.id||assigned.has(p.id));}
function reportExpectedDay_(employee,day,policy,leaves){const stamp=Date.parse(day+'T00:00:00Z');return employee.status==='Active'&&(!(employee.joiningDate||String(employee.created||'').slice(0,10))||(employee.joiningDate||String(employee.created||'').slice(0,10))<=day)&&(policy.workingDays||defaultLeavePolicy.workingDays).includes(new Date(stamp).getUTCDay())&&!(policy.holidays||[]).includes(day)&&!leaves.some(l=>l.employeeId===employee.id&&l.status==='Approved'&&l.type!=='Work from home (WFH)'&&l.duration!=='Half day'&&l.start<=day&&l.end>=day);}
function workReportReminder_(u){const day=Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd');return {day,missing:reportExpectedDay_(u,day,leavePolicy_(),rows_('leaves'))&&!reportRows_('dailyReports').some(r=>r.employeeId===u.id&&r.date===day)};}
function reportSnapshot_(u,p){
 const day=Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd'),month=p.month||day.slice(0,7);require_(typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month),'Choose a valid month.');
 const people=reportTeam_(u),ids=new Set(people.map(e=>e.id));require_(!p.employeeId||ids.has(p.employeeId),'You cannot view this employee reports.');
 const all=reportRows_('dailyReports').filter(r=>ids.has(r.employeeId)),reports=all.filter(r=>r.date.startsWith(month)&&(!p.employeeId||r.employeeId===p.employeeId)).sort((a,b)=>b.date.localeCompare(a.date)||b.created.localeCompare(a.created)),reportIds=new Set(reports.map(r=>r.id));
 const policy=leavePolicy_(),leaves=rows_('leaves'),missing=[];const nowPeople=people.filter(e=>(!p.employeeId||e.id===p.employeeId)&&reportExpectedDay_(e,day,policy,leaves)&&!all.some(r=>r.employeeId===e.id&&r.date===day));
 for(const person of people.filter(e=>!p.employeeId||e.id===p.employeeId)){let count=0;for(let i=1;i<=31;i++){const date=month+'-'+String(i).padStart(2,'0');if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>=day)continue;if(reportExpectedDay_(person,date,policy,leaves)&&!all.some(r=>r.employeeId===person.id&&r.date===date))count++;}missing.push({employeeId:person.id,days:count});}
 return {day,month,reports,comments:reportRows_('reportComments').filter(c=>reportIds.has(c.reportId)).map(c=>({...c,actorName:rows_('employees').find(e=>e.id===c.actor)?.name||'Former teammate'})),people:people.map(e=>({id:e.id,name:e.name,role:e.role})),projects:reportProjects_(u).map(p=>({id:p.id,name:p.name})),canReview:people.some(e=>e.id!==u.id)||['Admin','HR','Team Leader'].includes(u.role),missingToday:nowPeople.map(e=>({id:e.id,name:e.name})),missingDays:missing};
}
function dailyReportsAction_(u,action,p){
 if(action==='reportSnapshot')return reportSnapshot_(u,p);
 if(action==='rebuildReportSheet'){require_(['Admin','HR'].includes(u.role),'Only Admin and HR can rebuild monthly Sheets.');const snapshot=reportSnapshot_(u,p);return {...snapshot,sheetSync:syncMonthlyReportSheet_(snapshot.month,u.id)};}
 if(action!=='dailyReportHistory')reportSnapshot_(u,p);
 const reports=reportRows_('dailyReports'),existing=reports.find(r=>r.id===p.id),scope=new Set(reportTeam_(u).map(e=>e.id));
 if(action==='dailyReportHistory'){require_(existing&&scope.has(existing.employeeId),'Report not found or unavailable.');return {history:reportRows_('reportHistory').filter(h=>h.reportId===existing.id).sort((a,b)=>Number(b.revision)-Number(a.revision))};}
 if(action==='commentDailyReport'){
 require_(existing&&scope.has(existing.employeeId)&&existing.employeeId!==u.id,'Only the employee manager, Admin or HR can comment.');require_(typeof p.body==='string'&&p.body.trim().length>0&&p.body.length<=2000,'Enter a comment between 1 and 2000 characters.');ensureReportSheet_('reportComments');const comment={id:Utilities.getUuid(),reportId:existing.id,actor:u.id,body:p.body.trim(),created:new Date().toISOString()};append_('reportComments',comment);audit_(u.id,'commentDailyReport',existing.id);queueRecordNotification_('reportComments',comment);return {...reportSnapshot_(u,p),sheetSync:syncMonthlyReportSheet_(existing.date.slice(0,7),u.id)};
 }
 require_(action==='saveDailyReport','Unknown report action.');require_(!p.id||existing,'Report not found.');require_(!existing||existing.employeeId===u.id,'You can only edit your own reports.');require_(!existing||Number(p.revision)===Number(existing.revision),'This report changed. Refresh before editing again.');
 const input=p.record;const fields=['projectId','todayWork','doneToday','outputLinks','issues','pendingWork','status','remarks'];require_(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>k==='date'||fields.includes(k)),'Only report details can be edited.');const record={};
 for(const key of fields){const value=input[key]??'';require_(typeof value==='string'&&value.length<=(key==='outputLinks'?6000:4000),'Invalid '+key+'.');record[key]=value.trim();}
 require_(record.todayWork&&record.doneToday,'Daily work and progress are required.');require_(['Not Started','In Progress','Completed','Blocked'].includes(record.status),'Choose a valid status.');require_(record.status!=='Blocked'||record.issues,'Describe the blocker.');
 const project=rows_('projects').find(project=>project.id===record.projectId);require_(project&&((existing&&record.projectId===existing.projectId)||reportProjects_(u).some(p=>p.id===record.projectId)),'Choose a project assigned to you.');
 const links=record.outputLinks?record.outputLinks.split(/\r?\n/).map(s=>s.trim()).filter(Boolean):[];require_(links.length<=5&&links.every(link=>link.length<=2000&&/^https?:\/\/[^\s<>"\x27\\]+$/i.test(link)),'Add up to 5 valid http or https output links, one per line.');record.outputLinks=links.join('\n');
 const day=Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd');
 const date=input.date===undefined?(existing?existing.date:day):input.date;
 require_(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date,'Choose a valid report date.');
 require_(date<=day,'Report date cannot be in the future.');
 require_(!existing||date===existing.date,'The date of an existing report cannot be changed.');
 const now=new Date().toISOString();const saved={...record,id:existing?existing.id:Utilities.getUuid(),employeeId:u.id,date,projectName:project.name,created:existing?existing.created:now,updated:now,revision:String(existing?Number(existing.revision)+1:1)};
 ensureReportSheet_('dailyReports');ensureReportSheet_('reportHistory');if(existing)update_('dailyReports',saved);else append_('dailyReports',saved);append_('reportHistory',{id:Utilities.getUuid(),reportId:saved.id,revision:saved.revision,actor:u.id,snapshot:JSON.stringify(saved),created:now});audit_(u.id,existing?'editDailyReport':'submitDailyReport',saved.id);queueRecordNotification_('dailyReports',saved);return {...reportSnapshot_(u,p),sheetSync:syncMonthlyReportSheet_(saved.date.slice(0,7),u.id)};
}

// Readable monthly presentation. dailyReports remains the source of truth.
function monthlyReportGrid_(month,records,people,comments){
 const names=new Map(people.map(e=>[e.id,e.name])),groups=new Map(),header=['DATE','Output / Link','Issues Faced','Pending Work','Status','EOD Remarks','Project',"Today's Work",'Done Today','Manager Comments','Last Updated (IST)','Report ID'];
 for(const report of records.filter(r=>r.date.startsWith(month))){if(!groups.has(report.employeeId))groups.set(report.employeeId,[]);groups.get(report.employeeId).push(report);}
 const months=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'],title='TeamPulse Daily Work Report | '+month;
 const grid=[[title,...Array(11).fill('')],[months[Number(month.slice(5))-1]+' '+month.slice(0,4)+' | All employees | Generated view - edit entries in TeamPulse',...Array(11).fill('')]],sections=[];
 for(const [employeeId,entries] of [...groups].sort((a,b)=>(names.get(a[0])||a[0]).localeCompare(names.get(b[0])||b[0]))){
  const start=grid.length+1;grid.push([(names.get(employeeId)||'Former employee')+' | Employee ID: '+(people.find(e=>e.id===employeeId)?.employeeCode||employeeId),...Array(11).fill('')]);grid.push(header.slice());
  for(const r of entries.sort((a,b)=>a.date.localeCompare(b.date)||a.created.localeCompare(b.created))){const date=r.date.split('-').reverse().join('/');const notes=comments.filter(c=>c.reportId===r.id).map(c=>(names.get(c.actor)||'Former reviewer')+': '+c.body).join('\n');grid.push([date,r.outputLinks,r.issues,r.pendingWork,r.status,r.remarks,r.projectName,r.todayWork,r.doneToday,notes,Utilities.formatDate(new Date(r.updated),'Asia/Kolkata','dd/MM/yyyy HH:mm'),r.id]);}
  sections.push({start,header:start+1,first:start+2,count:entries.length});grid.push(Array(12).fill(''));
 }
 if(!groups.size)grid.push(['No daily work entries for this month.',...Array(11).fill('')]);
 return {title,grid,sections};
}
function syncMonthlyReportSheet_(month,actor){
 const name='DWR_'+month;try{
 require_(typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month),'Invalid report month.');const book=spreadsheet_(),layout=monthlyReportGrid_(month,reportRows_('dailyReports'),rows_('employees'),reportRows_('reportComments'));let sheet=book.getSheetByName(name);
 if(sheet)require_(sheet.getRange(1,1,1,1).getValues()[0][0]===layout.title,'An unrelated tab already uses '+name+'. Rename that tab, then sync again.');else sheet=book.insertSheet(name);
 const rowCount=Math.max(layout.grid.length,sheet.getLastRow(),2);if(layout.grid.length>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),layout.grid.length-sheet.getMaxRows());if(sheet.getMaxColumns()<12)sheet.insertColumnsAfter(sheet.getMaxColumns(),12-sheet.getMaxColumns());
 // Full-width merged headings cannot cross a frozen-column boundary.
 sheet.setFrozenColumns(0);
 const area=sheet.getRange(1,1,rowCount,12);area.breakApart();area.clearContent();area.clearFormat();sheet.getRange(1,1,layout.grid.length,12).setValues(layout.grid.map(row=>row.map(value=>cell_(String(value??'')))));
 const body=sheet.getRange(1,1,layout.grid.length,12);body.setFontFamily('Arial').setFontSize(10).setFontColor('#172440').setVerticalAlignment('top').setWrap(true).setBackground('#ffffff');
 sheet.getRange(1,1,1,12).merge().setBackground('#548c3b').setFontColor('#ffffff').setFontSize(16).setFontWeight('bold');sheet.setRowHeight(1,34);sheet.getRange(2,1,1,12).merge().setBackground('#edf4e8').setFontColor('#47613b').setFontSize(10);sheet.setRowHeight(2,30);
 for(const group of layout.sections){sheet.getRange(group.start,1,1,12).merge().setBackground('#b9d8a7').setFontWeight('bold');sheet.setRowHeight(group.start,28);sheet.getRange(group.header,1,1,12).setBackground('#dcebd5').setFontWeight('bold').setBorder(true,true,true,true,true,true,'#9fb494',SpreadsheetApp.BorderStyle.SOLID);sheet.setRowHeight(group.header,30);
 const data=sheet.getRange(group.first,1,group.count,12);data.setBorder(true,true,true,true,true,true,'#d7dfd3',SpreadsheetApp.BorderStyle.SOLID);sheet.getRange(group.first,1,group.count,1).setBackground('#eef5e9').setFontWeight('bold');for(let index=0;index<group.count;index++){const status=layout.grid[group.first-1+index][4];sheet.getRange(group.first+index,5,1,1).setBackground(status==='Completed'?'#e3f2df':status==='Blocked'?'#fce3e7':'#fff2d5');}sheet.setRowHeights(group.first,group.count,64);}
 sheet.setFrozenRows(2);sheet.setHiddenGridlines(true);[110,260,220,220,125,220,180,280,240,260,150,260].forEach((width,index)=>sheet.setColumnWidth(index+1,width));
 return {ok:true,name};
 }catch(error){console.error('Monthly work Sheet sync failed: '+error.message);try{audit_(actor,'dailyReportSheetSyncFailed',name);}catch{}return {ok:false,name,error:error.message||'Monthly Sheet could not be updated.'};}
}


// Server-owned inbox. All callers hold the script lock; browser refreshes never create events.
const notificationCollections_=['tasks','projects','leaves','announcements','employees','attendance','messages'];
function append_(k,r){appendRaw_(k,r);if(notificationCollections_.includes(k))queueRecordNotification_(k,r);}
function update_(k,r){
 const before=notificationCollections_.includes(k)?rows_(k).find(row=>row.id===r.id):null;
 updateRaw_(k,r);
 if(before&&SCHEMA[k].some(key=>String(before[key]??'')!==String(r[key]??'')))queueRecordNotification_(k,r,before);
}
function ensureNotificationSheets_(){for(const name of ['notificationEvents','notifications'])ensureReportSheet_(name);}
function notificationTeamIds_(u){return new Set(u.role==='Team Leader'?reportTeam_(u).map(e=>e.id):[u.id]);}
function notificationRecordVisible_(u,k,r){
 if(!r)return false;
 if(k==='messages')return r.recipientId===u.id;
 if(k==='attendance'||k==='punchReminder')return r.employeeId===u.id;
 if(['Admin','HR'].includes(u.role))return true;
 const ids=notificationTeamIds_(u);
 if(k==='announcements')return true;
 if(k==='employees')return ids.has(r.id);
 if(k==='tasks')return ids.has(r.assignee)||u.role==='Team Leader'&&canManageTask_(u,r);
 if(k==='projects')return r.owner===u.id||rows_('tasks').some(t=>t.projectId===r.id&&ids.has(t.assignee));
 if(k==='leaves')return ids.has(r.employeeId)||r.approverId===u.id||r.submittedBy===u.id;
 if(k==='dailyReports')return ids.has(r.employeeId);
 if(k==='reportComments'){const report=reportRows_('dailyReports').find(x=>x.id===r.reportId);return report&&ids.has(report.employeeId);}
 return k==='reportReminder'&&r.employeeId===u.id;
}
function notificationMessage_(k,r){
 if(k==='messages')return 'New message from '+(rows_('employees').find(e=>e.id===r.senderId)?.name||'a teammate');
 if(k==='attendance')return r.checkOut?'Punch-out saved successfully ('+r.date+').':'Punch-in saved successfully ('+r.date+').';
 if(k==='punchReminder')return r.kind==='in'?'Punch-in reminder: your workday has started. Please punch in.':'Punch-out reminder: your workday is ending. Please punch out when you finish.';
 if(k==='tasks')return r._changeKind==='reassigned'?'Task reassigned: '+r.title:r._changeKind==='assigned'?'Task assigned: '+r.title:r._changeKind==='status'?'Task status changed: '+r.title+' ('+r.status+')':'Task updated: '+r.title;
 if(k==='projects')return 'Project: '+r.name+' ('+r.status+')';
 if(k==='leaves')return 'Leave / WFH request updated ('+r.status+')';
 if(k==='announcements')return 'Announcement: '+r.title;
 if(k==='employees')return r.name+': '+r.role+', '+r.status;
 if(k==='reportComments')return 'New comment on your daily work report';
 if(k==='reportReminder')return 'Your daily work report is pending ('+r.date+'). Please submit before EOD.';
 return 'Daily work report updated ('+r.date+')';
}
function queueRecordNotification_(k,r,before=null){
 // Notification failures cannot roll back or turn an already saved record into a failed response.
 try{
 if(k==='employees'&&before&&!['role','status','department','designation','reportingManagerId','employeeCode','email'].some(key=>String(before[key]||'')!==String(r[key]||'')))return;
 if(k==='messages'&&before)return;
 ensureNotificationSheets_();
 const changeKind=k==='tasks'?(!before?'assigned':before.assignee!==r.assignee?'reassigned':before.status!==r.status?'status':'updated'):!before?'created':'updated';
 const record={...r,_changeKind:changeKind,_actor:notificationActor_||''};
 const latest=rows_('notificationEvents').filter(e=>e.collection===k&&e.recordId===r.id).slice(-1)[0];
 if(latest&&latest.record===JSON.stringify(record))return;
 const recipients=(k==='messages'?[r.recipientId]:k==='attendance'?[r.employeeId]:rows_('employees').filter(u=>u.status==='Active'&&notificationRecordVisible_(u,k,r)).map(u=>u.id)).filter(id=>id!==notificationActor_||k==='attendance');
 if(!recipients.length)return;
 const id=digest_(k+':'+r.id+':'+(latest?.id||'first')+':'+JSON.stringify(record));
 appendRaw_('notificationEvents',{id,collection:k,recordId:r.id,record:JSON.stringify(record),recipients:JSON.stringify([...new Set(recipients)]),created:new Date().toISOString(),delivered:''});
 }catch(error){console.error('Notification queue failed for '+k+':'+r.id+': '+error.message);}
}
function deliverNotifications_(){
 ensureNotificationSheets_();const existing=new Set(rows_('notifications').map(n=>n.id));
 for(const event of rows_('notificationEvents').filter(e=>!e.delivered)){
  try{
   const record=JSON.parse(event.record);
   for(const recipientId of JSON.parse(event.recipients)){
    const id=digest_(event.id+':'+recipientId);if(existing.has(id))continue;
    appendRaw_('notifications',{id,eventId:event.id,recipientId,collection:event.collection,recordId:event.recordId,message:notificationMessage_(event.collection,record),created:event.created,readAt:'',dismissedAt:'',deliveredAt:''});existing.add(id);
   }
   updateRaw_('notificationEvents',{...event,delivered:new Date().toISOString()});
  }catch(error){console.error('Notification delivery pending: '+event.id);}
 }
}
function currentNotificationRecord_(n){
 if(['reportReminder','punchReminder'].includes(n.collection)){const e=rows_('notificationEvents').find(e=>e.id===n.eventId);return e?JSON.parse(e.record):null;}
 return rows_(n.collection).find(r=>r.id===n.recordId);
}
function notificationAllowed_(u,n){
 if(n.recipientId!==u.id)return false;
 if(n.collection==='punchReminder'){const reminder=currentNotificationRecord_(n);if(!reminder||!punchReminderPending_(u,reminder))return false;}
 if(n.collection==='reportReminder'){const record=currentNotificationRecord_(n);if(!record||!reportExpectedDay_(u,record.date,leavePolicy_(),rows_('leaves'))||reportRows_('dailyReports').some(r=>r.employeeId===u.id&&r.date===record.date))return false;}
 const record=currentNotificationRecord_(n);
 // Deleted records retain the recipient receipt, but never return the old record payload.
 return !record||notificationRecordVisible_(u,n.collection,record);
}
function notificationsAction_(u,action,p){
 ensureNotificationSheets_();deliverNotifications_();
 const limit=p.limit===undefined?50:p.limit,cursor=p.cursor||null;
 require_(Number.isInteger(limit)&&limit>=1&&limit<=100,'Choose a page size between 1 and 100.');
 require_(!cursor||typeof cursor==='object'&&!Array.isArray(cursor)&&Object.keys(cursor).every(k=>['created','id'].includes(k))&&typeof cursor.created==='string'&&cursor.created.length<=35&&Number.isFinite(Date.parse(cursor.created))&&typeof cursor.id==='string'&&/^[a-f0-9]{64}$/.test(cursor.id),'Invalid notification page.');
 require_(p.popupIds===undefined||Array.isArray(p.popupIds)&&p.popupIds.length<=100&&p.popupIds.every(id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id)),'Invalid popup selection.');
 const own=rows_('notifications').filter(n=>notificationAllowed_(u,n));
 if(action==='notificationOpen'){
  const n=own.find(n=>n.id===p.id);require_(n,'Notification unavailable.');
  const record=currentNotificationRecord_(n);require_(record&&record.status!=='Deleted','This item has been deleted or is no longer available.');
  if(['reportReminder','punchReminder'].includes(n.collection))return {collection:n.collection,record};
  require_(notificationRecordVisible_(u,n.collection,record),'This item is no longer available to your account.');
  if(n.collection==='reportComments'){const report=reportRows_('dailyReports').find(r=>r.id===record.reportId);require_(report&&notificationRecordVisible_(u,'dailyReports',report),'This report has been deleted or is no longer available.');return {collection:'dailyReports',record:report};}
  return {collection:n.collection,record};
 }
 const now=new Date().toISOString();
 if(action==='notificationRead'||action==='notificationDismiss'){
  require_(p.all===true||Array.isArray(p.ids)&&p.ids.length<=500,'Select notifications.');
  if(p.all!==true)require_(p.ids.every(id=>own.some(n=>n.id===id)),'Notification unavailable.');
  for(const n of own.filter(n=>p.all===true||p.ids.includes(n.id)))updateRaw_('notifications',{...n,readAt:n.readAt||now,dismissedAt:action==='notificationDismiss'?now:n.dismissedAt});
 }
 const visible=rows_('notifications').filter(n=>notificationAllowed_(u,n)&&!n.dismissedAt).sort((a,b)=>b.created.localeCompare(a.created)||b.id.localeCompare(a.id));
 require_(p.claimPopups===undefined||typeof p.claimPopups==='boolean','Invalid popup request.');
 const capacity=Math.min(5,Math.max(0,100-(p.popupIds||[]).length));
 const fresh=action==='notificationSnapshot'&&p.claimPopups!==false?visible.filter(n=>!n.deliveredAt&&!n.readAt).slice(0,capacity):[];
 for(const n of fresh)updateRaw_('notifications',{...n,deliveredAt:now});
 const pages={tasks:'Tasks',projects:'Projects',leaves:'Leave requests',announcements:'Announcements',employees:'Employees',dailyReports:'Daily Work Report',reportComments:'Daily Work Report',reportReminder:'Daily Work Report',attendance:'Attendance',punchReminder:'Attendance',messages:'Messages'};
 const events=new Map(rows_('notificationEvents').map(e=>[e.id,e]));
 const present=n=>{let record;try{record=JSON.parse(events.get(n.eventId)?.record||'null');}catch{}return {id:n.id,message:record?notificationMessage_(n.collection,record):'Workspace update',time:n.created,read:!!n.readAt,page:pages[n.collection],collection:n.collection,recordId:n.recordId};};
 const remaining=visible.filter(n=>!cursor||n.created<cursor.created||n.created===cursor.created&&n.id<cursor.id),page=remaining.slice(0,limit),last=page.slice(-1)[0];
 return {unread:visible.filter(n=>!n.readAt).length,items:page.map(present),freshItems:fresh.map(present),freshIds:fresh.map(n=>n.id),activePopupIds:visible.filter(n=>!n.readAt&&(p.popupIds||[]).includes(n.id)).map(n=>n.id),nextCursor:remaining.length>limit?{created:last.created,id:last.id}:null};
}
function reportReminderSchedule_(){
 const props=PropertiesService.getScriptProperties(),eod=props.getProperty('REPORT_EOD_TIME')||'18:30',lead=Number(props.getProperty('REPORT_REMINDER_MINUTES')||'30');
 require_(/^([01]\d|2[0-3]):[0-5]\d$/.test(eod)&&Number.isInteger(lead)&&lead>=5&&lead<=180,'Configure REPORT_EOD_TIME (HH:mm) and REPORT_REMINDER_MINUTES (5-180).');
 const [h,m]=eod.split(':').map(Number);require_(h*60+m>=lead,'Reminder must fall on the same IST day.');return {end:h*60+m,start:h*60+m-lead};
}
// Run once from the Apps Script editor after deploying; safe to rerun without duplicate triggers.
function installNotificationSchedule_(){
 reportReminderSchedule_();punchSchedule_();const handler='processNotificationSchedule_';
 const triggers=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===handler);
 if(!triggers.length)ScriptApp.newTrigger(handler).timeBased().everyMinutes(5).inTimezone('Asia/Kolkata').create();
 for(const extra of triggers.slice(1))ScriptApp.deleteTrigger(extra);
}
function processNotificationSchedule_(){
 const lock=LockService.getScriptLock();lock.waitLock(30000);requestBook_=null;requestRows_={};notificationActor_=null;
 try{
  ensureNotificationSheets_();const now=new Date(),day=Utilities.formatDate(now,'Asia/Kolkata','yyyy-MM-dd'),clock=Utilities.formatDate(now,'Asia/Kolkata','HH:mm').split(':').map(Number),minutes=clock[0]*60+clock[1],schedule=reportReminderSchedule_();
  if(minutes>=schedule.start&&minutes<schedule.end){
   const policy=leavePolicy_(),leaves=rows_('leaves'),reports=reportRows_('dailyReports'),events=new Set(rows_('notificationEvents').map(e=>e.id));
   for(const employee of rows_('employees')){
    const id='reportReminder:'+employee.id+':'+day;
    if(events.has(id)||!reportExpectedDay_(employee,day,policy,leaves)||reports.some(r=>r.employeeId===employee.id&&r.date===day))continue;
    const record={id,employeeId:employee.id,date:day};
    appendRaw_('notificationEvents',{id,collection:'reportReminder',recordId:id,record:JSON.stringify(record),recipients:JSON.stringify([employee.id]),created:now.toISOString(),delivered:''});events.add(id);
   }
  }
  queuePunchReminders_(day,minutes,now);deliverNotifications_();
 }finally{requestBook_=null;requestRows_=null;lock.releaseLock();}
}

function punchSchedule_(){
 const props=PropertiesService.getScriptProperties(),parse=(key,fallback)=>{const value=props.getProperty(key)||fallback;require_(/^([01]\d|2[0-3]):[0-5]\d$/.test(value),'Configure '+key+' as HH:mm in IST.');const parts=value.split(':').map(Number);return parts[0]*60+parts[1];};
 const start=parse('PUNCH_IN_TIME','09:30'),end=parse('PUNCH_OUT_TIME','18:30');require_(end>start,'Punch-out time must follow punch-in time.');return {start,end};
}
function punchReminderPending_(u,r){
 if(r.date!==Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd')||!reportExpectedDay_(u,r.date,leavePolicy_(),rows_('leaves')))return false;
 const attendance=rows_('attendance').filter(a=>a.employeeId===u.id&&a.date===r.date);
 return r.kind==='in'?!attendance.some(a=>a.checkIn):attendance.some(a=>a.checkIn&&!a.checkOut);
}
function queuePunchReminders_(day,minutes,now){
 const schedule=punchSchedule_(),events=new Set(rows_('notificationEvents').map(e=>e.id));
 const kind=minutes>=schedule.start&&minutes<Math.min(schedule.start+30,schedule.end)?'in':minutes>=schedule.end&&minutes<Math.min(schedule.end+30,1440)?'out':'';
 if(!kind)return;
 for(const employee of rows_('employees')){
  const id='punchReminder:'+kind+':'+employee.id+':'+day,record={id,employeeId:employee.id,date:day,kind};
  if(events.has(id)||!punchReminderPending_(employee,record))continue;
  appendRaw_('notificationEvents',{id,collection:'punchReminder',recordId:id,record:JSON.stringify(record),recipients:JSON.stringify([employee.id]),created:now.toISOString(),delivered:''});events.add(id);
 }
}

function readMessageNotification_(employeeId,messageId){
 try{ensureNotificationSheets_();deliverNotifications_();for(const n of rows_('notifications').filter(n=>n.recipientId===employeeId&&n.collection==='messages'&&n.recordId===messageId&&!n.readAt))updateRaw_('notifications',{...n,readAt:new Date().toISOString()});}catch(error){console.error('Message notification receipt pending: '+messageId);}
}
