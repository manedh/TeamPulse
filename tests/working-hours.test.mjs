import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {backend} from './helpers/backend.mjs';
import {shiftMinutes,hoursLabel,dailyShiftTotal} from '../src/utils/workingHours.js';
const day='2026-10-28',stamp=time=>Date.parse(day+'T'+time+'+05:30'),row=(start,end='',more={})=>({employeeId:'e',date:day,checkIn:day+'T'+start+'+05:30',checkOut:end?day+'T'+end+'+05:30':'',...more});
test('full duration includes early and late attendance',()=>{assert.equal(shiftMinutes([row('08:00:00','20:00:00')],'e',day,stamp('21:00:00')),720);assert.equal(shiftMinutes([row('10:53:00','18:30:00')],'e',day,stamp('20:00:00')),457);assert.equal(shiftMinutes([row('09:30:00','17:00:00')],'e',day,stamp('20:00:00')),450);assert.equal(hoursLabel(457),'7h 37m');});
test('open sessions keep growing after the scheduled shift',()=>{const records=[row('09:30:00')];assert.equal(shiftMinutes(records,'e',day,stamp('09:00:00')),0);assert.equal(shiftMinutes(records,'e',day,stamp('11:00:00')),90);assert.equal(shiftMinutes(records,'e',day,stamp('21:00:00')),690);});
test('punch gaps are excluded and overlapping duplicate sessions count once',()=>{const records=[row('09:00:00','12:00:00'),row('10:00:00','12:00:00'),row('13:00:00','18:30:00')];assert.equal(shiftMinutes(records,'e',day,stamp('19:00:00')),510);});
test('other employees, previous-day open punches, invalid and reversed timestamps are excluded',()=>{assert.equal(shiftMinutes([row('09:30:00','18:30:00',{employeeId:'x'}),row('09:30:00','18:30:00',{date:'2026-10-27'}),row('09:30:00','18:30:00',{checkIn:'invalid'}),row('12:00:00','10:00:00')],'e',day,stamp('20:00:00')),0);});
test('legacy time-only punches and ISO date values use India time',()=>{assert.equal(shiftMinutes([{employeeId:'e',date:'2026-10-27T18:30:00Z',checkIn:'9:00',checkOut:'19:00'}],'e',day,stamp('21:00:00')),600);});
test('backend employee totals match full attendance durations',()=>{const b=backend();b.ctx.records=[row('08:00:00','12:00:00'),row('13:00:00')];b.ctx.day=day;b.ctx.now=stamp('19:30:00');assert.equal(vm.runInContext("shiftMinutes(records,'e',day,now)",b.ctx),630);assert.equal(vm.runInContext("shiftMinutes(records,'e',day,now)",b.ctx),shiftMinutes(b.ctx.records,'e',day,b.ctx.now));});

test('daily totals finalize after punch-out and combine all sessions for the employee and date',()=>{const sessions=[row('09:30:00','12:00:00'),row('13:00:00'),row('09:30:00','18:30:00',{employeeId:'other'})];assert.deepEqual(dailyShiftTotal(sessions,'e',day,stamp('17:00:00')),{complete:false,minutes:390});sessions[1]=row('13:00:00','18:30:00');assert.deepEqual(dailyShiftTotal(sessions,'e',day,stamp('19:00:00')),{complete:true,minutes:480});assert.deepEqual(dailyShiftTotal(sessions,'e','2026-10-27',stamp('19:00:00')),{complete:false,minutes:0});});

test('screenshot session counts full punch duration including seconds',()=>{assert.equal(shiftMinutes([row('10:53:32','21:05:11')],'e',day,stamp('22:00:00')),611);});
test('completed overnight sessions retain their full duration',()=>{assert.equal(shiftMinutes([{employeeId:'e',date:day,checkIn:day+'T22:00:00+05:30',checkOut:'2026-10-29T02:00:00+05:30'}],'e',day),240);});
