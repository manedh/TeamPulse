import {usePreferences} from '../components/PreferencesProvider.jsx';
import RecordActions from '../components/RecordActions.jsx';
import React from 'react';
import Records from '../components/Records.jsx';

export default function WorkLogs({worklogs,employee,db,me,onEdit,mutate,busy}){
 const {t,language}=usePreferences();
 return <>{<section className="panel"><div className="panelhead"><h3>{t("Daily progress")}</h3></div><Records extraTitle={t("Actions")} extra={row=><RecordActions collection="worklogs" record={row} user={me} db={db} onEdit={onEdit} mutate={mutate} busy={busy} allowDelete/>} rows={worklogs} columns={[['employeeId','Employee',employee],['date','Date'],['summary','Accomplishments'],['hours','Hours'],['blockers','Blockers']]}/></section>}</>;
}
