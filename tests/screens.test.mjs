import {translateUi} from '../src/i18n/messages.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('every screen renders empty and populated workspaces for all four roles',async t=>{
 globalThis.sessionStorage={getItem:()=>null};
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});
 t.after(async()=>{await server.close();delete globalThis.sessionStorage;});
 const {default:PreferencesProvider}=await server.ssrLoadModule('/src/components/PreferencesProvider.jsx');
 const noop=()=>{};
 const employee={id:'e1',name:'Test Employee',email:'test@example.com',status:'Active',role:'Employee',department:'IT',designation:'Developer'};
 const other={...employee,id:'e2',name:'Other Employee',status:'Pending'};
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 const record={id:'a1',employeeId:'e1',date,checkIn:new Date().toISOString(),checkOut:new Date().toISOString()};
 for(const page of ['Login','Overview','Employees','Messages','Projects','Tasks','Attendance','LeaveRequests','Announcements','DailyWorkReport','Settings']){
 const {default:Screen}=await server.ssrLoadModule('/src/pages/'+page+'.jsx');
 for(const role of ['Admin','HR','Team Leader','Employee'])for(const language of ['en'])for(const populated of [false,true])await t.test(`${page}: ${role}, ${language}, ${populated?'populated':'empty'}`,()=>{
 const db={employees:populated?[employee,other]:[],projects:populated?[{id:'p1',name:'Project',owner:'e1',status:'In progress',due:date}]:[],tasks:populated?[{id:'t1',title:'Task',projectId:'p1',assignee:'e1',status:'To do',due:date}]:[],attendance:populated?[record]:[],worklogs:populated?[{id:'w1',employeeId:'e1',date,summary:'Work',hours:2}]:[],leaves:populated?[{id:'l1',employeeId:'e1',start:date,end:date,status:'Pending'}]:[],announcements:populated?[{id:'n1',title:'Notice',message:'Message'}]:[]};
 const props={...db,db,me:{...employee,role},role,admin:['Admin','HR'].includes(role),lead:role!=='Employee',open:db.tasks,currentAttendance:populated?record:null,search:'',busy:false,accessEvents:[],attendanceDate:date,syncedAt:'',punchStage:'',location:null,employee:()=>employee.name,initials:()=> 'TE',filtered:rows=>rows,badge:s=>React.createElement('span',null,s),taskTable:()=>React.createElement('div',null,'Tasks'),setSearch:noop,mutate:noop,setModal:noop,setAttendanceDate:noop,changePassword:noop,setError:noop,setPage:noop,load:noop,setBusy:noop,setNotice:noop,fail:noop,syncAttendance:noop,onLogin:noop};
 const html=renderToStaticMarkup(React.createElement(PreferencesProvider,{initialPreferences:{language,theme:'light'}},React.createElement(Screen,props)));assert.ok(html.length>0);
 if(page==='LeaveRequests'){assert.equal(html.includes('>'+translateUi(language,'Edit')+'</button>'),populated);assert.equal(html.includes('>'+translateUi(language,'Delete')+'</button>'),populated);}
 if(page==='Settings')assert.equal(html.includes(translateUi(language,'Match existing departments')),props.admin);
 if(page==='Overview')assert.equal(html.includes(translateUi(language,'Team attendance today')),props.admin);
 if(['Attendance','Settings'].includes(page))assert.equal(/>Refresh[^<]*<\/button>/.test(html),false);
 if(page==='Attendance'){assert.equal(html.includes(translateUi(language,'Download Excel')),props.admin);assert.equal(html.includes(translateUi(language,'Employee filter')),props.admin);}
 });
 }
});

test('record editors render populated fields for each editable module',async t=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});t.after(()=>server.close());
 const {default:Editor}=await server.ssrLoadModule('/src/components/RecordEditor.jsx');
 const db={employees:[{id:'a',name:'Admin',role:'Admin',status:'Active'},{id:'e',name:'Employee',role:'Employee',status:'Active'}],projects:[{id:'p',name:'Project',owner:'a'}]};
 const records={employees:{id:'e',name:'Employee',email:'employee@example.com',department:'Legacy department',designation:'Developer'},projects:{id:'p',name:'Project',description:'Scope',owner:'a',department:'IT',due:'2026-10-28',status:'Planning'},tasks:{id:'t',title:'Task',projectId:'p',assignee:'e',priority:'High',due:'2026-10-28',status:'To do'},announcements:{id:'n',title:'Notice',message:'Hello'},attendance:{id:'at',employeeId:'e',date:'2026-10-28',checkIn:'2026-10-28T03:30:00Z',checkOut:'2026-10-28T11:30:00Z'}};
 for(const [collection,record]of Object.entries(records)){
 const html=renderToStaticMarkup(React.createElement(Editor,{collection,record,db,user:db.employees[0],busy:false,error:'',onClose:()=>{},mutate:()=>{}}));
 assert.ok(html.includes('Save changes'));assert.ok(html.includes('role="dialog"'));
 for(const key of Object.keys(record).filter(key=>key!=='id'))assert.ok(html.includes('name="'+key+'"'),collection+': '+key);
 if(collection==='attendance')assert.ok(html.includes('2026-10-28T09:00:00'));
 if(collection==='employees')assert.ok(html.includes('Legacy department'));
 }
});

test('Admin and Team Leader use the same complete task form',async t=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});t.after(()=>server.close());
 const {default:Editor}=await server.ssrLoadModule('/src/components/TaskEditor.jsx');
 const db={employees:[],taskAssignees:[{id:'e',name:'Employee Name'}],projects:[{id:'p',name:'Owned project',owner:'l'},{id:'q',name:'Other project',owner:'a'}]};
 for(const user of [{id:'a',role:'Admin'},{id:'l',role:'Team Leader'}]){
 const html=renderToStaticMarkup(React.createElement(Editor,{db,user,busy:false,error:'',onClose:()=>{},mutate:()=>{}}));
 for(const field of ['title','description','projectId','assignee','priority','due','status'])assert.ok(html.includes('name="'+field+'"'),user.role+': '+field);
 for(const text of ['Instructions and expected result','None','Employee Name','Low','Medium','High','Urgent','No due date','Attachments / links','Blocked','In review','Completed'])assert.ok(html.includes(text),user.role+': '+text);
 assert.ok(html.includes('value="To do" selected=""'));assert.ok(html.includes('value="" selected="">None'));
 assert.equal(html.includes('Other project'),user.role==='Admin');assert.equal(html.includes('type="file"'),false);
 }
});

test('leave editor shows account name, required details and calculated half-day total in English',async t=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});t.after(()=>server.close());const {default:Editor}=await server.ssrLoadModule('/src/components/LeaveEditor.jsx');const {default:Provider}=await server.ssrLoadModule('/src/components/PreferencesProvider.jsx');
 for(const language of ['en']){const html=renderToStaticMarkup(React.createElement(Provider,{initialPreferences:{language,theme:'light'}},React.createElement(Editor,{user:{id:'e',name:'Logged In Employee'},db:{employees:[{id:'h',name:'Approver Name',role:'HR',status:'Active'}]},record:{type:'Other',start:'2026-11-02',end:'2026-11-02',duration:'Half day',half:'First half',reason:'Personal'},mutate:()=>{},onClose:()=>{}})));
 assert.ok(html.includes('Logged In Employee'));assert.ok(html.includes('readOnly'));assert.ok(html.includes('Approver Name'));assert.ok(html.includes('>0.5</output>'));for(const field of ['type','start','end','duration','half','reason'])assert.ok(html.includes('name="'+field+'"'));assert.equal(html.includes('name="employeeId"'),false);assert.equal(html.includes('name="status"'),false);}
});

test('employee account sees only department teammates without management controls or private contacts',async t=>{globalThis.sessionStorage={getItem:()=>null};t.after(()=>{delete globalThis.sessionStorage;});const server=await createServer({server:{middlewareMode:true},appType:'custom'});t.after(()=>server.close());const {default:Screen}=await server.ssrLoadModule('/src/pages/Employees.jsx');const me={id:'e',name:'Employee One',role:'Employee',status:'Active',department:'Software Developer',email:'own@example.test'};const other={id:'x',name:'Employee Two',role:'Employee',status:'Active',department:'Software Engineer'};const html=renderToStaticMarkup(React.createElement(Screen,{db:{employees:[me],employeeDirectory:[{id:me.id,name:me.name,role:me.role,status:me.status,department:me.department},other,{id:'outside',name:'Outside Department',department:'HR',role:'Employee',status:'Active'}],teamPresence:[]},me,role:'Employee',admin:false,search:'',filtered:rows=>rows,initials:()=> 'E',badge:value=>value,setSearch:()=>{}}));assert.equal((html.match(/class="personcard"/g)||[]).length,2);assert.ok(html.includes('Employee Two'));assert.equal(html.includes('Outside Department'),false);assert.ok(html.includes('2 teammates'));assert.equal(html.includes('Delete employee'),false);assert.equal(html.includes('>Edit</button>'),false);});

test('group leave selection is available to leaders and includes select-all and member checkboxes',async t=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});t.after(()=>server.close());
 const {default:Editor}=await server.ssrLoadModule('/src/components/LeaveEditor.jsx');
 for(const role of ['Team Leader','Admin','Employee','HR']){
 const html=renderToStaticMarkup(React.createElement(Editor,{user:{id:'l',name:'Leader',role},db:{employees:[],leaveRequestMembers:[{id:'e',name:'Member'}]},busy:false,onClose:()=>{},mutate:()=>{}}));
 assert.equal(html.includes('Team / group'),['Team Leader','Admin'].includes(role));
 }
});
