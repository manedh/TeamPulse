import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {backend,password} from './helpers/backend.mjs';
import {totalLeaveDays,leaveOverlaps,leaveUnits,defaultLeavePolicy,groupRequestMembers} from '../src/utils/leaves.js';
const record=(more={})=>({type:'Casual',start:'2026-11-02',end:'2026-11-06',duration:'Full day',half:'',reason:'Family commitment',...more});
const created=b=>b.call('create',{collection:'leaves',record:record()});
const policy={workingDays:[1,2,3,4,5],holidays:['2026-11-04'],approverId:'l'};
test('calendar excludes configured non-working days and holidays, including half days',()=>{
 assert.equal(totalLeaveDays(record(),policy),4);assert.equal(totalLeaveDays(record({start:'2026-11-06',end:'2026-11-09'})),3);
 assert.equal(totalLeaveDays(record({end:'2026-11-02',duration:'Half day',half:'Second half'})),0.5);
 assert.equal(totalLeaveDays(record({start:'2026-11-08',end:'2026-11-08'})),0);
 assert.equal(totalLeaveDays(record({start:'2026-11-04',end:'2026-11-04',duration:'Half day',half:'First half'}),policy),0);
 assert.equal(totalLeaveDays(record({end:'2026-11-03',duration:'Half day',half:'First half'})),0);
 assert.equal(totalLeaveDays(record({end:'2036-11-03'})),0);
});
test('calendar uses configured work week and matches the backend calculation',()=>{
 const b=backend();b.ctx.input=record({start:'2026-11-01',end:'2026-11-08'});b.ctx.policy={workingDays:[0,1,2,3,4],holidays:['2026-11-02']};assert.equal(vm.runInContext('totalLeaveDays(input,policy)',b.ctx),totalLeaveDays(b.ctx.input,b.ctx.policy));assert.equal(totalLeaveDays(b.ctx.input,b.ctx.policy),5);
});
test('half-day overlap permits opposite halves but blocks the same half or full-day overlap',()=>{
 const first=record({end:'2026-11-02',duration:'Half day',half:'First half'}),second={...first,half:'Second half'};
 assert.equal(leaveOverlaps(first,second),false);assert.equal(leaveOverlaps(first,first),true);assert.equal(leaveOverlaps(first,record()),true);assert.equal(leaveUnits(first)[0].mask,1);
 const b=backend('e@company.test');for(const r of [first,second])assert.equal(b.call('create',{collection:'leaves',record:r}).ok,true);assert.equal(b.call('create',{collection:'leaves',record:first}).ok,false);assert.equal(b.sheets.leaves.length,4);
});
test('server calculates totals and ownership, ignores forged approval and approver fields',()=>{
 const b=backend('e@company.test');const result=b.call('create',{collection:'leaves',record:record({totalDays:'999',employeeId:'x',status:'Approved',approverId:'e',rejectionReason:'spoof'})});assert.equal(result.ok,true,result.error);const leave=result.data.db.leaves.at(-1);assert.equal(leave.employeeId,'e');assert.equal(leave.status,'Pending');assert.equal(leave.totalDays,'5');assert.equal(leave.approverId,'h');assert.equal(leave.rejectionReason,'');
});
test('all leave types are supported and invalid duration or non-working-only requests are rejected',()=>{
 for(const type of ['Casual','Sick','Earned/Annual','Earned','Unpaid','Other','Work from home (WFH)']){const b=backend('e@company.test');assert.equal(b.call('create',{collection:'leaves',record:record({type})}).ok,true,type);}
 for(const invalid of [{type:'Unknown'},{duration:'Quarter day'},{duration:'Half day',half:'First half'},{end:'2026-11-02',duration:'Half day',half:''},{start:'2026-11-08',end:'2026-11-08'},{start:'2026-02-30',end:'2026-03-02'}]){const b=backend('e@company.test');assert.equal(b.call('create',{collection:'leaves',record:record(invalid)}).ok,false,JSON.stringify(invalid));}
});
test('leave settings validate roles, holidays, working days and eligible approvers',()=>{
 assert.equal(backend('e@company.test').call('saveLeavePolicy',{policy}).ok,false);assert.equal(backend('l@company.test').call('saveLeavePolicy',{policy}).ok,false);
 for(const invalid of [{...policy,workingDays:[]},{...policy,workingDays:[1,1]},{...policy,holidays:['2026-02-30']},{...policy,approverId:'e'}])assert.equal(backend().call('saveLeavePolicy',{policy:invalid}).ok,false);
 const b=backend();const result=b.call('saveLeavePolicy',{policy});assert.equal(result.ok,true,result.error);assert.deepEqual(JSON.parse(b.sheets.settings.find(row=>row[0]==='leavePolicy')[1]),policy);
});
test('designated team leader receives requests and can decide them; unrelated reviewers cannot',()=>{
 const b=backend('e@company.test');b.properties.LEAVE_POLICY=JSON.stringify(policy);const result=created(b);assert.equal(result.ok,true,result.error);const leave=result.data.db.leaves.at(-1);assert.equal(leave.totalDays,'4');assert.equal(leave.approverId,'l');
 const leader=b.call('login',{email:'l@company.test',password},'').data.token;const hr=b.call('login',{email:'h@company.test',password},'').data.token;
 assert.ok(b.call('bootstrap',{},leader).data.db.leaves.some(l=>l.id===leave.id));assert.equal(b.call('leaveDecision',{id:leave.id,status:'Approved'},leader).ok,true);assert.equal(b.call('leaveDecision',{id:leave.id,status:'Rejected',rejectionReason:'Late'},leader).ok,false);
});
test('rejection requires a valid reason, persists it, and locks employee edits',()=>{
 const b=backend('e@company.test'),result=created(b),id=result.data.db.leaves.at(-1).id,hr=b.call('login',{email:'h@company.test',password},'').data.token;
 for(const rejectionReason of [undefined,'   ','x'.repeat(1001),{}])assert.equal(b.call('leaveDecision',{id,status:'Rejected',rejectionReason},hr).ok,false);
 const rejected=b.call('leaveDecision',{id,status:'Rejected',rejectionReason:'  Team coverage needed  '},hr);assert.equal(rejected.ok,true,rejected.error);assert.equal(rejected.data.db.leaves.find(l=>l.id===id).rejectionReason,'Team coverage needed');assert.equal(b.call('editLeave',{id,record:record()}).ok,false);assert.equal(b.call('deleteLeave',{id}).ok,false);
});
test('pending edits recalculate days, preserve assigned approver and prevent total spoofing',()=>{
 const b=backend('e@company.test'),id=created(b).data.db.leaves.at(-1).id;b.properties.LEAVE_POLICY=JSON.stringify(policy);
 const result=b.call('editLeave',{id,record:record({end:'2026-11-02',duration:'Half day',half:'First half'})});assert.equal(result.ok,true,result.error);const leave=result.data.db.leaves.at(-1);assert.equal(leave.totalDays,'0.5');assert.equal(leave.approverId,'h');assert.equal(b.call('editLeave',{id,record:record({totalDays:'99'})}).ok,false);assert.equal(b.call('deleteLeave',{id}).ok,true);
});
test('self-approval is prevented by assigning another approver',()=>{
 const b=backend('h@company.test');b.properties.LEAVE_POLICY=JSON.stringify({...policy,approverId:'h'});const result=created(b);assert.equal(result.ok,true,result.error);assert.equal(result.data.db.leaves.at(-1).approverId,'a');assert.equal(b.call('leaveDecision',{id:result.data.db.leaves.at(-1).id,status:'Approved'}).ok,false);
});
test('legacy leave sheets remain readable and migrate on write while preserving extra columns',()=>{
 const b=backend('e@company.test');b.sheets.leaves[0]=b.sheets.leaves[0].slice(0,9).concat('customNote');b.sheets.leaves[1]=b.sheets.leaves[1].slice(0,9);b.sheets.leaves[1][9]='Keep original';
 const before=JSON.stringify(b.sheets.leaves);assert.equal(b.call('bootstrap').ok,true);assert.equal(JSON.stringify(b.sheets.leaves),before);
 const result=b.call('editLeave',{id:'lv',record:record()});assert.equal(result.ok,true,result.error);assert.equal(b.sheets.leaves[0][9],'customNote');assert.equal(b.sheets.leaves[1][9],'Keep original');assert.equal(b.sheets.leaves[1][b.sheets.leaves[0].indexOf('duration')],'Full day');assert.equal(b.sheets.leaves[1][b.sheets.leaves[0].indexOf('totalDays')],'5');
});

test('Monday through Saturday is the default work week, with Sunday excluded',()=>{assert.deepEqual(defaultLeavePolicy.workingDays,[1,2,3,4,5,6]);assert.equal(totalLeaveDays(record({start:'2026-11-07',end:'2026-11-07'})),1);assert.equal(totalLeaveDays(record({start:'2026-11-08',end:'2026-11-08'})),0);});

test('overlap checks ignore shared non-working days',()=>{assert.equal(leaveOverlaps(record({start:'2026-11-07',end:'2026-11-08'}),record({start:'2026-11-08',end:'2026-11-09'})),false);});


test('WFH requests support half days, editing, approval and conflict checks with leave',()=>{
 const b=backend('e@company.test');
 const request=record({type:'Work from home (WFH)',end:'2026-11-02',duration:'Half day',half:'First half'});
 const result=b.call('create',{collection:'leaves',record:request});assert.equal(result.ok,true,result.error);
 const saved=result.data.db.leaves.at(-1);assert.equal(saved.type,request.type);assert.equal(saved.totalDays,'0.5');assert.equal(saved.status,'Pending');
 assert.equal(b.call('create',{collection:'leaves',record:record({end:'2026-11-02'})}).ok,false);
 const edited=b.call('editLeave',{id:saved.id,record:{...request,reason:'Working remotely'}});assert.equal(edited.ok,true,edited.error);
 const hr=b.call('login',{email:'h@company.test',password},'').data.token;
 const approved=b.call('leaveDecision',{id:saved.id,status:'Approved'},hr);assert.equal(approved.ok,true,approved.error);
 assert.equal(approved.data.db.leaves.find(row=>row.id===saved.id).status,'Approved');
 assert.equal(b.call('editLeave',{id:saved.id,record:request}).ok,false);
});

test('leader submits a group for active team members with shared ID and independent approval',()=>{
 const b=backend('l@company.test');b.properties.LEAVE_POLICY=JSON.stringify({...policy,approverId:'l'});
 const result=b.call('createGroupLeave',{employeeIds:['l','e'],record:record({type:'Work from home (WFH)'})});
 assert.equal(result.ok,true,result.error);const requests=result.data.db.leaves.filter(r=>r.submittedBy==='l');
 assert.equal(requests.length,2);assert.equal(requests[0].groupId,requests[1].groupId);assert.ok(requests[0].groupId);
 for(const r of requests){assert.equal(r.approverId,'h');assert.equal(r.status,'Pending');assert.equal(b.call('leaveDecision',{id:r.id,status:'Approved'}).ok,false);}
 const employee=b.call('login',{email:'e@company.test',password},'').data.token;
 assert.ok(b.call('bootstrap',{},employee).data.db.leaves.some(r=>r.id===requests.find(r=>r.employeeId==='e').id));
 const hr=b.call('login',{email:'h@company.test',password},'').data.token;
 assert.equal(b.call('leaveDecision',{id:requests[0].id,status:'Approved'},hr).ok,true);
});
test('group requests reject unknown, duplicate, inactive members and unauthorized roles without writes',()=>{
 for(const ids of [[],['unknown'],['e','e'],['e','missing']]){const b=backend('l@company.test');const before=b.sheets.leaves.length;assert.equal(b.call('createGroupLeave',{employeeIds:ids,record:record()}).ok,false);assert.equal(b.sheets.leaves.length,before);}
 for(const email of ['e@company.test','h@company.test'])assert.equal(backend(email).call('createGroupLeave',{employeeIds:['e'],record:record()}).ok,false);
 const b=backend('l@company.test');b.sheets.employees.find(r=>r[0]==='e')[b.sheets.employees[0].indexOf('status')]='Inactive';assert.equal(b.call('createGroupLeave',{employeeIds:['e'],record:record()}).ok,false);
});
test('group validates all members before saving and exposes only eligible team choices',()=>{
 const b=backend('l@company.test');const db=b.call('bootstrap').data.db;
 assert.deepEqual(Array.from(db.leaveRequestMembers,r=>r.id).sort(),['a','e','h','l','x']);
 const employee=b.call('login',{email:'e@company.test',password},'').data.token;
 assert.equal(b.call('create',{collection:'leaves',record:record()},employee).ok,true);
 const before=b.sheets.leaves.length;const result=b.call('createGroupLeave',{employeeIds:['l','e'],record:record()});
 assert.equal(result.ok,false);assert.match(result.error,/overlaps/);assert.equal(b.sheets.leaves.length,before);
});

test('Admin and Team Leader can request leave for all active members including unassigned employees',()=>{
 for(const email of ['admin@company.test','l@company.test']){
 const b=backend(email),members=b.call('bootstrap').data.db.leaveRequestMembers;
 assert.deepEqual(Array.from(members,m=>m.id).sort(),['a','e','h','l','x']);
 const result=b.call('createGroupLeave',{employeeIds:Array.from(members,m=>m.id),record:record()});
 assert.equal(result.ok,true,result.error);const requests=result.data.db.leaves.filter(r=>r.groupId);
 assert.equal(requests.length,5);for(const r of requests){assert.notEqual(r.approverId,r.submittedBy);assert.notEqual(r.approverId,r.employeeId);}
 }
});

test('leave settings persist in Sheets, override legacy properties, and do not expose raw settings',()=>{
 const b=backend();delete b.sheets.settings;b.properties.LEAVE_POLICY=JSON.stringify({...policy,holidays:[]});
 assert.equal(b.call('bootstrap').data.db.leavePolicy.holidays.length,0);
 let result=b.call('saveLeavePolicy',{policy});assert.equal(result.ok,true,result.error);
 assert.deepEqual(JSON.parse(b.sheets.settings[1][1]),policy);assert.equal(b.sheets.settings[1][3],'a');
 const changed={...policy,holidays:['2026-11-05']};result=b.call('saveLeavePolicy',{policy:changed});assert.equal(result.ok,true,result.error);
 assert.equal(b.sheets.settings.length,2);assert.deepEqual(JSON.parse(b.sheets.settings[1][1]),changed);
 assert.equal(result.data.db.settings,undefined);assert.deepEqual(JSON.parse(JSON.stringify(b.call('bootstrap').data.db.leavePolicy)),changed);
});

test('group employee names use the full active directory when the group list is missing or empty',()=>{
 const db={employees:[{id:'l',name:'Leader',status:'Active'},{id:'off',name:'Inactive',status:'Inactive'}],taskAssignees:[{id:'z',name:'Zoya'},{id:'a',name:'Amit'}],leaveRequestMembers:[]};
 assert.deepEqual(groupRequestMembers(db,{role:'Team Leader'}).map(m=>m.name),['Amit','Leader','Zoya']);
 assert.deepEqual(groupRequestMembers({...db,leaveRequestMembers:[{id:'a',name:'Amit'}]},{role:'Admin'}).map(m=>m.id),['a','l','z']);
 assert.deepEqual(groupRequestMembers(db,{role:'Employee'}),[]);
});

test('Admin and HR can review leave and WFH assigned to another approver',()=>{for(const email of ['admin@company.test','h@company.test'])for(const type of ['Casual','Work from home (WFH)']){const b=backend(email);const row=b.sheets.leaves[1],headers=b.sheets.leaves[0];row[headers.indexOf('approverId')]='l';row[headers.indexOf('type')]=type;const r=b.call('leaveDecision',{id:'lv',status:'Approved'});assert.equal(r.ok,true,r.error);assert.equal(r.data.db.leaves.find(l=>l.id==='lv').status,'Approved');}});
