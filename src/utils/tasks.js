export const taskPriorities=['Low','Medium','High','Urgent'];
export const taskStatuses=['To do','In progress','Blocked','In review','Completed'];
export const completedTask=task=>['Completed','Done'].includes(task.status);
export const taskStatus=value=>value==='Done'?'Completed':value||'To do';
export function taskAttachments(value){try{const parsed=typeof value==='string'?JSON.parse(value||'[]'):value;return Array.isArray(parsed)?parsed:[];}catch{return [];}}
export function taskLinks(value){return String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(url=>{let parsed;try{parsed=new URL(url);}catch{throw new Error('Enter a complete http:// or https:// link on each line.');}if(!['http:','https:'].includes(parsed.protocol)||url.length>2000)throw new Error('Links must use http:// or https:// and be at most 2,000 characters.');return {type:'link',url};});}
