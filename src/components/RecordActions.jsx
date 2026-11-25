import {usePreferences} from './PreferencesProvider.jsx';
﻿import React from 'react';
import {canEditRecord,canDeleteRecord,recordLabels} from '../utils/records.js';
export default function RecordActions({collection,record,user,db,onEdit,mutate,busy,allowDelete=false}){
 const {t,language}=usePreferences();
 if(!canEditRecord(collection,record,user,db))return null;
 return <div className="actions recordactions"><button disabled={busy} aria-label={'Edit '+recordLabels[collection]+': '+(record.name||record.title||record.date||record.id)} onClick={()=>onEdit(collection,record)}>{t("Edit")}</button>{allowDelete&&canDeleteRecord(collection,record,user,db)&&<button disabled={busy} aria-label={'Delete '+recordLabels[collection]+': '+(record.title||record.date||record.id)} onClick={()=>{if(window.confirm(t('Delete this {type}? This cannot be undone.',{type:t(recordLabels[collection])})))mutate('deleteRecord',{collection,id:record.id});}}>{t("Delete")}</button>}</div>;
}
