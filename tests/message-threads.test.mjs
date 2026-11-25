import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messageThreads,enterSends} from '../src/utils/messageThreads.js';
test('recent incoming and outgoing conversations sort ahead of members without chats',()=>{
 const people=[{id:'a',name:'Amit'},{id:'b',name:'Bhushan'},{id:'c',name:'Chitra'},{id:'me',name:'Me'}];
 const messages=[{senderId:'me',recipientId:'b',created:'2026-11-05T10:00:00Z',body:'old'},{senderId:'a',recipientId:'me',created:'2026-11-05T12:00:00Z',body:'new'},{senderId:'b',recipientId:'me',created:'2026-11-05T09:00:00Z',body:'older'}];
 const rows=messageThreads(messages,people,'me');assert.deepEqual(rows.map(p=>p.id),['a','b','c']);assert.equal(rows[1].lastMessage.body,'old');
 assert.deepEqual(messageThreads([...messages,{senderId:'me',recipientId:'c',created:'2026-11-05T13:00:00Z'}],people,'me').map(p=>p.id),['c','a','b']);
});
test('Enter sends while Shift+Enter and composition preserve text input',()=>{
 assert.equal(enterSends({key:'Enter'}),true);
 for(const e of [{key:'Enter',shiftKey:true},{key:'Enter',nativeEvent:{isComposing:true}},{key:'Enter',keyCode:229},{key:'a'}])assert.equal(enterSends(e),false);
});
