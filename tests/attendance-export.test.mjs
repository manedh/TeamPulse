import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {filterAttendance,attendanceWorkbook} from '../src/utils/attendanceExport.js';
const rows=[{id:'a',employeeId:'1',date:'2026-10-26T18:30:00Z',workMode:'Work from home',checkIn:'2026-10-27T03:30:00Z',checkOut:'2026-10-27T12:30:00Z'},{id:'b',employeeId:'2',date:'2026-10-27',checkIn:'09:00',checkOut:''},{id:'c',employeeId:'1',date:'2026-10-26',checkIn:'09:00',checkOut:'18:00'}];
test('employee and IST date filters select exactly the downloaded attendance',()=>{
 assert.deepEqual(filterAttendance(rows,'2026-10-27','1').map(r=>r.id),['a']);
 assert.equal(filterAttendance(rows,'','1').length,2);
 assert.equal(filterAttendance(rows,'2026-10-27').length,2);
 assert.equal(filterAttendance(rows).length,3);
 assert.equal(filterAttendance(rows,'','missing').length,0);
});
test('Excel download round-trips selected records, IST timestamps and literal employee names',async()=>{
 const workbook=new ExcelJS.Workbook();
 await workbook.xlsx.load(await attendanceWorkbook(filterAttendance(rows,'2026-10-27'),id=>id==='1'?'=Employee':'Other'));
 const sheet=workbook.getWorksheet('Login logout');assert.equal(sheet.rowCount,3);
 const saved=[sheet.getRow(2).values.slice(1),sheet.getRow(3).values.slice(1)];
 assert.deepEqual(saved.find(r=>r[1]==='1'),['=Employee','1','2026-10-27','2026-10-27 09:00:00','2026-10-27 18:00:00','WFH']);
 assert.deepEqual(saved.find(r=>r[1]==='2'),['Other','2','2026-10-27','09:00','','Not specified']);
 assert.equal(sheet.getRow(1).getCell(1).font.bold,true);
});

test('custom ranges include both endpoints, full months and selected employee only',()=>{
 assert.deepEqual(filterAttendance(rows,'2026-10-26','1','2026-10-27').map(r=>r.id),['a','c']);
 assert.equal(filterAttendance(rows,'2026-10-01','','2026-10-31').length,3);
 assert.equal(filterAttendance(rows,'2026-10-28','','2026-10-29').length,0);
 assert.equal(filterAttendance(rows,'2026-10-28','','2026-10-27').length,0);
 assert.equal(filterAttendance(rows,'2026-10-27','','').length,2);
});
