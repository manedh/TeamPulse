import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backend,password} from './helpers/backend.mjs';
function fixture(){const b=backend('e@company.test');for(const row of b.sheets.employees.slice(1))row[4]=['e','x'].includes(row[0])?'Software Developer':'Management';return b;}
const token=(b,id)=>b.call('login',{email:(id==='a'?'admin':id)+'@company.test',password},'').data.token;
test('messages persist, reply and expose content only to participants, including Admin/HR',()=>{
 const b=fixture(),sent=b.call('sendMessage',{recipientId:'x',body:'  Hello teammate!  ',senderId:'a'});assert.equal(sent.ok,true,sent.error);assert.equal(sent.data.messages[0].senderId,'e');assert.equal(sent.data.messages[0].body,'Hello teammate!');
 const x=token(b,'x');assert.equal(b.call('messageSnapshot',{},x).data.messages.length,1);
 for(const id of ['a','h','l']){const other=token(b,id);const snapshot=b.call('messageSnapshot',{peerId:'e'},other);assert.equal(snapshot.data.messages.length,0);assert.equal(snapshot.data.people.filter(p=>p.status==='Active').length,5);assert.equal(b.call('bootstrap',{},other).data.db.messages,undefined);}
 assert.equal(b.call('sendMessage',{recipientId:'e',body:'Hello back'},x).ok,true);
 assert.equal(b.call('messageSnapshot').data.messages.length,2);
 assert.equal(b.call('messageSnapshot').data.messages[0].readAt,'');
 assert.ok(b.call('messageSnapshot',{peerId:'x'},x).data.messages.find(m=>m.senderId==='e').readAt=== '');
 assert.ok(b.call('messageSnapshot',{peerId:'e'},x).data.messages.find(m=>m.senderId==='e').readAt);
});
test('message validation blocks invalid recipients, blank/oversize text and unauthenticated access',()=>{
 const b=fixture();for(const payload of [{recipientId:'e',body:'Hi'},{recipientId:'missing',body:'Hi'},{recipientId:'x',body:'  '},{recipientId:'x',body:'x'.repeat(2001)},{recipientId:'x',body:123}])assert.equal(b.call('sendMessage',payload).ok,false,JSON.stringify(payload));
 assert.equal(b.call('sendMessage',{recipientId:'x',body:'Hi'},'').ok,false);
 b.sheets.employees.find(row=>row[0]==='x')[6]='Inactive';assert.equal(b.call('sendMessage',{recipientId:'x',body:'Hi'}).ok,false);assert.equal(b.sheets.messages.length,1);
});
test('existing deployments without messages sheet read safely and create storage on first send',()=>{
 const b=fixture();delete b.sheets.messages;assert.equal(b.call('bootstrap').ok,true);assert.equal(b.call('messageSnapshot').data.messages.length,0);assert.equal(b.sheets.messages,undefined);
 const sent=b.call('sendMessage',{recipientId:'x',body:'=literal message'});assert.equal(sent.ok,true,sent.error);assert.ok(b.sheets.messages);assert.equal(b.sheets.messages[1][3],"'=literal message");
});
test('an employee can reply to an administrator who initiates contact across departments',()=>{
 const b=fixture(),admin=token(b,'a');assert.equal(b.call('sendMessage',{recipientId:'e',body:'Hello'},admin).ok,true);assert.equal(b.call('sendMessage',{recipientId:'a',body:'Reply'}).ok,true);
});

test('all roles can start cross-department conversations with every active member',()=>{
 const b=fixture();
 for(const sender of ['a','h','l','e','x']){
  const session=token(b,sender);
  const directory=b.call('messageSnapshot',{},session);
  assert.equal(directory.ok,true);
  assert.equal(directory.data.directoryVersion,1);
  for(const recipient of ['a','h','l','e','x'].filter(id=>id!==sender)){
   assert.ok(directory.data.people.some(p=>p.id===recipient));
   const sent=b.call('sendMessage',{recipientId:recipient,body:sender+' to '+recipient},session);
   assert.equal(sent.ok,true,sent.error);
   assert.ok(sent.data.messages.every(m=>m.senderId===sender||m.recipientId===sender));
  }
 }
});
