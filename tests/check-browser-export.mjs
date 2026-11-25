import {build} from 'vite';
import vm from 'node:vm';
import ExcelJS from 'exceljs';
const result=await build({configFile:false,logLevel:'error',build:{write:false,minify:true,lib:{entry:'src/utils/attendanceExport.js',name:'AttendanceExport',formats:['iife']},rollupOptions:{output:{inlineDynamicImports:true}}}});
const context=vm.createContext({console,setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,atob,btoa});
vm.runInContext((Array.isArray(result)?result[0]:result).output[0].code,context);
const bytes=await context.AttendanceExport.attendanceWorkbook([{employeeId:'e',date:'2026-10-27',checkIn:'2026-10-27T03:30:00Z',checkOut:''}],()=> 'Test Employee');
const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
if(workbook.worksheets[0].getCell('D2').value!=='2026-10-27 09:00:00')throw new Error('Browser workbook mismatch');
console.log('Browser production bundle generates a valid Excel workbook without Node globals.');

