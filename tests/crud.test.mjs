import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backend,password} from './helpers/backend.mjs';
const records={
 employees:{name:'New Employee',email:'new@company.test',department:'Software Developer',designation:'Developer',role:'Employee'},
 projects:{name:'CRUD Project',description:'Delivery',department:'IT',owner:'l',status:'Planning',due:'2026-11-01'},
 tasks:{title:'CRUD task',description:'Instructions and expected result',projectId:'p',assignee:'e',priority:'High',status:'To do',due:'2026-11-01'},
 worklogs:{date:'2026-10-14',summary:'Implemented feature',hours:'4',blockers:''},
 announcements:{title:'CRUD announcement',message:'Hello team'}
};
const updates={employees:{name:'Updated Employee'},projects:{name:'Updated Project',status:'Completed'},tasks:{title:'Updated Task',assignee:'x',status:'In progress'},worklogs:{summary:'Updated work',hours:'6'},announcements:{message:'Updated notice'}};
for(const collection of Object.keys(records))test(collection+' create, read, update and delete persist to Sheets',()=>{
 const b=backend();const create=b.call('create',{collection,record:records[collection]});assert.equal(create.ok,true,create.error);
 const row=create.data.db[collection].at(-1);const id=row.id;
 const update=b.call('updateRecord',{collection,id,record:updates[collection]});assert.equal(update.ok,true,update.error);
 const after=b.call('bootstrap').data.db[collection].find(item=>item.id===id);
 for(const [key,value]of Object.entries(updates[collection]))assert.equal(String(after[key]),value);
 const headers=b.sheets[collection][0];const stored=b.sheets[collection].find(row=>row[0]===id);
 for(const [key,value]of Object.entries(updates[collection]))assert.equal(String(stored[headers.indexOf(key)]),value);
 const action={employees:'deleteEmployee',projects:'deleteProject',announcements:'deleteAnnouncement'}[collection]||'deleteRecord';
 const deleted=b.call(action,{collection,id});assert.equal(deleted.ok,true,deleted.error);
 const refreshed=b.call('bootstrap').data.db[collection];
 if(collection==='employees'){assert.equal(b.sheets.employees.find(row=>row[0]===id)[6],'Deleted');assert.equal(refreshed.find(row=>row.id===id).status,'Deleted');}
 else{assert.equal(b.sheets[collection].some(row=>row[0]===id),false);assert.equal(refreshed.some(row=>row.id===id),false);}
});
test('employee email edits update the credential login and retain role, status and history',()=>{
 const b=backend();const result=b.call('updateRecord',{collection:'employees',id:'e',record:{name:'Employee Name',email:'renamed@company.test',department:'Engineering',designation:'Developer'}});
 assert.equal(result.ok,true,result.error);assert.equal(b.sheets.credentials.find(row=>row[1]==='e')[2],'renamed@company.test');
 assert.equal(b.call('login',{email:'renamed@company.test',password}).ok,true);assert.equal(b.call('login',{email:'e@company.test',password}).ok,false);
 assert.equal(b.sheets.employees.find(row=>row[0]==='e')[3],'Employee');assert.equal(b.sheets.tasks.find(row=>row[0]==='t')[3],'e');
 assert.equal(b.call('updateRecord',{collection:'employees',id:'e',record:{email:'admin@company.test'}}).ok,false);
});
test('employee, leader and HR edit permissions cannot be bypassed with generic actions',()=>{
 for(const email of ['e@company.test','l@company.test']){
 const b=backend(email);for(const collection of ['employees','announcements','attendance'])assert.equal(b.call('updateRecord',{collection,id:'e',record:{name:'No'}}).ok,false);
 assert.equal(b.call('updateRecord',{collection:'projects',id:'q',record:{name:'No'}}).ok,false);
 assert.equal(b.call('updateRecord',{collection:'tasks',id:'v',record:{title:'No'}}).ok,false);
 assert.equal(b.call('deleteRecord',{collection:'tasks',id:'v'}).ok,false);
 assert.equal(b.call('deleteRecord',{collection:'projects',id:'p'}).ok,false);
 }
 const hr=backend('h@company.test');assert.equal(hr.call('updateRecord',{collection:'employees',id:'a',record:{name:'No'}}).ok,false);
});
test('leaders can edit their project and manage tasks only inside their owned projects',()=>{
 const b=backend('l@company.test');const project=b.call('updateRecord',{collection:'projects',id:'p',record:{...records.projects,name:'Leader project'}});assert.equal(project.ok,true,project.error);
 const task=b.call('updateRecord',{collection:'tasks',id:'t',record:records.tasks});assert.equal(task.ok,true,task.error);
 assert.equal(b.call('updateRecord',{collection:'tasks',id:'t',record:{...records.tasks,projectId:'q'}}).ok,false);
 assert.equal(b.call('updateRecord',{collection:'projects',id:'p',record:{owner:'a'}}).ok,false);
 assert.equal(b.call('deleteRecord',{collection:'tasks',id:'t'}).ok,true);
});
test('owners and Admin can edit work logs without changing their owner',()=>{
 const b=backend('e@company.test');const created=b.call('create',{collection:'worklogs',record:records.worklogs});const id=created.data.db.worklogs[0].id;
 assert.equal(b.call('updateRecord',{collection:'worklogs',id,record:{summary:'My edit'}}).ok,true);
 const admin=b.call('login',{email:'admin@company.test',password}).data.token;
 assert.equal(b.call('updateRecord',{collection:'worklogs',id,record:{hours:'5'}},admin).ok,true);
 assert.equal(b.sheets.worklogs[1][1],'e');
 assert.equal(b.call('updateRecord',{collection:'worklogs',id,record:{employeeId:'x'}}).ok,false);
 const other=b.call('login',{email:'x@company.test',password}).data.token;
 assert.equal(b.call('deleteRecord',{collection:'worklogs',id},other).ok,false);
 assert.equal(b.call('deleteRecord',{collection:'worklogs',id}).ok,true);
});
const attendance={employeeId:'e',date:'2026-10-14',checkIn:'2026-10-14T09:00:00+05:30',checkOut:'2026-10-14T17:00:00+05:30'};
test('attendance additions, corrections and deletes round trip through Sheets and snapshot',()=>{
 const b=backend();const added=b.call('createAttendance',{record:attendance});assert.equal(added.ok,true,added.error);const id=added.data.db.attendance[0].id;
 assert.equal(b.call('createAttendance',{record:attendance}).ok,false);
 const edited=b.call('updateRecord',{collection:'attendance',id,record:{checkOut:'2026-10-14T18:00:00+05:30'}});assert.equal(edited.ok,true,edited.error);
 assert.equal(b.call('attendanceSnapshot').data.attendance[0].checkOut,'2026-10-14T12:30:00.000Z');
 assert.equal(b.call('deleteRecord',{collection:'attendance',id}).ok,true);
 assert.equal(b.sheets.attendance.length,1);assert.equal(b.call('attendanceSnapshot').data.attendance.length,0);
 assert.equal(b.sheets.audit.at(-1)[2],'deleteRecord:attendance');
});
test('attendance corrections reject unauthorized, reversed, future and invalid dates and times',()=>{
 for(const email of ['e@company.test','l@company.test'])assert.equal(backend(email).call('createAttendance',{record:attendance}).ok,false);
 const b=backend();for(const record of [{...attendance,checkOut:''},{...attendance,checkOut:attendance.checkIn},{...attendance,date:'2026-02-30'},{...attendance,checkIn:'not a time'},{...attendance,checkOut:'2099-01-01T09:00:00Z'},{...attendance,date:'2026-10-15'}])assert.equal(b.call('createAttendance',{record}).ok,false);
});
test('updates reject unknown fields and leave the stored row untouched on invalid data',()=>{
 const b=backend();b.call('create',{collection:'tasks',record:records.tasks});const id=b.sheets.tasks.at(-1)[0];const before=JSON.stringify(b.sheets.tasks);
 for(const record of [{id:'forged'},{status:'Invalid'},{assignee:'missing'},{due:'2026-02-30'},{title:''},{priority:'Invalid'}])assert.equal(b.call('updateRecord',{collection:'tasks',id,record}).ok,false);
 assert.equal(JSON.stringify(b.sheets.tasks),before);
 assert.equal(b.call('updateRecord',{collection:'credentials',id:'c-e',record:{passwordHash:'bad'}}).ok,false);
 assert.equal(b.call('deleteRecord',{collection:'tasks',id:'missing'}).ok,false);
});
