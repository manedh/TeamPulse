import {usePreferences} from './PreferencesProvider.jsx';
﻿import React from 'react';
import {taskAttachments} from '../utils/tasks.js';
export default function TaskAttachments({task}){
 const {t,language}=usePreferences();
 const links=taskAttachments(task.attachments).filter(item=>item.type==='link'&&/^https?:\/\//i.test(item.url));
 return <div className="taskattachments">{links.length?links.map((item,index)=><a key={index} href={item.url} target="_blank" rel="noopener noreferrer">{item.name||item.url}</a>):<small>{t("Attachments: None")}</small>}</div>;
}
