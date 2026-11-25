import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backend,password} from './helpers/backend.mjs';
import {taskPriorities,taskStatuses,taskLinks,taskStatus,completedTask} from '../src/utils/tasks.js';
const task=(extra={})=>({title:'New task',description:'Implement and verify the requested change',projectId:'',assignee:'e',priority:'Urgent',due:'',attachments:'[]',...extra});
for(const email of ['admin@company.test','l@company.test'])test(email+' can create the requested task fields with no project or due date',()=>{
 const b=backend(email);const created=b.call('create',{collection:'tasks',record:task()});assert.equal(created.ok,true,created.error);const saved=created.data.db.tasks.at(-1);
 assert.equal(saved.projectId,'');assert.equal(saved.due,'');assert.equal(saved.priority,'Urgent');assert.equal(saved.status,'To do');assert.equal(saved.description,task().description);
 assert.equal(saved.managerId,email.startsWith('admin')?'a':'l');assert.equal(b.sheets.tasks[0].includes('description'),true);
 const refreshed=b.call('bootstrap');assert.ok(refreshed.data.db.tasks.some(row=>row.id===saved.id));
 assert.equal(b.call('updateRecord',{collection:'tasks',id:saved.id,record:{description:'Edited instructions',status:'In review',attachments:JSON.stringify([{type:'link',url:'https://example.com/spec'}])}}).ok,true);
 const row=b.call('bootstrap').data.db.tasks.find(row=>row.id===saved.id);assert.equal(row.status,'In review');assert.equal(JSON.parse(row.attachments)[0].url,'https://example.com/spec');
 assert.equal(b.call('deleteRecord',{collection:'tasks',id:saved.id}).ok,true);assert.equal(b.sheets.tasks.some(row=>row[0]===saved.id),false);
});
test('task fields validate description, all priorities/statuses, optional project/date and links',()=>{
 const b=backend();for(const priority of taskPriorities)for(const status of taskStatuses){const result=b.call('create',{collection:'tasks',record:task({priority,status})});assert.equal(result.ok,true,result.error);}
 for(const fields of [{description:''},{description:' '.repeat(10)},{description:'x'.repeat(4001)},{priority:'Critical'},{status:'Unknown'},{projectId:'missing'},{due:'2026-02-30'},{attachments:JSON.stringify([{type:'link',url:'javascript:alert(1)'}])},{attachments:JSON.stringify([{type:'file',id:'arbitrary-file'}])},{attachments:JSON.stringify(Array(11).fill({type:'link',url:'https://example.com'}))}])assert.equal(b.call('create',{collection:'tasks',record:task(fields)}).ok,false);
});
test('team leaders get employee names for assignment without gaining other private employee records',()=>{
 const b=backend('l@company.test');const state=b.call('bootstrap').data.db;assert.ok(state.taskAssignees.some(person=>person.id==='x'));assert.equal(state.employees.some(person=>person.id==='x'),false);assert.ok(state.taskAssignees.every(person=>Object.keys(person).sort().join(',')==='id,name'));
 assert.equal(b.call('create',{collection:'tasks',record:task({assignee:'x',projectId:'p'})}).ok,true);
 const employee=b.call('login',{email:'e@company.test',password}).data;assert.equal(employee.db.taskAssignees.length,0);
});
test('standalone tasks stay scoped to their manager and assignee',()=>{
 const b=backend('l@company.test');const created=b.call('create',{collection:'tasks',record:task({assignee:'x',managerId:'a'})});assert.equal(created.ok,true,created.error);const id=created.data.db.tasks.at(-1).id;
 assert.equal(created.data.db.tasks.at(-1).managerId,'l');
 const other=b.call('login',{email:'e@company.test',password}).data;assert.equal(other.db.tasks.some(row=>row.id===id),false);
 assert.equal(b.call('taskStatus',{id,status:'Completed'},other.token).ok,false);
 const assignee=b.call('login',{email:'x@company.test',password}).data;assert.equal(assignee.db.tasks.some(row=>row.id===id),true);assert.equal(b.call('taskStatus',{id,status:'Blocked'},assignee.token).ok,true);
 assert.equal(b.call('updateRecord',{collection:'tasks',id,record:{title:'Not allowed'}},assignee.token).ok,false);
 assert.equal(b.call('updateRecord',{collection:'tasks',id,record:{projectId:'q'}}).ok,false);
});
test('legacy task sheets remain readable and migrate on write without changing extra columns',()=>{
 const b=backend();b.sheets.tasks=b.sheets.tasks.map(row=>[...row.slice(0,8),'extra']);b.sheets.tasks[0][8]='Custom column';b.sheets.tasks[1][5]='Done';
 const before=b.sheets.tasks[1].slice(0,8);const read=b.call('bootstrap');assert.equal(read.ok,true,read.error);assert.equal(read.data.db.tasks[0].status,'Completed');assert.equal(b.sheets.tasks[0].length,9);
 assert.equal(b.call('create',{collection:'tasks',record:task()}).ok,true);
 assert.deepEqual(Array.from(b.sheets.tasks[1].slice(0,8)),Array.from(before));assert.equal(b.sheets.tasks[1][8],'extra');assert.deepEqual(Array.from(b.sheets.tasks[0].slice(9)),['description','attachments','managerId']);
 assert.equal(b.call('updateRecord',{collection:'tasks',id:'t',record:{description:'Migrated description',priority:'Medium'}}).ok,true);
 assert.equal(b.sheets.tasks[1][8],'extra');assert.equal(b.sheets.tasks[1][9],'Migrated description');
 assert.equal(b.call('taskStatus',{id:'t',status:'Done'}).ok,true);assert.equal(b.sheets.tasks[1][5],'Completed');
});
test('task helpers validate links and keep legacy completion totals correct',()=>{
 assert.equal(taskStatus('Done'),'Completed');assert.equal(completedTask({status:'Done'}),true);assert.equal(completedTask({status:'Completed'}),true);assert.equal(completedTask({status:'In review'}),false);
 assert.deepEqual(taskLinks('https://example.com/spec\nhttps://example.com/result'),[{type:'link',url:'https://example.com/spec'},{type:'link',url:'https://example.com/result'}]);
 assert.throws(()=>taskLinks('javascript:alert(1)'));assert.throws(()=>taskLinks('not a link'));
});
