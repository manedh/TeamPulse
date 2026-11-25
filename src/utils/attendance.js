// Shared attendance matching: date-only records and older ISO responses use India time.
export function indiaDate(value=new Date()){
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=type=>parts.find(p=>p.type===type).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function attendanceForDay(records,employeeId,now=new Date()){
 const day=indiaDate(now);const matches=records.filter(a=>String(a.employeeId)===String(employeeId)&&indiaDate(a.date)===day);return matches.find(a=>a.checkIn&&!a.checkOut)||matches.slice().reverse().sort((a,b)=>String(b.checkIn||'').localeCompare(String(a.checkIn||'')))[0]||null;
}

export function eventForPunch(row,events,action){
 const direct=events.find(e=>e.id===row.id+':'+action&&String(e.employeeId)===String(row.employeeId));if(direct)return direct;
 const timestamp=Date.parse(action==='punchIn'?row.checkIn:row.checkOut);if(!Number.isFinite(timestamp))return null;
 return events.filter(e=>e.action===action&&String(e.employeeId)===String(row.employeeId)&&Math.abs(Date.parse(e.created)-timestamp)<60000).sort((a,b)=>Math.abs(Date.parse(a.created)-timestamp)-Math.abs(Date.parse(b.created)-timestamp))[0]||null;
}

// A delayed read must not turn an already confirmed punch-out back into an open punch.
export function mergeAttendance(previous,incoming){
 const known=new Map(previous.map(row=>[String(row.id),row]));
 return incoming.map(row=>{const saved=known.get(String(row.id));return saved&&String(saved.employeeId)===String(row.employeeId)&&saved.checkOut&&!row.checkOut?{...row,checkOut:saved.checkOut}:row;});
}

// Filter history independently of today's signed-in-user punch controls.
export function attendanceForDate(records,date=''){
 return records.filter(row=>!date||indiaDate(row.date)===date).slice().sort((a,b)=>indiaDate(b.date).localeCompare(indiaDate(a.date))||String(b.checkIn||'').localeCompare(String(a.checkIn||'')));
}
