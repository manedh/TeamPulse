import assert from 'node:assert/strict';
import {password} from './backend.mjs';

export const roles=[
 {name:'Employee',prefix:'EMP',email:'e@company.test',id:'e'},
 {name:'Admin',prefix:'ADM',email:'admin@company.test',id:'a'},
 {name:'Team Leader',prefix:'TL',email:'l@company.test',id:'l'},
 {name:'HR',prefix:'HR',email:'h@company.test',id:'h'}
];
const ok=r=>{assert.equal(r.ok,true,r.error);return r.data;};
const rows=(b,k)=>b.sheets[k].slice(1).map(r=>Object.fromEntries(b.sheets[k][0].map((h,i)=>[h,r[i]])));
const denied=(b,action,payload)=>{const before=JSON.stringify(b.sheets);assert.equal(b.call(action,payload).ok,false);assert.equal(JSON.stringify(b.sheets),before,'Rejected action must not alter stored records');};
const create=(b,collection,record)=>b.call('create',{collection,record});
const person=role=>({name:'New Person',email:'new@company.test',role,department:'IT',designation:'Developer'});
const project=owner=>({name:'New Project',description:'Delivery',department:'IT',owner,status:'Planning',due:'2026-11-01'});
const task=projectId=>({title:'New Task',description:'Instructions and expected result',projectId,assignee:'e',priority:'High',status:'To do',due:'2026-11-01'});
const c=(title,steps,expected,run)=>({title,steps,expected,run});
export function casesFor(role){
 const common=[
 c('Valid login', 'Log in with the seeded active account and valid password.', 'Session issued; returned user has the correct role; stored token is hashed.',b=>{const r=ok(b.call('login',{email:role.email,password},''));assert.equal(r.user.role,role.name);assert.ok(r.token);assert.notEqual(rows(b,'sessions').at(-1).tokenHash,r.token);}),
 c('Invalid password', 'Log in with an incorrect password.', 'Login rejected; no session created.',b=>{const before=b.sheets.sessions.length;assert.equal(b.call('login',{email:role.email,password:'Incorrect password 2026!'},'').ok,false);assert.equal(b.sheets.sessions.length,before);}),
 c('Private authentication records', 'Load the authenticated workspace.', 'Correct identity; credentials, sessions and audit tables are absent.',b=>{const r=ok(b.call('bootstrap'));assert.equal(r.user.id,role.id);for(const k of ['credentials','sessions','audit'])assert.equal(r.db[k],undefined);}),
 c('Personal attendance with location', 'Punch in with required coordinates, reject duplicate, then punch out.', 'One completed personal attendance record, two saved location events; duplicate changes nothing.',b=>{const point={status:'captured',latitude:28.6,longitude:77.2,accuracy:20};const payload={compact:true,requireLocation:true,location:point};const start=ok(b.call('attendance',{...payload,kind:'in',employeeId:'x'}));assert.equal(start.attendance.employeeId,role.id);denied(b,'attendance',{...payload,kind:'in'});ok(b.call('attendance',{...payload,kind:'out',attendanceId:start.attendance.id}));const saved=rows(b,'attendance');assert.equal(saved.length,1);assert.ok(saved[0].checkOut);const events=rows(b,'accessEvents');assert.equal(events.length,2);assert.ok(events.every(e=>e.employeeId===role.id&&e.latitude===point.latitude));}),
 c('Work log ownership', 'Create a work log while supplying another employee ID.', 'Saved work log belongs to the authenticated user.',b=>{ok(create(b,'worklogs',{date:'2026-10-14',summary:'Role test work',hours:'2',blockers:'',employeeId:'x'}));assert.equal(rows(b,'worklogs').at(-1).employeeId,role.id);}),
 c('Logout revokes access', 'Log out, then reuse the same session to load the workspace.', 'Logout succeeds; reused session returns UNAUTHENTICATED.',b=>{ok(b.call('logout'));assert.equal(b.call('bootstrap').code,'UNAUTHENTICATED');})
 ];
 const specific={
 Employee:[
 c('Personal data scope','Load workspace containing two projects and tasks for different employees.','Only own employee profile, assigned task and associated project are returned.',b=>{const db=ok(b.call('bootstrap')).db;assert.deepEqual(Array.from(db.employees,e=>e.id),['e']);assert.deepEqual(Array.from(db.tasks,t=>t.id),['t']);assert.deepEqual(Array.from(db.projects,p=>p.id),['p']);}),
 c('Assigned task permissions','Complete own task, then try to change an unrelated task.','Own task saved and audited; unrelated task remains unchanged.',b=>{ok(b.call('taskStatus',{id:'t',status:'Done'}));assert.equal(rows(b,'tasks').find(t=>t.id==='t').status,'Completed');assert.equal(rows(b,'audit').at(-1).actor,'e');denied(b,'taskStatus',{id:'v',status:'Done'});}),
 c('Employee administration denied','Try to promote another employee and create an Admin account.','Both operations rejected without changing stored records.',b=>{denied(b,'employeeAccess',{id:'x',role:'Admin',status:'Active'});denied(b,'create',{collection:'employees',record:person('Admin')});}),
 c('Leave request and review boundary','Submit personal leave with forged owner and Approved status, then try reviewing existing leave.','Leave saved as own Pending request; review rejected.',b=>{ok(create(b,'leaves',{type:'Casual',start:'2026-11-02',end:'2026-11-03',reason:'Personal',employeeId:'x',status:'Approved'}));const leave=rows(b,'leaves').at(-1);assert.equal(leave.employeeId,'e');assert.equal(leave.status,'Pending');denied(b,'leaveDecision',{id:'lv',status:'Approved'});})
 ],
 Admin:[
 c('Organization visibility','Load workspace.','All five employee profiles and both projects/tasks returned.',b=>{const db=ok(b.call('bootstrap')).db;assert.equal(db.employees.length,5);assert.equal(db.projects.length,2);assert.equal(db.tasks.length,2);}),
 c('Grant privileged access','Promote Employee to HR.','Employee role changes to HR and the actor is audited.',b=>{ok(b.call('employeeAccess',{id:'e',role:'HR',status:'Active'}));assert.equal(rows(b,'employees').find(e=>e.id==='e').role,'HR');assert.equal(rows(b,'audit').at(-1).actor,'a');}),
 c('Create project and task','Create project for Team Leader, then a linked task.','Both records persist with the correct project association.',b=>{ok(create(b,'projects',project('l')));const id=rows(b,'projects').at(-1).id;ok(create(b,'tasks',task(id)));assert.equal(rows(b,'tasks').at(-1).projectId,id);}),
 c('Leave review cannot be repeated','Approve pending employee leave, then attempt rejection of the same leave.','Approval and reviewer persist; repeat review rejected without changes.',b=>{ok(b.call('leaveDecision',{id:'lv',status:'Approved'}));const leave=rows(b,'leaves').find(l=>l.id==='lv');assert.equal(leave.status,'Approved');assert.equal(leave.reviewer,'a');denied(b,'leaveDecision',{id:'lv',status:'Rejected',rejectionReason:'Coverage unavailable'});})
 ],
 'Team Leader':[
 c('Owned project scope','Load workspace with owned and unrelated projects.','Only owned project, its task, leader and assigned employee returned.',b=>{const db=ok(b.call('bootstrap')).db;assert.deepEqual(Array.from(db.projects,p=>p.id),['p']);assert.deepEqual(Array.from(db.tasks,t=>t.id),['t']);assert.deepEqual(Array.from(db.employees,e=>e.id).sort(),['e','l']);}),
 c('Project ownership enforcement','Create own project, then attempt project owned by Admin.','Own project persists; other-owner creation rejected without changes.',b=>{ok(create(b,'projects',project('l')));assert.equal(rows(b,'projects').at(-1).owner,'l');denied(b,'create',{collection:'projects',record:project('a')});}),
 c('Task creation scope','Create task in owned project, then attempt task in unrelated project.','Owned task persists; unrelated task creation rejected without changes.',b=>{ok(create(b,'tasks',task('p')));assert.equal(rows(b,'tasks').at(-1).projectId,'p');denied(b,'create',{collection:'tasks',record:task('q')});}),
 c('Administrative actions denied','Try approving leave, changing employee access and deleting a project.','All three operations rejected without changes.',b=>{denied(b,'leaveDecision',{id:'lv',status:'Approved'});denied(b,'employeeAccess',{id:'e',role:'Team Leader',status:'Active'});denied(b,'deleteProject',{id:'p'});})
 ],
 HR:[
 c('Organization visibility','Load workspace.','All five employee profiles and both projects/tasks returned.',b=>{const db=ok(b.call('bootstrap')).db;assert.equal(db.employees.length,5);assert.equal(db.projects.length,2);assert.equal(db.tasks.length,2);}),
 c('Approve account and grant Team Leader','Mark an Employee Pending, then approve and assign Team Leader.','Employee becomes Active Team Leader; change is audited to HR.',b=>{b.sheets.employees.find(e=>e[0]==='e')[6]='Pending';ok(b.call('employeeAccess',{id:'e',role:'Team Leader',status:'Active'}));const e=rows(b,'employees').find(e=>e.id==='e');assert.equal(e.role,'Team Leader');assert.equal(e.status,'Active');assert.equal(rows(b,'audit').at(-1).actor,'h');}),
 c('Privileged access boundary','Try granting Admin, modifying existing Admin and creating HR account.','All operations rejected without changes.',b=>{denied(b,'employeeAccess',{id:'e',role:'Admin',status:'Active'});denied(b,'employeeAccess',{id:'a',role:'Employee',status:'Inactive'});denied(b,'create',{collection:'employees',record:person('HR')});}),
 c('Review leave and publish notice','Reject pending employee leave, create notice, then delete that notice.','Rejection records HR reviewer; notice is created and then removed.',b=>{ok(b.call('leaveDecision',{id:'lv',status:'Rejected',rejectionReason:'Coverage unavailable'}));const leave=rows(b,'leaves').find(l=>l.id==='lv');assert.equal(leave.status,'Rejected');assert.equal(leave.reviewer,'h');ok(create(b,'announcements',{title:'HR notice',message:'Team update'}));const id=rows(b,'announcements').at(-1).id;ok(b.call('deleteAnnouncement',{id}));assert.equal(rows(b,'announcements').length,0);})
 ]
 };
 return [...common,...specific[role.name]].map((entry,i)=>({...entry,id:`${role.prefix}-${String(i+1).padStart(2,'0')}`}));
}
