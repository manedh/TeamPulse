import {usePreferences} from './PreferencesProvider.jsx';
import TaskEditor from './TaskEditor.jsx';
import React,{useEffect,useRef} from 'react';
import {X} from 'lucide-react';
import {departments,suggestDepartment} from '../data/departments.js';
import {recordLabels,istDateTimeInput,attendanceFormRecord} from '../utils/records.js';
export default function RecordEditor(props){
 const {t,language}=usePreferences();return props.collection==='tasks'?<TaskEditor {...props}/>:<GenericRecordEditor {...props}/>;}
function GenericRecordEditor({collection,record,db,user,busy,error,onClose,mutate}){
 const {t,language}=usePreferences();
 const dialog=useRef(null);const heading=(record?'Edit ':'Add ')+recordLabels[collection];
 useEffect(()=>{const previous=document.activeElement;dialog.current?.querySelector('input,select,textarea')?.focus();return()=>previous?.focus?.();},[]);
 const options=values=>values.map(value=>[value,value]);
 const people=db.employees.filter(employee=>employee.status==='Active');
 const fields={
  employees:[['name','Full name'],['email','Work email','email'],['department','Department',options(departments)],['designation','Designation']],
  projects:[['name','Project name'],['description','Description','textarea'],['department','Department',options(departments)],['owner','Owner',people.filter(person=>['Admin','Team Leader'].includes(person.role)&&(user.role!=='Team Leader'||person.id===user.id)).map(person=>[person.id,person.name])],['due','Due date','date'],['status','Status',options(['Planning','In progress','Completed'])]],
  announcements:[['title','Title'],['message','Message','textarea']],
  attendance:[['employeeId','Employee',db.employees.filter(person=>person.status!=='Deleted'||person.id===record?.employeeId).map(person=>[person.id,person.name])],['date','Attendance date (IST)','date'],['checkIn','Punch in (IST)','datetime-local'],['checkOut','Punch out (IST)','datetime-local']]
 }[collection];
 async function submit(event){event.preventDefault();let values=Object.fromEntries(new FormData(event.currentTarget));if(collection==='attendance')values=attendanceFormRecord(values);if(await mutate(record?'updateRecord':'createAttendance',{collection,id:record?.id,record:values}))onClose();}
 function keys(event){if(event.key==='Escape'&&!busy)onClose();if(event.key==='Tab'){const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}
 return <div className="modalback" onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><section className="modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="record-editor-title" onKeyDown={keys}><div className="panelhead"><h3 id="record-editor-title">{t(heading)}</h3><button disabled={busy} aria-label={t("Close editor")} onClick={onClose}><X size={18}/></button></div><form onSubmit={submit}>{error&&<p className="error" role="alert">{t(error)}</p>}{collection==='attendance'&&<p className="muted">{t("Admin/HR corrections use IST. Enter a completed session. Original captured locations remain part of the punch history.")}</p>}{fields.map(([name,label,type='text',required=true])=>{
 let value=record?.[name]??'';if(name==='department')value=suggestDepartment(value,collection==='employees'?record?.designation:'');if(type==='datetime-local')value=istDateTimeInput(value);
 const choices=Array.isArray(type)?(value&&!type.some(([key])=>key===value)?[[value,value],...type]:type):null;
 return <label key={name}>{t(label)}{name==='department'&&record?.department&&!departments.includes(record.department)&&<small>{t('Current: {department}. Choose the matching department.',{department:record.department})}</small>}{choices?<select name={name} defaultValue={value} required={required}><option value="" disabled>{t('Select {label}',{label:t(label).toLowerCase()})}</option>{choices.map(([key,text])=><option key={key} value={key}>{['department','status','priority','role','type'].includes(name)?t(text):text}</option>)}</select>:type==='textarea'?<textarea name={name} defaultValue={value} required={required} maxLength={1000} rows={3}/>:<input name={name} type={type} defaultValue={value} required={required} maxLength={name==='email'||name==='name'||name==='department'||name==='designation'?150:1000} min={type==='number'?0.25:undefined} max={type==='number'?24:undefined} step={type==='number'?0.25:type==='datetime-local'?1:undefined}/>}</label>;
 })}<button className="primary" disabled={busy}>{t(busy?'Saving…':'Save changes')}</button></form></section></div>;
}
