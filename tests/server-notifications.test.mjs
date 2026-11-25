import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {mergePopupQueue} from '../src/utils/notificationInbox.js';
import fs from 'node:fs';
import {backend,password} from './helpers/backend.mjs';
const invoke=(b,code)=>vm.runInContext(code,b.ctx);
function updateTask(b,status='In progress'){const token='notification-admin-test-token-'.repeat(3);if(!b.sheets.sessions.some(s=>s[0]==='admin-notification-test'))b.sheets.sessions.push(['admin-notification-test','a',crypto.createHash('sha256').update(token).digest('hex'),'2099-01-01T00:00:00Z','','']);assert.equal(b.call('taskStatus',{id:'t',status},token).ok,true);}
function login(b,id){return b.call('login',{email:id+'@company.test',password},'').data.token;}
function clock(b,stamp){b.ctx.Utilities.formatDate=(d,zone,pattern)=>{assert.equal(zone,'Asia/Kolkata');const date=new Date(new Date(stamp).getTime()+330*60000).toISOString();return pattern==='HH:mm'?date.slice(11,16):date.slice(0,10);};}

test('server events and inbox do not replay on refresh, repeat writes or a second tab',()=>{
 const b=backend('e@company.test');updateTask(b);const first=b.call('notificationSnapshot').data;
 assert.equal(first.items.length,1);assert.equal(first.unread,1);assert.equal(first.freshIds.length,1);
 for(let i=0;i<3;i++){updateTask(b);const again=b.call('notificationSnapshot').data;assert.equal(again.items.length,1);assert.equal(again.freshIds.length,0);}
 updateTask(b,'Blocked');updateTask(b);assert.equal(b.call('notificationSnapshot').data.items.length,3);
 assert.equal(b.call('bootstrap').data.db.notifications,undefined);assert.equal(b.call('bootstrap').data.db.notificationEvents,undefined);
});
test('read and dismissed state survive re-login; opening bell only claims popup, not read status',()=>{
 const b=backend('e@company.test');updateTask(b);const id=b.call('notificationSnapshot').data.items[0].id;
 assert.equal(b.call('notificationSnapshot').data.unread,1);
 assert.equal(b.call('notificationRead',{ids:[id]}).data.unread,0);
 const token=login(b,'e');assert.equal(b.call('notificationSnapshot',{},token).data.items[0].read,true);
 b.call('notificationDismiss',{ids:[id]},token);assert.equal(b.call('notificationSnapshot',{},token).data.items.length,0);
 updateTask(b,'Blocked');assert.equal(b.call('notificationRead',{all:true},token).data.unread,0);
});
test('employees cannot read, change or open another recipient receipt; TL only assigned team',()=>{
 const b=backend();updateTask(b);assert.equal(b.call('taskStatus',{id:'v',status:'Blocked'}).ok,true);
 const e=login(b,'e'),x=login(b,'x'),l=login(b,'l');const inbox=b.call('notificationSnapshot',{},e).data;
 assert.equal(inbox.items.length,1);assert.equal(inbox.items[0].recordId,'t');
 const id=inbox.items[0].id;
 for(const action of ['notificationRead','notificationDismiss','notificationOpen'])assert.equal(b.call(action,{id,ids:[id]},x).ok,false);
 assert.deepEqual(Array.from(b.call('notificationSnapshot',{},l).data.items,n=>n.recordId),['t']);
 assert.equal(b.call('notificationOpen',{id},e).data.record.title,'Task');
 // Reassignment immediately revokes visibility on existing receipts, too.
 invoke(b,"const task=rows_('tasks').find(t=>t.id==='t');update_('tasks',{...task,assignee:'x'});");
 assert.equal(b.call('notificationSnapshot',{},e).data.items.length,0);assert.equal(b.call('notificationOpen',{id},e).ok,false);
});
test('deleted targets return a clear unavailable message, never a stale record',()=>{
 const b=backend('e@company.test');updateTask(b);const id=b.call('notificationSnapshot').data.items[0].id;b.sheets.tasks.splice(1,1);
 const result=b.call('notificationOpen',{id});assert.equal(result.ok,false);assert.match(result.error,/deleted|unavailable|no longer/);
});
test('partial delivery retries exactly once per event and recipient without losing saved work',()=>{
 const b=backend('e@company.test');updateTask(b);
 invoke(b,"const originalAppend=appendRaw_;let failOnce=true;appendRaw_=function(k,r){if(k==='notifications'&&r.recipientId==='e'&&failOnce){failOnce=false;throw Error('delivery unavailable');}return originalAppend(k,r);};");
 assert.equal(b.call('notificationSnapshot').ok,true);assert.equal(b.sheets.notificationEvents[1].at(-1),'');
 const retry=b.call('notificationSnapshot').data;assert.equal(retry.items.length,1);assert.equal(b.sheets.tasks[1][5],'In progress');
 const ids=b.sheets.notifications.slice(1).map(n=>n[0]);assert.equal(ids.length,new Set(ids).size);assert.ok(b.sheets.notificationEvents[1].at(-1));
});
test('failed task validation creates no event; failed queue never fails a saved task',()=>{
 const b=backend('e@company.test');assert.equal(b.call('taskStatus',{id:'t',status:'Invalid'}).ok,false);assert.equal(b.sheets.notificationEvents.length,1);
 invoke(b,"appendRaw_=function(k,r){if(k==='notificationEvents')throw Error('queue unavailable');return spreadsheet_().getSheetByName(k).appendRow(SCHEMA[k].map(h=>r[h]??''));};");
 updateTask(b);assert.equal(b.sheets.tasks[1][5],'In progress');
});
test('report notifications only follow saved report history and validation',()=>{
 const b=backend('e@company.test');const record={projectId:'p',todayWork:'Work',doneToday:'Progress',status:'Completed'};
 assert.equal(b.call('saveDailyReport',{record:{...record,status:'Invalid'}}).ok,false);assert.equal(b.sheets.notificationEvents.length,1);
 invoke(b,"const originalAppend=appendRaw_;appendRaw_=function(k,r){if(k==='reportHistory')throw Error('history unavailable');return originalAppend(k,r);};");
 assert.equal(b.call('saveDailyReport',{record}).ok,false);assert.equal(b.sheets.notificationEvents.length,1);
});
test('server schedule uses configured IST EOD window, runs without tabs and deduplicates per day',()=>{
 const b=backend();b.properties.REPORT_EOD_TIME='18:30';b.properties.REPORT_REMINDER_MINUTES='30';
 clock(b,'2026-10-14T12:29:00Z');invoke(b,'processNotificationSchedule_()');assert.equal(b.sheets.notificationEvents.length,1);
 clock(b,'2026-10-14T12:30:00Z');invoke(b,'processNotificationSchedule_()');const count=b.sheets.notificationEvents.length;assert.equal(count,6);
 invoke(b,'processNotificationSchedule_()');assert.equal(b.sheets.notificationEvents.length,count);
 clock(b,'2026-10-15T13:00:00Z');invoke(b,'processNotificationSchedule_()');assert.equal(b.sheets.notificationEvents.length,count);
});
test('reminders skip submitted reports, approved full-day leave, holidays and weekly off',()=>{
 for(const reason of ['report','leave','holiday','off']){
  const b=backend('e@company.test');clock(b,'2026-10-14T12:45:00Z');
  if(reason==='report')b.sheets.dailyReports.push(['r','e','2026-10-14']);
  if(reason==='leave')b.sheets.leaves.push(['approved','e','Sick','2026-10-14','2026-10-14','','Approved','','','Full day']);
  if(reason==='holiday'||reason==='off')b.properties.LEAVE_POLICY=JSON.stringify({workingDays:reason==='off'?[1]:[1,2,3,4,5],holidays:reason==='holiday'?['2026-10-14']:[]});
  invoke(b,'processNotificationSchedule_()');assert.equal(b.call('notificationSnapshot').data.items.length,0,reason);
 }
});
test('reminder disappears from unread inbox when report is subsequently submitted',()=>{
 const b=backend('e@company.test');clock(b,'2026-10-14T12:45:00Z');invoke(b,'processNotificationSchedule_()');assert.equal(b.call('notificationSnapshot').data.unread,1);
 b.sheets.dailyReports.push(['r','e','2026-10-14']);assert.equal(b.call('notificationSnapshot').data.unread,0);
});
test('trigger installation is private, idempotent, timezone specific and validates configuration',()=>{
 const b=backend();let triggers=[],created=0;
 const builder={timeBased(){return this;},everyMinutes(n){assert.equal(n,5);return this;},inTimezone(zone){assert.equal(zone,'Asia/Kolkata');return this;},create(){created++;triggers.push({getHandlerFunction:()=> 'processNotificationSchedule_'});}};
 b.ctx.ScriptApp={getProjectTriggers:()=>triggers,newTrigger:name=>{assert.equal(name,'processNotificationSchedule_');return builder;},deleteTrigger:t=>triggers=triggers.filter(x=>x!==t)};
 invoke(b,'installNotificationSchedule_();installNotificationSchedule_();');assert.equal(created,1);
 b.properties.REPORT_EOD_TIME='25:00';assert.throws(()=>invoke(b,'installNotificationSchedule_()'),/Configure/);
 const source=fs.readFileSync('src/components/NotificationCenter.jsx','utf8');assert.doesNotMatch(source,/workspaceNotifications|sessionStorage|localStorage/);assert.match(source,/Mark all as read/);
});


test('new message alerts are private, persist, open sender conversation and resolve on reading',()=>{
 const b=backend('e@company.test');assert.equal(b.call('sendMessage',{recipientId:'x',body:'Please review the task.'}).ok,true);
 assert.equal(b.call('notificationSnapshot').data.items.length,0);
 const x=login(b,'x'),h=login(b,'h');const inbox=b.call('notificationSnapshot',{},x).data;
 assert.equal(inbox.items.length,1);assert.match(inbox.items[0].message,/New message from e/);assert.equal(inbox.freshIds.length,1);
 assert.equal(b.call('notificationSnapshot',{},x).data.freshIds.length,0);assert.equal(b.call('notificationSnapshot',{},h).data.items.length,0);
 const target=b.call('notificationOpen',{id:inbox.items[0].id},x).data;assert.equal(target.collection,'messages');assert.equal(target.record.senderId,'e');
 b.call('messageSnapshot',{peerId:'e'},x);assert.equal(b.call('notificationSnapshot',{},x).data.unread,0);assert.equal(b.sheets.notificationEvents.length,2);
 assert.equal(b.call('sendMessage',{recipientId:'x',body:''}).ok,false);assert.equal(b.sheets.notificationEvents.length,2);
});
test('punch confirmations follow successful writes and remain private',()=>{
 const b=backend('e@company.test');assert.equal(b.call('attendance',{kind:'out',compact:true}).ok,false);assert.equal(b.sheets.notificationEvents.length,1);
 assert.equal(b.call('attendance',{kind:'in',compact:true}).ok,true);assert.equal(b.call('attendance',{kind:'in',compact:true}).ok,false);
 assert.equal(b.call('attendance',{kind:'out',compact:true}).ok,true);const inbox=b.call('notificationSnapshot').data;
 assert.equal(inbox.items.length,2);assert.ok(inbox.items.some(n=>/Punch-in saved/.test(n.message)));assert.ok(inbox.items.some(n=>/Punch-out saved/.test(n.message)));
 const x=login(b,'x');assert.equal(b.call('notificationSnapshot',{},x).data.items.length,0);
});
test('IST punch reminders run once, skip completed punches, and clear after completion',()=>{
 const b=backend('e@company.test');clock(b,'2026-10-14T03:59:00Z');invoke(b,'processNotificationSchedule_()');assert.equal(b.call('notificationSnapshot').data.items.length,0);
 clock(b,'2026-10-14T04:00:00Z');invoke(b,'processNotificationSchedule_();processNotificationSchedule_();');
 assert.equal(b.call('notificationSnapshot').data.items.filter(n=>n.collection==='punchReminder').length,1);
 assert.equal(b.call('attendance',{kind:'in',compact:true}).ok,true);assert.equal(b.call('notificationSnapshot').data.items.filter(n=>n.collection==='punchReminder').length,0);
 clock(b,'2026-10-14T13:00:00Z');invoke(b,'processNotificationSchedule_();processNotificationSchedule_();');
 const out=b.call('notificationSnapshot').data.items.filter(n=>n.collection==='punchReminder');assert.equal(out.length,1);assert.match(out[0].message,/Punch-out reminder/);
 assert.equal(b.call('attendance',{kind:'out',compact:true}).ok,true);assert.equal(b.call('notificationSnapshot').data.items.filter(n=>n.collection==='punchReminder').length,0);
});
test('punch reminders respect leave, holidays, weekly off and configured times',()=>{
 for(const reason of ['leave','holiday','off','time']){
  const b=backend('e@company.test');clock(b,'2026-10-14T04:00:00Z');
  if(reason==='leave')b.sheets.leaves.push(['approved','e','Sick','2026-10-14','2026-10-14','','Approved','','','Full day']);
  if(reason==='holiday'||reason==='off')b.properties.LEAVE_POLICY=JSON.stringify({workingDays:reason==='off'?[1]:[1,2,3,4,5],holidays:reason==='holiday'?['2026-10-14']:[]});
  if(reason==='time')b.properties.PUNCH_IN_TIME='10:00';
  invoke(b,'processNotificationSchedule_()');assert.equal(b.call('notificationSnapshot').data.items.length,0,reason);
 }
});


test('self routine task/report/profile edits do not alert the actor; useful punches still do',()=>{
 const b=backend('e@company.test');assert.equal(b.call('taskStatus',{id:'t',status:'Blocked'}).ok,true);assert.equal(b.call('notificationSnapshot').data.unread,0);
 const before=b.sheets.notificationEvents.length;assert.equal(b.call('updateProfile',{name:'Updated name',phone:'9876543210'}).ok,true);assert.equal(b.sheets.notificationEvents.length,before);
 assert.equal(b.call('updateProfile',{name:'Updated name',photo:'data:image/jpeg;base64,YQ=='}).ok,true);assert.equal(b.sheets.notificationEvents.length,before);
 assert.equal(b.call('attendance',{kind:'in',compact:true}).ok,true);assert.equal(b.call('notificationSnapshot').data.unread,1);
});
test('task event wording distinguishes assignment, reassignment, status and important edits',()=>{
 const b=backend();b.call('create',{collection:'tasks',record:{title:'Assigned work',description:'Review privately',assignee:'e',status:'To do',priority:'High'}});
 let event=b.sheets.notificationEvents.slice(-1)[0];assert.match(invoke(b,`notificationMessage_('tasks',${event[3]})`),/Task assigned:/);
 updateTask(b);event=b.sheets.notificationEvents.slice(-1)[0];assert.match(invoke(b,`notificationMessage_('tasks',${event[3]})`),/Task status changed:/);
 const payload={collection:'tasks',id:'t',record:{title:'Task',description:'Updated private instructions',projectId:'p',assignee:'x',status:'In progress',priority:'Medium',due:'',attachments:'[]'}};
 assert.equal(b.call('updateRecord',payload).ok,true);event=b.sheets.notificationEvents.slice(-1)[0];assert.match(invoke(b,`notificationMessage_('tasks',${event[3]})`),/Task reassigned:/);
 payload.record.description='Further instructions';assert.equal(b.call('updateRecord',payload).ok,true);event=b.sheets.notificationEvents.slice(-1)[0];assert.match(invoke(b,`notificationMessage_('tasks',${event[3]})`),/Task updated:/);
});
test('paginated inbox totals include off-page unread; bulk read and clear apply to all pages',()=>{
 const b=backend('e@company.test');for(let i=0;i<63;i++)invoke(b,`queueRecordNotification_('announcements',{id:'a'+${i},title:'Notice '+${i},message:'Private announcement text'});`);
 const first=b.call('notificationSnapshot',{limit:20,claimPopups:false}).data;assert.equal(first.items.length,20);assert.equal(first.unread,63);assert.ok(first.nextCursor);assert.equal(first.freshIds.length,0);
 const second=b.call('notificationSnapshot',{limit:20,cursor:first.nextCursor,claimPopups:false}).data;assert.equal(second.items.length,20);assert.equal(second.unread,63);assert.equal(second.items.some(n=>first.items.some(p=>p.id===n.id)),false);
 assert.equal(b.call('notificationRead',{all:true}).data.unread,0);assert.equal(b.call('notificationDismiss',{all:true}).data.items.length,0);
 assert.equal(b.call('notificationSnapshot',{limit:101}).ok,false);assert.equal(b.call('notificationSnapshot',{cursor:{id:'bad',created:'bad'}}).ok,false);
});
test('full inbox previews exclude message bodies, leave reasons, report details and locations',()=>{
 const b=backend('e@company.test');assert.equal(b.call('sendMessage',{recipientId:'x',body:'SENSITIVE MESSAGE'}).ok,true);
 const x=login(b,'x');const inbox=b.call('notificationSnapshot',{},x).data;assert.equal(JSON.stringify(inbox).includes('SENSITIVE MESSAGE'),false);assert.match(inbox.items[0].message,/New message from/);
 invoke(b,"queueRecordNotification_('leaves',{id:'private-leave',employeeId:'e',type:'Sick',reason:'PRIVATE MEDICAL REASON',status:'Approved'});");
 assert.equal(JSON.stringify(b.call('notificationSnapshot').data).includes('PRIVATE MEDICAL'),false);
});
test('notification listing reuses full-sheet reads and keeps source data private',()=>{
 const b=backend('e@company.test');for(let i=0;i<25;i++)updateTask(b,i%2?'Blocked':'In progress');
 const before={...b.reads};const result=b.call('notificationSnapshot');assert.equal(result.ok,true);assert.equal(result.data.unread,25);
 assert.ok((b.reads.tasks||0)-(before.tasks||0)<=2);assert.ok((b.reads.employees||0)-(before.employees||0)<=1);assert.ok((b.reads.notifications||0)-(before.notifications||0)<=2);
 assert.equal(b.call('bootstrap').data.db.passwordResets,undefined);
});
test('joining date and inactive status exclude scheduled reminders',()=>{
 for(const reason of ['joining','inactive']){const b=backend('e@company.test'),e=b.sheets.employees.find(r=>r[0]==='e');if(reason==='joining')e[8]='2026-10-15';else e[6]='Inactive';clock(b,'2026-10-14T12:45:00Z');invoke(b,'processNotificationSchedule_()');const eventRows=b.sheets.notificationEvents.slice(1);assert.equal(eventRows.some(r=>r[0]==='reportReminder:e:2026-10-14'),false);}
});
test('popup queue is independent of the current page and never re-adds a claimed popup',()=>{
 const a={id:'a',read:false,message:'Task update'},b={id:'b',read:false,message:'Message update'};
 const first=mergePopupQueue([],{items:[],freshItems:[a,b],freshIds:['a','b'],activePopupIds:[]});assert.equal(first.length,2);
 const next=mergePopupQueue(first,{items:[],freshItems:[],freshIds:[],activePopupIds:['a','b']});assert.deepEqual(next,first);
 assert.deepEqual(mergePopupQueue(next,{items:[],freshItems:[],freshIds:[],activePopupIds:['b']}),[b]);
 const fixture=backend('e@company.test');for(let i=0;i<8;i++)invoke(fixture,`queueRecordNotification_('announcements',{id:'pop'+${i},title:'Title'});`);
 const received=fixture.call('notificationSnapshot',{limit:1}).data;assert.equal(received.freshItems.length,5);assert.equal(received.items.length,1);assert.equal(fixture.call('notificationSnapshot',{limit:1}).data.freshIds.length,3);
});
