import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backend} from './helpers/backend.mjs';
const record={type:'Casual',start:'2026-11-02',end:'2026-11-02',duration:'Half day',half:'First half',reason:'Family commitment'};
test('new leave emails the configured recipients with saved details; edits and invalid submissions send nothing',()=>{
 const b=backend('e@company.test'),messages=[];b.ctx.MailApp={sendEmail:message=>messages.push(message)};
 b.sheets.employees.push(['a2','Second Admin','second@company.test','Admin','','','Active','']);
 b.sheets.employees.push(['a3','Inactive Admin','inactive@company.test','Admin','','','Inactive','']);
 const result=b.call('create',{collection:'leaves',record});assert.equal(result.ok,true,result.error);assert.equal(messages.length,3);
 assert.deepEqual(messages.map(m=>m.to),['asawai7875@gmail.com','bhushanchaudhari@gritznova.com','hr@sawaiassociates.com']);
 assert.match(messages[0].body,/Working days: 0.5/);assert.match(messages[0].body,/First half/);assert.match(messages[0].body,/Family commitment/);
 const id=result.data.db.leaves.at(-1).id;assert.match(messages[0].body,new RegExp(id));
 assert.equal(b.call('create',{collection:'leaves',record}).ok,false);assert.equal(messages.length,3);
 assert.equal(b.call('editLeave',{id,record:{...record,reason:'Updated'}}).ok,true);assert.equal(messages.length,3);
});
test('mail failures preserve successful saved leave and record audit failure',()=>{
 const b=backend('e@company.test');b.ctx.MailApp={sendEmail:()=>{throw Error('Quota exceeded');}};
 const result=b.call('create',{collection:'leaves',record});assert.equal(result.ok,true,result.error);
 const id=result.data.db.leaves.at(-1).id;assert.ok(b.sheets.audit.some(row=>row[2]==='leaveEmailFailed'&&row[3]===id));
});
