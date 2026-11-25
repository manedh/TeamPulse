import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
const source=fs.readFileSync('apps-script/Code.gs','utf8');
const auth=fs.readFileSync('apps-script/Auth.gs','utf8');
const bcryptSource=fs.readFileSync('apps-script/Bcrypt.gs','utf8');
export const password='My long password 2026!';
const passwordHash=bcrypt.hashSync(password,12);
export function backend(email='admin@company.test'){
 const schemaCtx=vm.createContext({});vm.runInContext(source,schemaCtx);const headers=vm.runInContext('SCHEMA',schemaCtx);
 const sheets=Object.fromEntries(Object.entries(headers).map(([k,h])=>[k,[[...h]]]));
 const add=(k,r)=>sheets[k].push(headers[k].map(h=>r[h]??''));
 for(const [id,role]of [['a','Admin'],['h','HR'],['l','Team Leader'],['e','Employee'],['x','Employee']]){
 const userEmail=(id==='a'?'admin':id)+'@company.test';add('employees',{id,name:id,email:userEmail,role,status:'Active'});add('credentials',{id:'c-'+id,employeeId:id,email:userEmail,passwordHash,failedAttempts:0});}
 add('projects',{id:'p',name:'Owned',owner:'l'});add('projects',{id:'q',name:'Other',owner:'a'});
 add('tasks',{id:'t',title:'Task',projectId:'p',assignee:'e',status:'To do'});add('tasks',{id:'v',title:'Private',projectId:'q',assignee:'x',status:'To do'});
 add('leaves',{id:'lv',employeeId:'e',start:'2026-10-20',end:'2026-10-21',status:'Pending'});
 const employee=sheets.employees.slice(1).find(r=>r[2]===email);const token=employee?'test-token-'+crypto.randomBytes(24).toString('hex'):'';
 const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
 if(employee)add('sessions',{id:'session',employeeId:employee[0],tokenHash:digest(token),expires:'2099-01-01T00:00:00.000Z',revoked:''});
 const reads={};let opens=0,scriptLocked=false;
 const sheet=k=>sheets[k]?({getDataRange:()=>({getValues:()=>{reads[k]=(reads[k]||0)+1;return sheets[k].map(r=>[...r])}}),appendRow:r=>sheets[k].push(r),deleteRow:row=>sheets[k].splice(row-1,1),getLastRow:()=>sheets[k].length,setFrozenRows(){},getRange:(row,col,n,w)=>({getValues:()=>sheets[k].slice(row-1,row-1+n).map(r=>r.slice(col-1,col-1+w)),setValues:rs=>rs.forEach((r,i)=>sheets[k][row-1+i].splice(col-1,w,...r))})}):null;
 const properties={SPREADSHEET_ID:'sheet',ADMIN_EMAIL:'admin@company.test'};
 const ctx=vm.createContext({console:{error:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||null,setProperty:(k,v)=>properties[k]=v,deleteProperty:k=>delete properties[k]})},SpreadsheetApp:{openById:()=>{opens++;return {getSheetByName:sheet,insertSheet:k=>{sheets[k]=[];return sheet(k)}}}},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,v)=>Array.from(crypto.createHash('sha256').update(v).digest()).map(b=>b>127?b-256:b),formatDate:()=> '2026-10-14'},LockService:{getScriptLock:()=>{let acquired=false;return {waitLock(){if(scriptLocked)throw Error('Script lock busy.');scriptLocked=true;acquired=true;},hasLock:()=>acquired,releaseLock(){if(acquired)scriptLocked=false;acquired=false;}};}}});
 vm.runInContext(bcryptSource,ctx);vm.runInContext(auth,ctx);vm.runInContext(source,ctx);
 return {call:(action,payload={},customToken=token)=>ctx.api({action,payload,token:customToken}),sheets,properties,ctx,token,reads,opens:()=>opens};
}
