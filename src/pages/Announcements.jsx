import {usePreferences} from '../components/PreferencesProvider.jsx';
import RecordActions from '../components/RecordActions.jsx';
import React from 'react';
import {Megaphone} from 'lucide-react';

export default function Announcements({admin,db,mutate,busy,onEdit,me}){
 const {t,language}=usePreferences();
 return <>{<div className="projectgrid">{db.announcements.map(a=><article className="panel project" key={a.id}><Megaphone className="pinktext"/><h3>{a.title}</h3><p>{a.message}</p><p>{t("Created by:")}<strong>{a.createdByName||t('Unknown creator')}</strong></p><small>{a.created?new Date(a.created).toLocaleDateString(language==='hi'?'hi-IN':'en-IN',{timeZone:'Asia/Kolkata'}):''}</small><RecordActions collection="announcements" record={a} user={me} db={db} onEdit={onEdit} mutate={mutate} busy={busy}/>{admin&&<div className="actions" style={{marginTop:18}}><button disabled={busy} aria-label={'Delete announcement: '+a.title} onClick={()=>{if(window.confirm(t('Delete announcement "{name}"? This will remove it for everyone.',{name:a.title})))mutate('deleteAnnouncement',{id:a.id});}}>{t("Delete announcement")}</button></div>}</article>)}</div>}</>;
}
