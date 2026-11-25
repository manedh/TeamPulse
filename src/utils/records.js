export const recordLabels={employees:'employee',projects:'project',tasks:'task',worklogs:'work log',announcements:'announcement',attendance:'attendance record'};
export function canEditRecord(collection,row,user,db){
 if(!row||!user)return false;const admin=['Admin','HR'].includes(user.role);
 if(collection==='employees')return admin&&row.status!=='Deleted'&&(user.role==='Admin'||row.id===user.id||!['Admin','HR'].includes(row.role));
 if(collection==='projects')return admin||(user.role==='Team Leader'&&row.owner===user.id);
 if(collection==='tasks')return admin||(user.role==='Team Leader'&&(row.projectId?db.projects.some(project=>project.id===row.projectId&&project.owner===user.id):row.managerId===user.id));
 if(collection==='worklogs')return admin||row.employeeId===user.id;
 return ['announcements','attendance'].includes(collection)&&admin;
}
export function canDeleteRecord(collection,row,user,db){return ['tasks','worklogs','attendance'].includes(collection)&&canEditRecord(collection,row,user,db);}
export function istDateTimeInput(value){if(!value||!Number.isFinite(Date.parse(value)))return '';return new Date(Date.parse(value)+330*60000).toISOString().slice(0,19);}
export function attendanceFormRecord(values){return {...values,checkIn:values.checkIn?new Date(values.checkIn+'+05:30').toISOString():'',checkOut:values.checkOut?new Date(values.checkOut+'+05:30').toISOString():''};}
