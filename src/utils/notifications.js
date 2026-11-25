const modules={employees:'Employees',projects:'Projects',tasks:'Tasks',leaves:'Leave requests',announcements:'Announcements',attendance:'Attendance'};
export function workspaceNotifications(previous,current,user){
 const events=[];const admin=['Admin','HR'].includes(user.role);
 const name=id=>current.employees?.find(e=>e.id===id)?.name||current.teamPresence?.find(e=>e.id===id)?.name||'An employee';
 for(const [collection,page] of Object.entries(modules)){
  const before=new Map((previous?.[collection]||[]).map(row=>[row.id,row]));
  for(const row of current[collection]||[]){
   const old=before.get(row.id);let message='';
   if(collection==='tasks'&&(!old||['status','assignee','title','projectId','priority','due','description','attachments'].some(key=>old[key]!==row[key])))message=!old||old.assignee!==row.assignee?`Task assigned${row.assignee===user.id?' to you':''}: ${row.title}`:`Task ${row.title}: ${row.status}`;
   if(collection==='projects'&&(!old||['owner','status','name','description','department','due'].some(key=>old[key]!==row[key])))message=!old||old.owner!==row.owner?`Project assigned${row.owner===user.id?' to you':''}: ${row.name}`:`Project ${row.name}: ${row.status}`;
   if(collection==='leaves'&&(!old||old.status!==row.status||old.start!==row.start||old.end!==row.end||old.type!==row.type||old.reason!==row.reason||old.duration!==row.duration||old.half!==row.half||old.totalDays!==row.totalDays||old.approverId!==row.approverId||old.rejectionReason!==row.rejectionReason)&&(admin||row.employeeId===user.id||row.approverId===user.id))message=row.status==='Pending'?`${name(row.employeeId)} ${old?'updated their':'requested'} ${row.type}${row.type==='Work from home (WFH)'?'':' leave'} (${row.start} to ${row.end})`:`${row.employeeId===user.id?'Your':name(row.employeeId)+"'s"} ${row.type==='Work from home (WFH)'?'WFH request':'leave'} was ${row.status.toLowerCase()} (${row.start} to ${row.end})`;
   if(collection==='announcements'&&(!old||old.title!==row.title||old.message!==row.message))message=`Announcement: ${row.title}`;
   if(collection==='employees'&&(admin||row.id===user.id)&&row.status!=='Deleted'&&(!old||['status','role','name','email','department','designation'].some(key=>old[key]!==row[key])))message=!old?`${row.name}: ${row.status==='Pending'?'account awaiting approval':'employee added'}`:`${row.name}: ${row.role}, ${row.status}`;
   if(previous&&collection==='attendance'&&(!old||['checkIn','checkOut','date','employeeId'].some(key=>old[key]!==row[key])))message=old&&old.checkOut?`Attendance updated for ${name(row.employeeId)} (${row.date})`:`${name(row.employeeId)} punched ${row.checkOut?'out':'in'} (${row.date})`;
   if(!previous&&collection==='employees'&&row.status!=='Pending')message='';
   if(!previous&&collection==='leaves'&&row.status==='Pending'&&!admin&&row.approverId!==user.id)message='';
   if(message)events.push({id:JSON.stringify([collection,row.id,row.status,row.assignee,row.owner,row.role,row.checkOut,row.title,row.message,row.start,row.end,row.type,row.reason,row.name,row.email,row.department,row.designation,row.due,row.description,row.projectId,row.priority,row.summary,row.hours,row.blockers,row.date,row.checkIn,row.attachments,row.duration,row.half,row.totalDays,row.approverId,row.rejectionReason]),message,details:collection==='announcements'?row.message:collection==='tasks'||collection==='projects'?row.description:collection==='leaves'?[row.reason,row.rejectionReason].filter(Boolean).join('\n'):undefined,page:collection==='employees'&&!['Admin','HR','Team Leader'].includes(user.role)?'Settings':page});
  }
 }
 if(previous)for(const leave of previous.leaves||[]){if(!(current.leaves||[]).some(row=>row.id===leave.id)&&(admin||leave.employeeId===user.id||leave.approverId===user.id))events.push({id:JSON.stringify(['leaves',leave.id,'deleted']),message:`${name(leave.employeeId)} deleted a leave request (${leave.start} to ${leave.end})`,page:'Leave requests'});}
 if(previous)for(const collection of ['tasks','projects','attendance','announcements'])for(const row of previous[collection]||[]){if(!(current[collection]||[]).some(currentRow=>currentRow.id===row.id))events.push({id:JSON.stringify([collection,row.id,'removed']),message:(row.title||row.name||modules[collection]+' record')+' is no longer in your workspace',page:modules[collection]});}
 if(current.workReportReminder?.missing)events.push({id:JSON.stringify(['workReportReminder',user.id,current.workReportReminder.day]),message:'Your daily work report is pending ('+current.workReportReminder.day+'). Add your progress before wrapping up.',page:'Daily Work Report'});
 return events;
}
