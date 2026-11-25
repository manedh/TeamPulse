import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceNotifications} from '../src/utils/notifications.js';
const empty=()=>({employees:[],projects:[],tasks:[],leaves:[],announcements:[],attendance:[],worklogs:[]});
const user={id:'e1',role:'Employee'};
test('assignments and leave decisions link to the relevant modules',()=>{
 const before=empty();before.leaves=[{id:'l1',employeeId:'e1',status:'Pending'}];
 const after={...before,tasks:[{id:'t1',assignee:'e1',title:'Build app',status:'To do'}],projects:[{id:'p1',owner:'e1',name:'Launch'}],leaves:[{id:'l1',employeeId:'e1',status:'Approved',start:'2026-10-28',end:'2026-10-29'}]};
 const events=workspaceNotifications(before,after,user);
 assert.ok(events.some(e=>e.page==='Tasks'&&e.message.includes('to you')));
 assert.ok(events.some(e=>e.page==='Projects'&&e.message.includes('Launch')));
 assert.ok(events.some(e=>e.page==='Leave requests'&&e.message.includes('Your leave was approved')));
 assert.deepEqual(workspaceNotifications(after,after,user),[]);
});
test('initial inbox avoids historical attendance and work log pop-ups',()=>{
 const db={...empty(),attendance:[{id:'a1',employeeId:'e1',date:'2026-10-28'}],worklogs:[{id:'w1',employeeId:'e1',date:'2026-10-28'}],employees:[{id:'e1',name:'Me',status:'Active'}]};
 assert.deepEqual(workspaceNotifications(null,db,user),[]);
 assert.equal(workspaceNotifications(empty(),db,user).length,2);
});
test('leave requests alert reviewers and decisions stay scoped to their employee',()=>{
 const db={...empty(),leaves:[{id:'l1',employeeId:'e2',type:'Sick',status:'Pending'}]};
 assert.equal(workspaceNotifications(empty(),db,user).length,0);
 assert.equal(workspaceNotifications(empty(),db,{id:'admin',role:'HR'}).length,1);
 db.leaves[0].status='Rejected';
 assert.equal(workspaceNotifications(empty(),db,user).length,0);
});
test('announcements, account changes, task status and punch out generate updates',()=>{
 const before={...empty(),employees:[{id:'e1',name:'Me',role:'Employee',status:'Pending'}],tasks:[{id:'t1',status:'To do',title:'Build'}],attendance:[{id:'a1',employeeId:'e1',checkIn:'in',checkOut:''}]};
 const after={...before,employees:[{...before.employees[0],status:'Active'}],tasks:[{...before.tasks[0],status:'Done'}],attendance:[{...before.attendance[0],checkOut:'out'}],announcements:[{id:'n1',title:'Welcome'}]};
 assert.equal(workspaceNotifications(before,after,user).length,4);
});

test('module edits and removals are included in update notifications',()=>{
 const before={...empty(),projects:[{id:'p',name:'Launch',status:'Planning',due:'2026-10-28'}],worklogs:[{id:'w',employeeId:'e1',summary:'Before',hours:2}],tasks:[{id:'t',title:'Old task',assignee:'e1',status:'To do'}]};
 const after={...before,projects:[{...before.projects[0],due:'2026-10-30'}],worklogs:[{...before.worklogs[0],summary:'After'}],tasks:[]};
 const events=workspaceNotifications(before,after,user);
 assert.equal(events.length,2);assert.ok(events.every(event=>event.page!=='Work logs'));assert.ok(events.some(event=>event.page==='Tasks'&&event.message.includes('no longer')));
});

test('retired work logs never generate add, edit or removal alerts',()=>{
 const before={...empty(),worklogs:[{id:'w',summary:'Before'}]};
 const after={...empty(),worklogs:[{id:'w',summary:'After'},{id:'new'}]};
 assert.deepEqual(workspaceNotifications(before,after,user),[]);
 assert.deepEqual(workspaceNotifications(after,empty(),user),[]);
});
