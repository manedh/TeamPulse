import {departmentTeammates} from '../utils/team.js';
import {usePreferences} from '../components/PreferencesProvider.jsx';
import EmployeeDeleteButton from '../components/EmployeeDeleteButton.jsx';
import RecordActions from '../components/RecordActions.jsx';
import React,{useState} from 'react';
import SearchBox from '../components/SearchBox.jsx';

export default function Employees({admin,db,me,role,search,setSearch,filtered,employee,initials,badge,mutate,busy,onEdit}){
 const {t,language}=usePreferences();
 const [showDeleted,setShowDeleted]=useState(false);
 const deleted=db.employees.filter(e=>e.status==='Deleted');
 const summaries=db.teamPresence||[];
 const directory=db.employeeDirectory|| (summaries.length?summaries:db.employees);
 const employees=departmentTeammates(directory.filter(e=>e.status!=='Deleted'),me).map(person=>({...db.employees.find(e=>e.id===person.id),...person,...summaries.find(e=>e.id===person.id)}));
 const directoryUnavailable=!admin&&!Array.isArray(db.employeeDirectory)&&!summaries.length;
 const visibleEmployees=filtered(admin&&showDeleted?db.employees:employees);
 return <>{<section className="panel peoplepanel"><div className="panelhead"><div><h3>{t(admin?'Our people':'Your department teammates')}</h3>{!admin&&<p className="muted">{me.department||'Your department has not been assigned yet.'}</p>}<p role="status">{t(admin?(employees.length===1?'{count} employee':'{count} employees'):(employees.length===1?'{count} teammate':'{count} teammates'),{count:employees.length})}{search.trim()&&<> · {t('{count} matching',{count:visibleEmployees.length})}</>}</p>{admin&&deleted.length>0&&<label className="taskcheck"><input type="checkbox" checked={showDeleted} onChange={event=>setShowDeleted(event.target.checked)}/>{t('Show previously deleted accounts ({count})',{count:deleted.length})}</label>}</div><SearchBox value={search} set={setSearch}/></div>{directoryUnavailable&&<p className="error" role="status">{t('Your department directory is unavailable. Ask your administrator to update the app.')}</p>}<div className="peoplegrid">{visibleEmployees.map(e=><article className="personcard" key={e.id}><i className="useravatar">{e.photo?<img src={e.photo} alt={e.name}/>:initials(e.name)}</i><h3>{e.name}</h3><p>{e.designation}</p>{badge(e.role)}<hr/><small>{e.department}</small>{e.email&&<a href={'mailto:'+e.email}>{e.email}</a>}<RecordActions collection="employees" record={e} user={me} db={db} onEdit={onEdit} mutate={mutate} busy={busy}/><div className="employeeaccess">{badge(e.status)}{e.id!==me.id&&admin&&(role==='Admin'||!['Admin','HR'].includes(e.role))&&<>{e.status!=='Deleted'&&<><select aria-label={'Role for '+e.name} disabled={busy} value={e.role} onChange={event=>mutate('employeeAccess',{id:e.id,role:event.target.value,status:e.status})}>{(role==='Admin'?['Employee','Team Leader','HR','Admin']:['Employee','Team Leader']).map(r=><option key={r} value={r}>{t(r)}</option>)}</select><button disabled={busy} onClick={()=>mutate('employeeAccess',{id:e.id,role:e.role,status:e.status==='Active'?'Inactive':'Active'})}>{t(e.status==='Pending'?'Approve account':e.status==='Active'?'Disable access':'Activate account')}</button></>}<EmployeeDeleteButton employee={e} mutate={mutate} busy={busy}/></>}</div></article>)}</div></section>}</>;
}
