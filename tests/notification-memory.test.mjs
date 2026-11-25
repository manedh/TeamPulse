import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationMemory,notificationFingerprint,notificationMemoryKey} from '../src/utils/notificationMemory.js';
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};};
const event=(id='event-1')=>({id,message:'Project assigned to you',page:'Projects'});
test('a notification pops up once and is suppressed across remounts and reopening',()=>{
 const persistent=storage(),first=createNotificationMemory('once',persistent);
 assert.equal(first.receive([event()]).fresh.length,1);
 assert.equal(first.receive([event()]).fresh.length,0);
 const reopened=createNotificationMemory('once',persistent);
 assert.equal(reopened.receive([event()]).fresh.length,0);
 assert.equal(reopened.receive([event('new-update')]).fresh.length,1);
});
test('existing records seed the inbox quietly and cannot pop up on later syncs',()=>{
 const memory=createNotificationMemory('initial',storage());
 const initial=memory.receive([event()],true);assert.equal(initial.items.length,1);assert.equal(initial.fresh.length,0);
 assert.equal(memory.receive([event()]).fresh.length,0);
});
test('read and dismissed state survive a new tracker and account data stays isolated',()=>{
 const persistent=storage(),first=createNotificationMemory('reader',persistent);first.receive([event()]);first.markRead([event().id]);
 const reopened=createNotificationMemory('reader',persistent);assert.equal(reopened.isRead(event().id),true);assert.equal(reopened.receive([event()],true).items.length,0);
 const other=createNotificationMemory('different-account',persistent);assert.equal(other.isRead(event().id),false);assert.equal(other.receive([event()]).fresh.length,1);
});
test('old tab notification history migrates without replaying already delivered messages',()=>{
 const persistent=storage(),memory=createNotificationMemory('migration',persistent);memory.remember([{...event(),read:true}]);
 assert.equal(memory.receive([event()]).fresh.length,0);assert.equal(memory.isRead(event().id),true);
});
test('separate tabs consult the latest stored delivery and read state',()=>{
 const persistent=storage(),first=createNotificationMemory('tabs',persistent),second=createNotificationMemory('tabs',persistent);
 assert.equal(first.receive([event()]).fresh.length,1);assert.equal(second.receive([event()]).fresh.length,0);
 first.markRead([event().id]);assert.equal(second.isRead(event().id),true);
});
test('number/string and blank/missing transport differences do not replay a message',()=>{
 const first=JSON.stringify(['worklogs','w',null,4]),second=JSON.stringify(['worklogs','w','', '4']);
 assert.equal(notificationFingerprint(first),notificationFingerprint(second));
 const memory=createNotificationMemory('transport',storage());assert.equal(memory.receive([event(first)]).fresh.length,1);assert.equal(memory.receive([event(second)]).fresh.length,0);
});
test('duplicates in a batch are delivered once and durable receipts contain no message text',()=>{
 const persistent=storage(),memory=createNotificationMemory('opaque',persistent),update=event(JSON.stringify(['announcements','n','Private message']));
 assert.equal(memory.receive([update,update]).fresh.length,1);const saved=persistent.getItem(notificationMemoryKey('opaque'));
 assert.equal(saved.includes('Private message'),false);assert.equal(saved.includes('Project assigned'),false);
});
test('corrupt or unavailable browser storage does not break notifications',()=>{
 const corrupt={getItem:()=>'{bad json',setItem(){throw Error('Storage blocked');}};
 const memory=createNotificationMemory('unavailable',corrupt);assert.equal(memory.receive([event()]).fresh.length,1);assert.equal(memory.receive([event()]).fresh.length,0);memory.markRead([event().id]);assert.equal(memory.isRead(event().id),true);
});

test('restarting the app module restores durable delivery and read receipts',async()=>{
 const persistent=storage(),original=createNotificationMemory('full-restart',persistent);original.receive([event()]);original.markRead([event().id]);
 const {createNotificationMemory:restartedFactory}=await import('../src/utils/notificationMemory.js?fresh-runtime');
 const restarted=restartedFactory('full-restart',persistent);assert.equal(restarted.receive([event()]).fresh.length,0);assert.equal(restarted.isRead(event().id),true);
 assert.equal(restarted.receive([event('another-update')]).fresh.length,1);
});

test('logging in again does not rebuild the inbox from old records',()=>{const persistent=storage(),first=createNotificationMemory('login-repeat',persistent);assert.equal(first.receive([event()],true).items.length,1);first.markRead([event().id]);const login=createNotificationMemory('login-repeat',persistent);assert.deepEqual(login.receive([event()],true).items,[]);const changed=login.receive([event(),event('changed-content')],true);assert.deepEqual(changed.items.map(item=>item.id),['changed-content']);assert.equal(changed.fresh.length,0);assert.equal(login.receive([event('brand-new')]).fresh.length,1);});
