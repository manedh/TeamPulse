import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backend,password} from './helpers/backend.mjs';
const append=(b,collection,record)=>b.sheets[collection].push(b.sheets[collection][0].map(key=>record[key]??''));
for(const email of ['admin@company.test','h@company.test'])test(email+' deletes employee profile and login rows while preserving history',()=>{
 const b=backend(email);const login=b.call('login',{email:'e@company.test',password});assert.equal(login.ok,true);const employeeToken=login.data.token;
 append(b,'attendance',{id:'at-e',employeeId:'e',date:'2026-10-14'});append(b,'worklogs',{id:'w-e',employeeId:'e',summary:'History'});append(b,'accessEvents',{id:'location-e',employeeId:'e',action:'punchIn'});
 const historical=JSON.stringify([b.sheets.attendance,b.sheets.worklogs,b.sheets.leaves,b.sheets.accessEvents]);
 assert.equal(b.call('deleteEmployeeAccount',{id:'e',confirmPermanent:true}).ok,false);
 assert.equal(b.call('updateRecord',{collection:'tasks',id:'t',record:{description:'Keep shared work',assignee:'a',priority:'Medium'}}).ok,true);
 const preview=b.call('employeeDeletionPreview',{id:'e'});assert.equal(preview.ok,true);assert.equal(preview.data.canDelete,true);assert.equal('passwordHash' in preview.data,false);
 const result=b.call('deleteEmployeeAccount',{id:'e',confirmPermanent:true});assert.equal(result.ok,true,result.error);
 for(const collection of ['employees','credentials','sessions']){const column=b.sheets[collection][0].indexOf(collection==='employees'?'id':'employeeId');assert.equal(b.sheets[collection].slice(1).some(row=>row[column]==='e'),false,collection);}
 assert.equal(JSON.stringify([b.sheets.attendance,b.sheets.worklogs,b.sheets.leaves,b.sheets.accessEvents]),historical);
 assert.equal(b.call('bootstrap',{},employeeToken).code,'UNAUTHENTICATED');assert.equal(b.call('checkAccount',{email:'e@company.test'}).data.continue,true);assert.equal(result.data.db.employees.some(person=>person.id==='e'),false);assert.equal(b.sheets.audit.at(-1)[2],'deleteEmployeeAccount');
});
test('deletion preview blocks shared work and does not change any Sheet data',()=>{
 const b=backend();const before=JSON.stringify(b.sheets);const leader=b.call('employeeDeletionPreview',{id:'l'});assert.equal(leader.ok,true);assert.equal(leader.data.counts.projects,1);assert.equal(leader.data.canDelete,false);assert.equal(JSON.stringify(b.sheets),before);
 assert.equal(b.call('deleteEmployeeAccount',{id:'l',confirmPermanent:true}).ok,false);assert.equal(JSON.stringify(b.sheets),before);
});
test('account deletion requires explicit confirmation and respects HR, self and role restrictions',()=>{
 for(const [email,id,confirmed]of [['admin@company.test','e',false],['admin@company.test','a',true],['h@company.test','a',true],['h@company.test','h',true],['e@company.test','x',true],['l@company.test','e',true]]){const b=backend(email),before=JSON.stringify(b.sheets);assert.equal(b.call('deleteEmployeeAccount',{id,confirmPermanent:confirmed}).ok,false);assert.equal(JSON.stringify(b.sheets),before);}
});
test('previously soft-deleted accounts can be physically removed after shared work is reassigned',()=>{
 const b=backend();assert.equal(b.call('deleteEmployee',{id:'e'}).ok,true);assert.equal(b.call('updateRecord',{collection:'tasks',id:'t',record:{description:'Keep shared work',assignee:'a',priority:'Medium'}}).ok,true);assert.equal(b.call('deleteEmployeeAccount',{id:'e',confirmPermanent:true}).ok,true);assert.equal(b.sheets.employees.some(row=>row[0]==='e'),false);
});
