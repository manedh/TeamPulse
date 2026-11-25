import {attendanceForDate,indiaDate} from './attendance.js';

export function filterAttendance(records,date='',employeeId='',endDate=date){
 if(date&&endDate&&date>endDate)return [];
 return attendanceForDate(records).filter(row=>(!date||indiaDate(row.date)>=date)&&(!endDate||indiaDate(row.date)<=endDate)&&(!employeeId||String(row.employeeId)===String(employeeId)));
}
function punchTime(value){
 if(!value)return '';
 if(/^\d{1,2}:\d{2}(:\d{2})?$/.test(value))return value;
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return String(value);
 return indiaDate(date)+' '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
}
export async function attendanceWorkbook(rows,employee){
 const excelModule=await import('exceljs/dist/exceljs.min.js');
 const ExcelJS=excelModule.default||excelModule;
 const workbook=new ExcelJS.Workbook();
 const sheet=workbook.addWorksheet('Login logout');
 sheet.columns=[{header:'Employee',key:'name',width:30},{header:'Employee ID',key:'employeeId',width:24},{header:'Attendance date (IST)',key:'date',width:24},{header:'Login / punch in (IST)',key:'login',width:26},{header:'Logout / punch out (IST)',key:'logout',width:26},{header:'Work mode',key:'workMode',width:24}];
 for(const row of rows)sheet.addRow({name:String(employee(row.employeeId)),employeeId:String(row.employeeId),date:indiaDate(row.date),login:punchTime(row.checkIn),logout:punchTime(row.checkOut),workMode:row.workMode==='Work from office'?'WFO':row.workMode==='Work from home'?'WFH':row.workMode||'Not specified'});
 sheet.getRow(1).font={bold:true};
 sheet.views=[{state:'frozen',ySplit:1}];
 sheet.autoFilter='A1:F'+Math.max(1,sheet.rowCount);
 return workbook.xlsx.writeBuffer();
}
export async function downloadAttendance(rows,employee,date='',employeeId='',endDate=date){
 const data=await attendanceWorkbook(rows,employee);
 const url=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const link=document.createElement('a');link.href=url;
 link.download='attendance-'+(employeeId?String(employee(employeeId)).replace(/[^a-z0-9_-]/gi,'_'):'all-employees')+'-'+(date||endDate?(date||'start')+'_to_'+(endDate||'latest'):'all-dates')+'.xlsx';
 document.body.appendChild(link);
 try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
