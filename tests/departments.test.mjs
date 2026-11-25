import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {backend} from './helpers/backend.mjs';
import {departments,matchDepartment,suggestDepartment,departmentAssignments} from '../src/data/departments.js';
test('department dropdown and backend accept exactly the same values',()=>{
 const b=backend();assert.deepEqual(Array.from(vm.runInContext('departmentOptions_()',b.ctx)),departments);
});
test('department matching handles case, punctuation, aliases and the AL/ML spelling',()=>{
 for(const value of ['AI ML','AL/ML DEVELOPER','ai/ml developer','AI/ML Engineer'])assert.equal(matchDepartment(value),'AI/ML Developer');
 assert.equal(matchDepartment(' human resources '),'HR');assert.equal(matchDepartment('Software Engineering'),'Software Developer');
 assert.equal(matchDepartment('Finance and Accounts'),'Finance & Accounts');
 assert.equal(suggestDepartment('IT','Senior Software Engineer'),'Software Developer');
 assert.equal(suggestDepartment('Engineering','AI/ML Developer Intern'),'AI/ML Developer');
 assert.equal(suggestDepartment('HR','Software Engineer'),'HR');
 for(const value of ['IT','Engineering','IT Services','Unclear',''])assert.equal(suggestDepartment(value),'');
});
test('review screen lists only records the signed-in reviewer can assign',()=>{
 const db={employees:[{id:'a',role:'Admin',status:'Active'},{id:'h',role:'HR',status:'Active'},{id:'e',role:'Employee',status:'Active'},{id:'x',role:'Employee',status:'Deleted'}],projects:[{id:'p',name:'Project'}]};
 assert.equal(departmentAssignments(db,{id:'a',role:'Admin'}).length,4);
 assert.equal(departmentAssignments(db,{id:'h',role:'HR'}).length,3);
 assert.equal(departmentAssignments(db,{id:'e',role:'Employee'}).length,0);
});
const assignment=(collection,id,previousDepartment,department)=>({collection,id,previousDepartment,department});
test('department assignments persist to employee and project Sheets without changing other fields',()=>{
 const b=backend();b.sheets.employees.find(row=>row[0]==='e')[4]='AI ML';b.sheets.projects.find(row=>row[0]==='p')[2]='Software Engineering';
 const employeeBefore=[...b.sheets.employees.find(row=>row[0]==='e')];const projectBefore=[...b.sheets.projects.find(row=>row[0]==='p')];
 const result=b.call('assignDepartments',{assignments:[assignment('employees','e','AI ML','AI/ML Developer'),assignment('projects','p','Software Engineering','Software Developer')]});
 assert.equal(result.ok,true,result.error);assert.equal(result.data.updated,2);
 employeeBefore[4]='AI/ML Developer';projectBefore[2]='Software Developer';
 assert.deepEqual(Array.from(b.sheets.employees.find(row=>row[0]==='e')),employeeBefore);assert.deepEqual(Array.from(b.sheets.projects.find(row=>row[0]==='p')),projectBefore);
 const refreshed=b.call('bootstrap');assert.equal(refreshed.data.db.employees.find(row=>row.id==='e').department,'AI/ML Developer');assert.equal(refreshed.data.db.projects.find(row=>row.id==='p').department,'Software Developer');
 assert.equal(b.sheets.audit.at(-1)[2],'assignDepartment:projects');
});
test('bulk validation rejects unknown, stale, duplicate and protected assignments before writing',()=>{
 const cases=[
 [assignment('employees','e','','Invalid Department')],
 [assignment('employees','e','stale','HR')],
 [assignment('employees','e','','HR'),assignment('employees','e','','Software Developer')],
 [assignment('employees','e','','HR'),assignment('employees','missing','','HR')],
 [assignment('employees','e','','HR'),{...assignment('projects','p','','HR'),role:'Admin'}],
 [assignment('attendance','e','','HR')]
 ];
 for(const assignments of cases){const b=backend();const before=JSON.stringify([b.sheets.employees,b.sheets.projects,b.sheets.audit]);assert.equal(b.call('assignDepartments',{assignments}).ok,false);assert.equal(JSON.stringify([b.sheets.employees,b.sheets.projects,b.sheets.audit]),before);}
});
test('department assignment obeys HR privileges and rejects deleted employees and non-reviewers',()=>{
 for(const email of ['e@company.test','l@company.test'])assert.equal(backend(email).call('assignDepartments',{assignments:[assignment('employees','e','','HR')]}).ok,false);
 const hr=backend('h@company.test');assert.equal(hr.call('assignDepartments',{assignments:[assignment('employees','a','','HR')]}).ok,false);
 assert.equal(hr.call('assignDepartments',{assignments:[assignment('employees','h','','HR'),assignment('employees','e','','Software Developer')]}).ok,true);
 const b=backend();b.sheets.employees.find(row=>row[0]==='e')[6]='Deleted';assert.equal(b.call('assignDepartments',{assignments:[assignment('employees','e','','HR')]}).ok,false);
});
test('department assignments have bounded size and are idempotent when nothing changes',()=>{
 const b=backend();assert.equal(b.call('assignDepartments',{assignments:[]}).ok,false);assert.equal(b.call('assignDepartments',{assignments:Array(101).fill(assignment('employees','e','','HR'))}).ok,false);
 assert.equal(b.call('assignDepartments',{assignments:[assignment('employees','e','','HR')]}).ok,true);
 assert.equal(b.call('assignDepartments',{assignments:[assignment('employees','e','HR','HR')]}).data.updated,0);
});
