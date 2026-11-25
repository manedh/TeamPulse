import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {backend,password} from './helpers/backend.mjs';

test('anonymous identity is rejected',()=>assert.equal(backend('').call('bootstrap').ok,false));
test('unknown account is rejected',()=>assert.equal(backend('nobody@company.test').call('bootstrap').ok,false));
test('employee reads only own tasks and private records',()=>{const r=backend('e@company.test').call('bootstrap');assert.equal(r.ok,true);assert.equal(r.data.db.tasks.length,1);assert.equal(r.data.db.tasks[0].id,'t');assert.equal(r.data.db.employees.length,1)});
test('leader scope follows owned projects',()=>{const r=backend('l@company.test').call('bootstrap');assert.equal(r.data.db.projects.length,1);assert.equal(r.data.db.tasks[0].id,'t');assert.equal(r.data.db.employees.length,2)});
test('employee cannot change another employee task',()=>assert.equal(backend('e@company.test').call('taskStatus',{id:'v',status:'Done'}).ok,false));
test('employee can update assigned task and action is audited',()=>{const b=backend('e@company.test');assert.equal(b.call('taskStatus',{id:'t',status:'Done'}).ok,true);assert.equal(b.sheets.audit.length,2)});
test('employee cannot create accounts',()=>assert.equal(backend('e@company.test').call('create',{collection:'employees',record:{}}).ok,false));
test('HR cannot elevate a new account to Admin',()=>assert.equal(backend('h@company.test').call('create',{collection:'employees',record:{name:'New',email:'new@company.test',role:'Admin',department:'IT',designation:'Dev'}}).ok,false));
test('attendance checks duplicates and requires open record',()=>{const b=backend('e@company.test');assert.equal(b.call('attendance',{kind:'out'}).ok,false);assert.equal(b.call('attendance',{kind:'in'}).ok,true);assert.equal(b.call('attendance',{kind:'in'}).ok,false);assert.equal(b.call('attendance',{kind:'out'}).ok,true);assert.equal(b.call('attendance',{kind:'out'}).ok,false)});
test('leave review requires HR/Admin and pending status',()=>{assert.equal(backend('l@company.test').call('leaveDecision',{id:'lv',status:'Approved'}).ok,false);const b=backend();assert.equal(b.call('leaveDecision',{id:'lv',status:'Approved'}).ok,true);assert.equal(b.call('leaveDecision',{id:'lv',status:'Rejected'}).ok,false)});
test('invalid or overlapping leave is rejected',()=>{const b=backend('e@company.test');const record={type:'Casual',start:'2026-10-21',end:'2026-10-20',reason:'Test'};assert.equal(b.call('create',{collection:'leaves',record}).ok,false);record.end='2026-10-22';assert.equal(b.call('create',{collection:'leaves',record}).ok,false)});
test('formula-like text is escaped on write',()=>{const b=backend();assert.equal(b.call('create',{collection:'announcements',record:{title:'=IMPORTXML("bad")',message:'Hello'}}).ok,true);assert.equal(b.sheets.announcements[1][1][0],"'")});

test('project and task creation persist to the backing Sheets service',()=>{const b=backend();assert.equal(b.call('create',{collection:'projects',record:{name:'Real project',description:'Delivery',department:'IT',owner:'l',status:'Planning',due:'2026-11-01'}}).ok,true);const projectId=b.sheets.projects.at(-1)[0];assert.equal(b.call('create',{collection:'tasks',record:{title:'Real task',description:'Instructions and expected result',projectId,assignee:'e',priority:'High',status:'To do',due:'2026-11-01'}}).ok,true);assert.equal(b.sheets.tasks.at(-1)[2],projectId)});
test('employee work log persists with server-assigned ownership',()=>{const b=backend('e@company.test');assert.equal(b.call('create',{collection:'worklogs',record:{date:'2026-10-14',summary:'Completed integration',hours:'4',blockers:'',employeeId:'x'}}).ok,true);assert.equal(b.sheets.worklogs[1][1],'e');assert.equal(b.sheets.worklogs[1][3],'Completed integration')});
test('valid leave request persists as Pending and owned by requester',()=>{const b=backend('x@company.test');assert.equal(b.call('create',{collection:'leaves',record:{type:'Sick',start:'2026-10-26',end:'2026-10-26',reason:'Rest',status:'Approved',employeeId:'e'}}).ok,true);assert.equal(b.sheets.leaves.at(-1)[1],'x');assert.equal(b.sheets.leaves.at(-1)[6],'Pending')});
test('new employee is persisted and returned in admin directory',()=>{const b=backend();const r=b.call('create',{collection:'employees',record:{name:'Actual employee',email:'actual@company.test',role:'Employee',department:'IT',designation:'Developer'}});assert.equal(r.ok,true);assert.ok(r.data.db.employees.some(e=>e.email==='actual@company.test'));assert.equal(b.sheets.employees.at(-1)[1],'Actual employee')});

test('self-registration creates a Pending Employee and a bcrypt hash, ignoring submitted privileges',()=>{const b=backend('');const r=b.call('register',{name:'New Person',email:'NEW@example.com',department:'IT',designation:'Developer',password,role:'Admin',status:'Active'});assert.equal(r.ok,true);assert.equal(r.data.pending,true);const employee=b.sheets.employees.at(-1);assert.equal(employee[2],'new@example.com');assert.equal(employee[3],'Employee');assert.equal(employee[6],'Pending');const credential=b.sheets.credentials.at(-1);assert.match(credential[3],/^\$2b\$12\$/);assert.notEqual(credential[3],password);assert.equal(bcrypt.compareSync(password,credential[3]),true);assert.equal(JSON.stringify(r).includes(credential[3]),false)});
test('pending employee cannot log in before approval',()=>{const b=backend('');b.sheets.employees.find(r=>r[0]==='e')[6]='Pending';const r=b.call('login',{email:'e@company.test',password});assert.equal(r.ok,false);assert.match(r.error,/approval/)});
test('approval allows employee login and Sheets writes, without exposing hashes or session sheets',()=>{const b=backend();b.sheets.employees.find(r=>r[0]==='e')[6]='Pending';assert.equal(b.call('employeeAccess',{id:'e',role:'Employee',status:'Active'}).ok,true);const r=b.call('login',{email:'e@company.test',password},'');assert.equal(r.ok,true);assert.equal(r.data.user.role,'Employee');assert.equal(r.data.db.credentials,undefined);assert.equal(r.data.db.sessions,undefined);assert.equal(b.sheets.sessions.at(-1)[2],crypto.createHash('sha256').update(r.data.token).digest('hex'));assert.equal(b.call('attendance',{kind:'in'},r.data.token).ok,true)});
test('incorrect password and duplicate registration are rejected',()=>{const b=backend('');assert.equal(b.call('login',{email:'e@company.test',password:'incorrect password!'}).ok,false);assert.equal(b.call('register',{name:'Duplicate',email:'e@company.test',department:'IT',designation:'Dev',password}).ok,false)});
test('five wrong password attempts lock the account',()=>{const b=backend('');for(let i=0;i<5;i++)assert.equal(b.call('login',{email:'e@company.test',password:'incorrect password!'}).ok,false);const r=b.call('login',{email:'e@company.test',password});assert.equal(r.ok,false);assert.match(r.error,/15 minutes/)});
test('logout revokes session immediately',()=>{const b=backend('e@company.test');assert.equal(b.call('logout').ok,true);const r=b.call('bootstrap');assert.equal(r.ok,false);assert.equal(r.code,'UNAUTHENTICATED')});
test('expired and forged sessions cannot read data',()=>{const b=backend();b.sheets.sessions[1][3]='2000-01-01T00:00:00Z';assert.equal(b.call('bootstrap').ok,false);assert.equal(b.call('bootstrap',{},'forged-token-'.repeat(6)).ok,false)});
test('disabled account loses its existing session',()=>{const b=backend('e@company.test');b.sheets.employees.find(r=>r[0]==='e')[6]='Inactive';assert.equal(b.call('bootstrap').code,'UNAUTHENTICATED')});
test('HR cannot promote anyone to Admin or alter an existing Admin',()=>{const b=backend('h@company.test');assert.equal(b.call('employeeAccess',{id:'e',role:'Admin',status:'Active'}).ok,false);assert.equal(b.call('employeeAccess',{id:'a',role:'Employee',status:'Inactive'}).ok,false)});
test('employee cannot approve their own or another account',()=>{const b=backend('e@company.test');assert.equal(b.call('employeeAccess',{id:'x',role:'Employee',status:'Active'}).ok,false)});
test('changing password revokes old sessions and requires the new password',()=>{const b=backend('e@company.test');const newPassword='A different long password!';assert.equal(b.call('changePassword',{currentPassword:password,newPassword}).ok,true);assert.equal(b.call('bootstrap').code,'UNAUTHENTICATED');assert.equal(b.call('login',{email:'e@company.test',password},'').ok,false);assert.equal(b.call('login',{email:'e@company.test',password:newPassword},'').ok,true)});
test('short and over-limit Unicode passwords are rejected',()=>{const b=backend('');const base={name:'Valid Name',email:'valid@example.com',department:'IT',designation:'Dev'};assert.equal(b.call('register',{...base,password:'short'}).ok,false);assert.equal(b.call('register',{...base,password:'🔒'.repeat(20)}).ok,false)});
test('initial administrator password is set only by owner setup and removed from properties',()=>{const b=backend();b.sheets.credentials=b.sheets.credentials.filter(r=>r[1]!=='a');b.properties.ADMIN_INITIAL_PASSWORD=password;vm.runInContext('setup()',b.ctx);assert.equal(b.properties.ADMIN_INITIAL_PASSWORD,undefined);assert.equal(b.call('login',{email:'admin@company.test',password},'').ok,true)});
test('public signup cannot claim a pre-created privileged account',()=>{const b=backend('');b.sheets.credentials=b.sheets.credentials.filter(r=>r[1]!=='a');assert.equal(b.call('register',{name:'Fake Admin',email:'admin@company.test',department:'IT',designation:'Admin',password}).ok,false)});

test('email-first check recognizes every existing role without exposing account data',()=>{const b=backend('');for(const email of ['admin@company.test','h@company.test','l@company.test','e@company.test']){const r=b.call('checkAccount',{email});assert.equal(r.ok,true);assert.equal(r.data.continue,true);assert.deepEqual(Object.keys(r.data),['continue']);}});
test('email continuation does not disclose new or unprovisioned accounts',()=>{const b=backend('');assert.equal(b.call('checkAccount',{email:'new@example.com'}).data.continue,true);b.sheets.credentials=b.sheets.credentials.filter(r=>r[1]!=='e');assert.equal(b.call('checkAccount',{email:'e@company.test'}).data.continue,true);});
test('email-first lookup normalizes case and whitespace and rejects invalid addresses',()=>{const b=backend('');assert.equal(b.call('checkAccount',{email:'  ADMIN@COMPANY.TEST '}).data.continue,true);assert.equal(b.call('checkAccount',{email:'not-an-email'}).ok,false);});
test('registered pending users return to password entry rather than creating another account',()=>{const b=backend('');b.sheets.employees.find(r=>r[0]==='e')[6]='Pending';assert.equal(b.call('checkAccount',{email:'e@company.test'}).data.continue,true);});
test('account lookup request cap is enforced',()=>{const b=backend('');b.properties.AUTH_RATE_checkAccount=JSON.stringify({start:Date.now(),count:150});assert.equal(b.call('checkAccount',{email:'e@company.test'}).ok,false);});

test('supplied Sheet ID is used when no script property overrides it',()=>{const b=backend();delete b.properties.SPREADSHEET_ID;let opened='';b.ctx.SpreadsheetApp.openById=id=>{opened=id;return {};};vm.runInContext('spreadsheet_()',b.ctx);assert.equal(opened,'1zsY6TWHvstFcN39kAGQziLwJG-jztdGwllS3SU-RxLs');});
test('explicit Sheet property still overrides the configured default',()=>{const b=backend();let opened='';b.ctx.SpreadsheetApp.openById=id=>{opened=id;return {};};vm.runInContext('spreadsheet_()',b.ctx);assert.equal(opened,'sheet');});
test('setup rejects a missing initial password before adding an Admin record',()=>{const b=backend();b.sheets.credentials=b.sheets.credentials.filter(r=>r[1]!=='a');const before=b.sheets.employees.length;assert.throws(()=>vm.runInContext('setup()',b.ctx),/Password/);assert.equal(b.sheets.employees.length,before);});

test('Sheets Date cell remains a calendar date and can be checked out',()=>{const b=backend('e@company.test');assert.equal(b.call('attendance',{kind:'in'}).ok,true);b.sheets.attendance[1][2]=new Date('2026-10-13T18:30:00.000Z');const state=b.call('bootstrap');assert.equal(state.data.db.attendance[0].date,'2026-10-14');assert.equal(b.call('attendance',{kind:'in'}).ok,false);const result=b.call('attendance',{kind:'out'});assert.equal(result.ok,true);assert.ok(result.data.db.attendance[0].checkOut);assert.equal(b.sheets.attendance.length,2);});
test('date-only project dates are preserved but attendance timestamps stay ISO',()=>{const b=backend();const value=new Date('2026-10-13T18:30:00.000Z');b.ctx.sampleDate=value;assert.equal(vm.runInContext("sheetValue_('due',sampleDate)",b.ctx),'2026-10-14');assert.equal(vm.runInContext("sheetValue_('checkIn',sampleDate)",b.ctx),value.toISOString());});


for(const [email,role] of [['admin@company.test','Admin'],['h@company.test','HR'],['l@company.test','Team Leader'],['e@company.test','Employee']])test(role+' punch in/out with location and duplicate protection',()=>{
 const b=backend(email);const location={status:'captured',latitude:0,longitude:77.2,accuracy:15};
 assert.equal(b.call('attendance',{kind:'out',location}).ok,false);
 assert.equal(b.call('attendance',{kind:'in',location}).ok,true);
 assert.equal(b.call('attendance',{kind:'in',location}).ok,false);
 assert.equal(b.call('attendance',{kind:'out',location:{status:'denied'}}).ok,true);
 assert.equal(b.call('attendance',{kind:'out',location}).ok,false);
 const events=b.call('accessHistory').data.events;assert.equal(events.length,2);assert.equal(events[0].action,'punchOut');assert.equal(events[0].status,'denied');assert.equal(events[1].action,'punchIn');assert.equal(events[1].latitude,0);
 assert.equal(b.call('bootstrap').data.db.attendance.filter(a=>a.employeeId===events[0].employeeId).length,1);
});
test('account login/logout does not capture punch locations',()=>{const b=backend('');const r=b.call('login',{email:'e@company.test',password});assert.equal(r.ok,true);assert.equal(b.call('logout',{},r.data.token).ok,true);assert.equal(b.sheets.accessEvents.length,1)});
test('punch location history is private and invalid coordinates are discarded',()=>{const b=backend();b.call('attendance',{kind:'in',location:{status:'captured',latitude:999,longitude:1,accuracy:2}});const r=b.call('login',{email:'e@company.test',password},'');b.call('attendance',{kind:'in',location:{status:'denied'}},r.data.token);const events=b.call('accessHistory',{},r.data.token).data.events;assert.equal(events.length,1);assert.equal(events[0].employeeId,'e');assert.equal(b.sheets.accessEvents[1][3],'unavailable');assert.equal(b.sheets.accessEvents[1][4],'')});
test('existing deployment creates location sheet on first punch',()=>{const b=backend();delete b.sheets.accessEvents;assert.equal(b.call('accessHistory').data.events.length,0);assert.equal(b.call('attendance',{kind:'in'}).ok,true);assert.equal(b.sheets.accessEvents.length,2)});
test('Admin can provision initial password and HR cannot provision Admin',()=>{const b=backend();b.sheets.credentials=b.sheets.credentials.filter(r=>r[1]!=='l');assert.equal(b.call('setInitialPassword',{employeeId:'l',password}).ok,true);assert.equal(b.call('setInitialPassword',{employeeId:'l',password}).ok,false);const h=backend('h@company.test');assert.equal(h.call('setInitialPassword',{employeeId:'a',password}).ok,false)});

for(const email of ['admin@company.test','h@company.test','l@company.test','e@company.test'])test(email+' compact punch avoids unrelated Sheets reads',()=>{
 const b=backend(email);const before=b.opens();const r=b.call('attendance',{kind:'in',compact:true,location:{status:'captured',latitude:28.6,longitude:77.2,accuracy:20}});
 assert.equal(r.ok,true);assert.ok(r.data.attendance.checkIn);assert.equal(r.data.db,undefined);assert.equal(b.reads.projects,undefined);assert.equal(b.reads.tasks,undefined);assert.equal(b.reads.worklogs,undefined);assert.equal(b.opens()-before,1);
 const out=b.call('attendance',{kind:'out',compact:true,location:{status:'blocked'}});assert.equal(out.ok,true);assert.equal(out.data.attendance.id,r.data.attendance.id);assert.ok(out.data.attendance.checkOut);assert.equal(b.call('attendance',{kind:'out',compact:true}).ok,false);assert.equal(b.sheets.accessEvents.at(-1)[3],'blocked');
});


test('legacy ISO string dates match punch-out without creating another record',()=>{const b=backend('e@company.test');b.sheets.attendance.push(['legacy','e','2026-10-13T18:30:00.000Z','2026-10-14T04:00:00Z','','']);assert.equal(b.call('attendance',{kind:'in'}).ok,false);const r=b.call('attendance',{kind:'out',compact:true});assert.equal(r.ok,true);assert.equal(r.data.attendance.id,'legacy');assert.equal(r.data.attendance.date,'2026-10-14');assert.ok(r.data.attendance.checkOut);assert.equal(b.sheets.attendance.length,2)});
test('punch-out chooses an existing open duplicate, preserving completed records',()=>{const b=backend('e@company.test');b.sheets.attendance.push(['closed','e','2026-10-14','09:00','10:00',''],['open','e','2026-10-14','11:00','','']);const r=b.call('attendance',{kind:'out',compact:true});assert.equal(r.ok,true);assert.equal(r.data.attendance.id,'open');assert.equal(b.sheets.attendance[1][4],'10:00')});
test('Admin cannot punch out an employee attendance record as their own',()=>{const b=backend();b.sheets.attendance.push(['employee-open','e','2026-10-14','09:00','','']);assert.equal(b.call('attendance',{kind:'out',compact:true}).ok,false);assert.equal(b.sheets.attendance[1][4],'')});
test('ISO calendar conversion uses IST while timestamps stay intact',()=>{const b=backend();b.ctx.Utilities.formatDate=(d,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);assert.equal(vm.runInContext("sheetValue_('date','2026-10-13T18:30:00.000Z')",b.ctx),'2026-10-14');assert.equal(vm.runInContext("sheetValue_('date','2026-10-13T18:29:59.000Z')",b.ctx),'2026-10-13');assert.equal(vm.runInContext("sheetValue_('checkIn','2026-10-13T18:30:00.000Z')",b.ctx),'2026-10-13T18:30:00.000Z')});

test('employee saved punches and coordinates synchronize to Admin and survive a new login',()=>{
 const b=backend();const login=b.call('login',{email:'e@company.test',password},'');const token=login.data.token;
 const point={status:'captured',latitude:28.6123,longitude:77.2345,accuracy:97};const punch=b.call('attendance',{kind:'in',compact:true,location:point},token);
 assert.equal(punch.ok,true);assert.equal(punch.data.event.id,punch.data.attendance.id+':punchIn');
 for(const authToken of [b.token,token]){const snapshot=b.call('attendanceSnapshot',{},authToken);assert.equal(snapshot.ok,true);assert.ok(snapshot.data.attendance.some(a=>a.id===punch.data.attendance.id));assert.equal(snapshot.data.events[0].latitude,point.latitude);assert.equal(snapshot.data.events[0].id,punch.data.event.id);}
 const out=b.call('attendance',{kind:'out',compact:true,location:{...point,latitude:28.6124}},token);assert.equal(out.ok,true);const admin=b.call('attendanceSnapshot');assert.ok(admin.data.attendance[0].checkOut);assert.equal(admin.data.events.length,2);
 const relogin=b.call('login',{email:'e@company.test',password},'');const restored=b.call('attendanceSnapshot',{},relogin.data.token);assert.ok(restored.data.attendance[0].checkOut);assert.equal(restored.data.events.length,2);
});
test('attendance snapshot protects other employee coordinates and reads no worklogs',()=>{const b=backend();b.call('attendance',{kind:'in',compact:true,location:{status:'captured',latitude:28,longitude:77,accuracy:20}});const login=b.call('login',{email:'e@company.test',password},'');Object.keys(b.reads).forEach(k=>delete b.reads[k]);const own=b.call('attendanceSnapshot',{},login.data.token);assert.equal(own.data.attendance.length,0);assert.equal(own.data.events.length,0);assert.equal(b.reads.worklogs,undefined);assert.equal(b.reads.projects,undefined);assert.equal(b.call('attendanceSnapshot',{},'forged').ok,false)});

for(const [email,id]of [['admin@company.test','a'],['h@company.test','h'],['l@company.test','l'],['e@company.test','e']])test(email+' punch-out closes legacy duplicates and remains complete on refresh',()=>{const b=backend(email);b.sheets.attendance.push(['old-1',id,'2026-10-14','09:00','',''],['old-2',id,'2026-10-14','09:01','',''],['foreign','x','2026-10-14','09:00','','']);const r=b.call('attendance',{kind:'out',attendanceId:'old-2',compact:true,location:{status:'denied'}});assert.equal(r.ok,true);assert.equal(r.data.attendance.id,'old-2');assert.ok(r.data.attendance.checkOut);assert.deepEqual(Array.from(r.data.closedAttendanceIds).sort(),['old-1','old-2']);assert.equal(b.sheets.attendance[1][4],r.data.attendance.checkOut);assert.equal(b.sheets.attendance[3][4],'');const refreshed=b.call('attendanceSnapshot').data.attendance.filter(a=>a.employeeId===id);assert.equal(refreshed.length,2);assert.ok(refreshed.every(a=>a.checkOut));assert.equal(b.call('attendance',{kind:'out',compact:true}).ok,false)});

for(const [email,role] of [['admin@company.test','Admin'],['h@company.test','HR'],['l@company.test','Team Leader'],['e@company.test','Employee']])test(role+' saves distinct locations for both compact punches and restores them from snapshot',()=>{
 const b=backend(email);
 const start=b.call('attendance',{kind:'in',compact:true,location:{status:'captured',latitude:28.6,longitude:77.2,accuracy:15}});
 assert.equal(start.ok,true);assert.equal(start.data.event.status,'captured');assert.equal(start.data.event.latitude,28.6);
 const end=b.call('attendance',{kind:'out',compact:true,attendanceId:start.data.attendance.id,location:{status:'captured',latitude:28.7,longitude:77.3,accuracy:25}});
 assert.equal(end.ok,true);assert.ok(end.data.attendance.checkOut);assert.equal(end.data.event.longitude,77.3);
 assert.equal(end.data.event.id,start.data.attendance.id+':punchOut');
 const saved=b.call('attendanceSnapshot');assert.equal(saved.ok,true);
 const row=saved.data.attendance.find(a=>a.id===start.data.attendance.id);assert.equal(row.checkOut,end.data.attendance.checkOut);
 const events=saved.data.events.filter(e=>e.employeeId===row.employeeId);
 assert.equal(events.length,2);assert.equal(events.find(e=>e.action==='punchIn').latitude,28.6);assert.equal(events.find(e=>e.action==='punchOut').latitude,28.7);
});

test('bootstrap identifies the location-aware attendance backend',()=>{assert.equal(backend().call('bootstrap').data.attendanceLocationVersion,1)});
for(const [email,role] of [['admin@company.test','Admin'],['h@company.test','HR'],['l@company.test','Team Leader'],['e@company.test','Employee']])test(role+' rejects missing or invalid required location before writing a punch',()=>{
 const b=backend(email);
 for(const location of [undefined,{status:'denied'},{status:'captured',latitude:999,longitude:77,accuracy:20}]){
  const result=b.call('attendance',{kind:'in',requireLocation:true,compact:true,location});assert.equal(result.ok,false);assert.match(result.error,/location/i);
 }
 assert.equal(b.sheets.attendance.length,1);assert.equal(b.sheets.accessEvents.length,1);
 const location={status:'captured',latitude:28,longitude:77,accuracy:20};
 const start=b.call('attendance',{kind:'in',requireLocation:true,compact:true,location});assert.equal(start.ok,true);
 assert.equal(b.call('attendance',{kind:'out',requireLocation:true,location:{status:'timeout'}}).ok,false);
 assert.equal(b.sheets.attendance[1][4],'');assert.equal(b.sheets.accessEvents.length,2);
 const end=b.call('attendance',{kind:'out',requireLocation:true,compact:true,location});assert.equal(end.ok,true);assert.equal(end.data.event.status,'captured');
});

for(const [email,role] of [['admin@company.test','Admin'],['h@company.test','HR'],['l@company.test','Team Leader'],['e@company.test','Employee']])test(role+' can punch out then punch in again without overwriting previous sessions',()=>{
 const b=backend(email),location={status:'captured',latitude:28,longitude:77,accuracy:20};
 const punch=(kind,attendanceId)=>b.call('attendance',{kind,attendanceId,compact:true,requireLocation:true,location});
 const first=punch('in');assert.equal(first.ok,true);assert.equal(punch('in').ok,false);
 assert.equal(punch('out',first.data.attendance.id).ok,true);
 const second=punch('in');assert.equal(second.ok,true);assert.notEqual(second.data.attendance.id,first.data.attendance.id);
 assert.equal(punch('in').ok,false);
 assert.equal(punch('out',first.data.attendance.id).ok,false);
 const end=punch('out',second.data.attendance.id);assert.equal(end.ok,true);
 assert.equal(b.sheets.attendance.length,3);assert.equal(b.sheets.accessEvents.length,5);
 assert.ok(b.sheets.attendance.slice(1).every(row=>row[4]));
});

test('attendance table with an extra Column 1 still saves punch-out and preserves custom cells',()=>{
 const b=backend('e@company.test');b.sheets.attendance[0].push('Column 1');
 b.sheets.attendance.push(['legacy-row','e','2026-10-14','2026-10-14T04:28:22.815Z','','2026-10-14T04:28:22.815Z','keep this']);
 assert.equal(b.call('bootstrap').ok,true);
 const result=b.call('attendance',{kind:'out',attendanceId:'legacy-row',compact:true,requireLocation:true,location:{status:'captured',latitude:28,longitude:77,accuracy:15}});
 assert.equal(result.ok,true);assert.ok(b.sheets.attendance[1][4]);assert.equal(b.sheets.attendance[1][6],'keep this');
 assert.equal(result.data.event.id,'legacy-row:punchOut');assert.equal(b.call('attendanceSnapshot').data.attendance[0].checkOut,result.data.attendance.checkOut);
});
test('missing or reordered required Sheet headers still fail safely',()=>{
 for(const headers of [['id','date','employeeId','checkIn','checkOut','created'],['id','employeeId','date','checkIn']]){
  const b=backend();b.sheets.attendance[0]=headers;const result=b.call('bootstrap');assert.equal(result.ok,false);assert.match(result.error,/Unexpected columns in attendance/);
 }
});

test('employee profile updates persist for own account and return refreshed user',()=>{const b=backend('e@company.test');const r=b.call('updateProfile',{name:'  Priya Sharma  '});assert.equal(r.ok,true);assert.equal(r.data.user.name,'Priya Sharma');assert.equal(b.call('bootstrap').data.user.name,'Priya Sharma');assert.equal(b.sheets.employees.find(r=>r[0]==='x')[1],'x');});
test('profile editor rejects privilege and identity changes',()=>{for(const extra of [{id:'x'},{role:'Admin'},{email:'other@company.test'},{department:'HR'}]){const b=backend('e@company.test');assert.equal(b.call('updateProfile',{name:'Changed',...extra}).ok,false);assert.equal(b.call('bootstrap').data.user.name,'e');}});
test('profile editor rejects blank and oversized names',()=>{const b=backend('e@company.test');for(const name of ['', '   ', 'a'.repeat(101), null])assert.equal(b.call('updateProfile',{name}).ok,false);});

test('Admin and HR can create and delete announcements without removing other rows',()=>{for(const email of ['admin@company.test','h@company.test']){const b=backend(email);for(const title of ['First','Keep'])assert.equal(b.call('create',{collection:'announcements',record:{title,message:'Team update'}}).ok,true);const id=b.sheets.announcements[1][0];const r=b.call('deleteAnnouncement',{id});assert.equal(r.ok,true);assert.equal(r.data.db.announcements.length,1);assert.equal(r.data.db.announcements[0].title,'Keep');assert.equal(b.sheets.audit.at(-1)[2],'deleteAnnouncement');assert.equal(b.call('deleteAnnouncement',{id}).ok,false);}});
test('employees and leaders cannot create or delete announcements',()=>{for(const email of ['e@company.test','l@company.test']){const b=backend(email);assert.equal(b.call('create',{collection:'announcements',record:{title:'No',message:'No'}}).ok,false);assert.equal(b.call('deleteAnnouncement',{id:'anything'}).ok,false);assert.equal(b.sheets.announcements.length,1);}});

test('Admin and HR delete a project and its tasks while preserving other projects and records',()=>{for(const email of ['admin@company.test','h@company.test']){const b=backend(email);assert.equal(b.call('create',{collection:'tasks',record:{title:'Second linked task',description:'Instructions and expected result',projectId:'p',assignee:'e',priority:'Low',status:'To do',due:'2026-10-20'}}).ok,true);const r=b.call('deleteProject',{id:'p'});assert.equal(r.ok,true);assert.equal(r.data.db.projects.length,1);assert.equal(r.data.db.projects[0].id,'q');assert.equal(r.data.db.tasks.length,1);assert.equal(r.data.db.tasks[0].id,'v');assert.equal(b.sheets.employees.length,6);assert.equal(b.sheets.audit.at(-1)[2],'deleteProject');assert.equal(b.call('deleteProject',{id:'p'}).ok,false);}});
test('employees and leaders cannot delete projects',()=>{for(const email of ['e@company.test','l@company.test']){const b=backend(email);assert.equal(b.call('deleteProject',{id:'p'}).ok,false);assert.equal(b.sheets.projects.length,3);assert.equal(b.sheets.tasks.length,3);}});

test('Admin and HR delete employees while preserving history and blocking login',()=>{for(const email of ['admin@company.test','h@company.test']){const b=backend(email);const r=b.call('deleteEmployee',{id:'e'});assert.equal(r.ok,true);assert.equal(b.sheets.employees.find(e=>e[0]==='e')[6],'Deleted');assert.equal(b.sheets.tasks.length,3);assert.equal(b.sheets.leaves.length,2);assert.equal(b.call('login',{email:'e@company.test',password},'').ok,false);assert.equal(b.call('employeeAccess',{id:'e',role:'Employee',status:'Active'}).ok,false);assert.equal(b.call('deleteEmployee',{id:'e'}).ok,false);}});
test('employee deletion rejects self deletion and unauthorized roles',()=>{for(const [email,id] of [['admin@company.test','a'],['h@company.test','a'],['h@company.test','h'],['e@company.test','x'],['l@company.test','e']]){const b=backend(email);assert.equal(b.call('deleteEmployee',{id}).ok,false);assert.equal(b.sheets.employees.find(e=>e[0]===id)[6],'Active');}});
test('Admin can delete HR accounts',()=>{const b=backend();assert.equal(b.call('deleteEmployee',{id:'h'}).ok,true);});


test('owner setup restores a missing Admin profile with the existing credential ID and password',()=>{
 const b=backend();const hash=b.sheets.credentials[1][3];b.sheets.employees=b.sheets.employees.filter(r=>r[0]!=='a');
 assert.equal(b.call('login',{email:'admin@company.test',password},'').error,'Account unavailable. Contact your administrator.');
 vm.runInContext('setup()',b.ctx);
 assert.equal(b.sheets.employees.filter(r=>r[0]==='a').length,1);assert.equal(b.sheets.credentials[1][3],hash);
 assert.equal(b.call('login',{email:'admin@company.test',password},'').data.user.role,'Admin');
 vm.runInContext('setup()',b.ctx);assert.equal(b.sheets.employees.filter(r=>r[0]==='a').length,1);
});
test('owner setup relinks orphan credentials to an existing active Admin without changing password',()=>{
 const b=backend();const hash=b.sheets.credentials[1][3];b.sheets.credentials[1][1]='missing-admin';
 vm.runInContext('setup()',b.ctx);assert.equal(b.sheets.credentials[1][1],'a');assert.equal(b.sheets.credentials[1][3],hash);
 assert.equal(b.call('login',{email:'admin@company.test',password},'').ok,true);
});
test('owner setup rejects conflicting Admin identity links without modifying employee records',()=>{
 for(const kind of ['otherEmployee','duplicateCredential','duplicateProfile','inactive','blankLink']){
 const b=backend();
 if(kind==='otherEmployee')b.sheets.credentials[1][1]='e';
 if(kind==='duplicateCredential')b.sheets.credentials.push([...b.sheets.credentials[1]]);
 if(kind==='duplicateProfile')b.sheets.employees.push([...b.sheets.employees[1]]);
 if(kind==='inactive')b.sheets.employees[1][6]='Inactive';
 if(kind==='blankLink')b.sheets.credentials[1][1]='';
 const before=JSON.stringify([b.sheets.employees,b.sheets.credentials]);assert.throws(()=>vm.runInContext('setup()',b.ctx));
 assert.equal(JSON.stringify([b.sheets.employees,b.sheets.credentials]),before);
 }
});

test('announcement creator comes from the audit and is visible to employees',()=>{
 const b=backend();
 const created=b.call('create',{collection:'announcements',record:{title:'Team news',message:'Hello',createdBy:'h',createdByName:'Fake author'}});
 assert.equal(created.ok,true);
 assert.equal(created.data.db.announcements[0].createdBy,'a');
 assert.equal(created.data.db.announcements[0].createdByName,'a');
 const employee=b.call('login',{email:'e@company.test',password});
 assert.equal(employee.ok,true);
 assert.equal(employee.data.db.announcements[0].createdByName,'a');
 assert.equal(employee.data.db.employees.some(person=>person.id==='a'),false);
 assert.equal('audit' in employee.data.db,false);
});
test('legacy announcements without creation audit have no invented author',()=>{
 const b=backend();b.sheets.announcements.push(['legacy','Old notice','Hello','2026-10-01']);
 const result=b.call('bootstrap');
 assert.equal(result.data.db.announcements[0].createdByName,'');
});

test('employee edits own pending leave, excluding itself from overlap checks',()=>{
 const b=backend('e@company.test');const record={type:'Casual',start:'2026-10-20',end:'2026-10-21',reason:'Updated plans'};
 const result=b.call('editLeave',{id:'lv',record});assert.equal(result.ok,true);assert.equal(result.data.db.leaves[0].reason,'Updated plans');assert.equal(result.data.db.leaves[0].status,'Pending');assert.equal(result.data.db.leaves[0].employeeId,'e');assert.equal(b.sheets.audit.at(-1)[2],'editLeave');
 assert.equal(b.call('editLeave',{id:'lv',record:{...record,end:'2026-10-19'}}).ok,false);
 assert.equal(b.call('editLeave',{id:'lv',record:{...record,status:'Approved'}}).ok,false);
 assert.equal(b.call('editLeave',{id:'lv',record:{...record,start:'invalid'}}).ok,false);
 assert.equal(b.call('editLeave',{id:'lv',record:{...record,type:'Unknown'}}).ok,false);
});
test('leave edits cannot overlap another non-rejected request',()=>{
 const b=backend('e@company.test');assert.equal(b.call('create',{collection:'leaves',record:{type:'Sick',start:'2026-10-25',end:'2026-10-26',reason:'Rest'}}).ok,true);
 assert.equal(b.call('editLeave',{id:'lv',record:{type:'Casual',start:'2026-10-24',end:'2026-10-26',reason:'Overlap'}}).ok,false);
});
test('only the owner can edit or delete a pending request, and reviewed requests are locked',()=>{
 for(const email of ['admin@company.test','h@company.test','x@company.test']){const b=backend(email);assert.equal(b.call('editLeave',{id:'lv',record:{type:'Sick',start:'2026-10-20',end:'2026-10-21',reason:'No'}}).ok,false);assert.equal(b.call('deleteLeave',{id:'lv'}).ok,false);}
 for(const status of ['Approved','Rejected']){const b=backend('e@company.test');b.sheets.leaves[1][6]=status;assert.equal(b.call('deleteLeave',{id:'lv'}).ok,false);assert.equal(b.call('editLeave',{id:'lv',record:{type:'Sick',start:'2026-10-20',end:'2026-10-21',reason:'No'}}).ok,false);}
});
test('employee deletes own pending leave and deletion is audited',()=>{
 const b=backend('e@company.test');assert.equal(b.call('deleteLeave',{id:'lv'}).ok,true);assert.equal(b.sheets.leaves.length,1);assert.equal(b.sheets.audit.at(-1)[2],'deleteLeave');assert.equal(b.call('deleteLeave',{id:'lv'}).ok,false);
});
