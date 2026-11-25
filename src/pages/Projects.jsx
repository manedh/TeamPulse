import {usePreferences} from '../components/PreferencesProvider.jsx';
import {completedTask} from '../utils/tasks.js';
import RecordActions from '../components/RecordActions.jsx';
import React from 'react';
import {ArrowUpRight,FolderKanban} from 'lucide-react';
import SearchBox from '../components/SearchBox.jsx';

export default function Projects({admin,tasks,projects,search,setSearch,filtered,employee,badge,mutate,busy,setPage,onEdit,me,role,db}){
 const {t,language}=usePreferences();
 return <>{<><div className="toolbar"><SearchBox value={search} set={setSearch}/><span>{t('{count} projects in your workspace',{count:projects.length})}</span></div><div className="projectgrid">{filtered(projects).map(p=>{const ts=tasks.filter(t=>t.projectId===p.id);const progress=ts.length?Math.round(ts.filter(completedTask).length/ts.length*100):0;return <article className="panel project" key={p.id}><div className="projecttop"><span className="statIcon"><FolderKanban/></span>{badge(p.status)}</div><small>{t(p.department)}</small><h3>{p.name}</h3><p>{p.description}</p><div className="progresslabel"><span>{t("Task completion")}</span><b>{progress}%</b></div><div className="progress"><span style={{width:progress+'%'}}/></div><div className="projectfooter"><span>{t('{count} tasks',{count:ts.length})} · {employee(p.owner)}</span><span>{t('Due {date}',{date:p.due})}</span></div><button className="textbtn" onClick={()=>{setPage('Tasks');setSearch(p.name)}}>{t("View tasks")}<ArrowUpRight size={15}/></button><RecordActions collection="projects" record={p} user={me} db={db} onEdit={onEdit} mutate={mutate} busy={busy}/>{admin&&<div className="actions" style={{marginTop:18}}><button disabled={busy} aria-label={'Delete project: '+p.name} onClick={()=>{if(window.confirm(t('Delete project "{name}" and its {count} linked tasks? This cannot be undone.',{name:p.name,count:ts.length})))mutate('deleteProject',{id:p.id});}}>{t("Delete project")}</button></div>}</article>})}</div></>}</>;
}
