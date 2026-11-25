import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indiaDate,attendanceForDay,eventForPunch,mergeAttendance,attendanceForDate} from '../src/utils/attendance.js';
test('Indian working date changes at IST midnight',()=>{assert.equal(indiaDate('2026-10-13T18:29:59Z'),'2026-10-13');assert.equal(indiaDate('2026-10-13T18:30:00Z'),'2026-10-14');});
test('check-in matches ISO date returned for a Sheets date cell',()=>{const row={employeeId:'e',date:'2026-10-13T18:30:00.000Z',checkIn:'2026-10-14T04:00:00Z',checkOut:''};assert.equal(attendanceForDay([row],'e',new Date('2026-10-14T05:00:00Z')),row);});
test('date-only records match and other days/employees are excluded',()=>{const row={employeeId:'e',date:'2026-10-14'};assert.equal(attendanceForDay([row],'e',new Date('2026-10-14T05:00:00Z')),row);assert.equal(attendanceForDay([row],'x',new Date('2026-10-14T05:00:00Z')),null);assert.equal(attendanceForDay([row],'e',new Date('2026-10-15T05:00:00Z')),null);});

test('an open duplicate takes priority over a completed row for the same account and date',()=>{const closed={employeeId:'e',date:'2026-10-14',checkIn:'09:00',checkOut:'10:00'};const open={employeeId:'e',date:'2026-10-13T18:30:00.000Z',checkIn:'11:00',checkOut:''};assert.equal(attendanceForDay([closed,open],'e',new Date('2026-10-14T12:00:00Z')),open)});

test('saved location binds to its punch even when the event timestamp is later',()=>{const row={id:'a',employeeId:'e',checkIn:'2026-10-15T09:00:00Z'};const event={id:'a:punchIn',employeeId:'e',action:'punchIn',created:'2026-10-15T09:02:00Z'};assert.equal(eventForPunch(row,[event],'punchIn'),event);assert.equal(eventForPunch({...row,employeeId:'other'},[event],'punchIn'),null)});
test('legacy location events match person and nearest timestamp without leaking another punch',()=>{const row={id:'old',employeeId:'e',checkIn:'2026-10-15T09:00:00Z'};const event={id:'legacy',employeeId:'e',action:'punchIn',created:'2026-10-15T09:00:02Z'};assert.equal(eventForPunch(row,[event],'punchIn'),event);assert.equal(eventForPunch(row,[{...event,created:'2026-10-15T10:00:00Z'}],'punchIn'),null)});

test('confirmed punch-out cannot revert to checked in after a stale refresh',()=>{const saved={id:'a',employeeId:'e',date:'2026-10-14',checkIn:'2026-10-14T09:00:00Z',checkOut:'2026-10-14T17:00:00Z'};const stale={...saved,checkOut:''};const rows=mergeAttendance([saved],[stale]);assert.equal(rows[0].checkOut,saved.checkOut);assert.equal(attendanceForDay(rows,'e',new Date('2026-10-14T17:30:00Z')).checkOut,saved.checkOut);assert.equal(stale.checkOut,'')});
test('new punch-out replaces an open row without copying another employee state',()=>{const open={id:'a',employeeId:'e',checkOut:''};const closed={...open,checkOut:'2026-10-14T17:00:00Z'};assert.equal(mergeAttendance([open],[closed])[0].checkOut,closed.checkOut);assert.equal(mergeAttendance([closed],[{...open,employeeId:'x'}])[0].checkOut,'')});

test('date-wise history includes all authorized people on the selected IST date',()=>{
 const rows=[{id:'old',employeeId:'e',date:'2026-10-13'}, {id:'iso',employeeId:'e',date:'2026-10-13T18:30:00Z'}, {id:'today',employeeId:'a',date:'2026-10-14'}];
 assert.deepEqual(attendanceForDate(rows,'2026-10-14').map(r=>r.id),['iso','today']);
 assert.equal(attendanceForDate(rows,'2026-10-15').length,0);
 assert.equal(attendanceForDate(rows).length,3);assert.equal(rows[0].id,'old');
});

test('punch controls select the newest session after an earlier punch-out',()=>{
 const first={id:'first',employeeId:'e',date:'2026-10-14',checkIn:'2026-10-14T04:00:00Z',checkOut:'2026-10-14T05:00:00Z'};
 const second={id:'second',employeeId:'e',date:'2026-10-14',checkIn:'2026-10-14T06:00:00Z',checkOut:''};
 const now=new Date('2026-10-14T10:00:00Z');
 assert.equal(attendanceForDay([first,second],'e',now).id,'second');
 assert.equal(attendanceForDay([first,{...second,checkOut:'2026-10-14T07:00:00Z'}],'e',now).id,'second');
});
