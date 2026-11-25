import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canEditRecord,canDeleteRecord,istDateTimeInput,attendanceFormRecord} from '../src/utils/records.js';
const db={projects:[{id:'p',owner:'leader'},{id:'q',owner:'other'}]};
test('CRUD controls follow the same ownership rules as the backend',()=>{
 const employee={id:'employee',role:'Employee'},leader={id:'leader',role:'Team Leader'},hr={id:'hr',role:'HR'},admin={id:'admin',role:'Admin'};
 assert.equal(canEditRecord('tasks',{projectId:'p'},employee,db),false);
 assert.equal(canEditRecord('tasks',{projectId:'p'},leader,db),true);
 assert.equal(canDeleteRecord('tasks',{projectId:'q'},leader,db),false);
 assert.equal(canEditRecord('worklogs',{employeeId:'employee'},employee,db),true);
 assert.equal(canDeleteRecord('worklogs',{employeeId:'other'},employee,db),false);
 assert.equal(canEditRecord('employees',{id:'admin',role:'Admin',status:'Active'},hr,db),false);
 assert.equal(canEditRecord('employees',{id:'employee',role:'Employee',status:'Deleted'},admin,db),false);
 assert.equal(canEditRecord('employees',{id:'hr',role:'HR',status:'Active'},hr,db),true);
 assert.equal(canDeleteRecord('attendance',{},employee,db),false);
 assert.equal(canDeleteRecord('attendance',{},hr,db),true);
 assert.equal(canEditRecord('announcements',{},admin,db),true);
 assert.equal(canDeleteRecord('employees',{},admin,db),false);
});
test('attendance editor uses IST independent of the device timezone',()=>{
 assert.equal(istDateTimeInput('2026-10-14T03:30:45.000Z'),'2026-10-14T09:00:45');
 const saved=attendanceFormRecord({employeeId:'e',date:'2026-10-14',checkIn:'2026-10-14T09:00:45',checkOut:'2026-10-14T17:00'});
 assert.equal(saved.checkIn,'2026-10-14T03:30:45.000Z');assert.equal(saved.checkOut,'2026-10-14T11:30:00.000Z');assert.equal(saved.employeeId,'e');
});
