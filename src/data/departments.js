export const departments=['AI/ML Developer','Software Developer','HR','Web Development','Mobile App Development','Data Science','Quality Assurance / Testing','DevOps / Cloud','UI/UX Design','IT Support','Sales & Marketing','Finance & Accounts','Operations','Management','Others'];
const key=value=>String(value||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const aliases={
 'AI/ML Developer':['AI ML','AL ML','AL ML Developer','AI ML Engineer','AI Developer','ML Developer','Machine Learning','Machine Learning Engineer','Artificial Intelligence','Artificial Intelligence and Machine Learning'],
 'Software Developer':['Software Development','Software Engineer','Software Engineering','Software'],
 HR:['Human Resources','Human Resource','Human Resource Management','HR Department','HR Executive','HR Manager','HR Recruiter','Recruiter'],
 'Web Development':['Web Developer','Frontend Developer','Front End Developer','Backend Developer','Back End Developer','Full Stack Developer','Fullstack Developer'],
 'Mobile App Development':['Mobile Developer','Mobile App Developer','Android Developer','iOS Developer','Flutter Developer','React Native Developer'],
 'Data Science':['Data Scientist','Data Analyst','Data Analytics','Data Engineer'],
 'Quality Assurance / Testing':['QA','Quality Assurance','Testing','QA Engineer','Software Tester','Test Engineer','QA Tester'],
 'DevOps / Cloud':['DevOps','Cloud','DevOps Engineer','Cloud Engineer','Cloud Computing'],
 'UI/UX Design':['UI UX','UI UX Designer','UI Designer','UX Designer','UI UX Developer','Product Designer'],
 'IT Support':['Technical Support','IT Support Engineer','Technical Support Engineer','Help Desk'],
 'Sales & Marketing':['Sales','Marketing','Digital Marketing','Sales Executive','Marketing Executive','Business Development'],
 'Finance & Accounts':['Finance','Accounts','Accounting','Accountant','Finance and Accounting'],
 Operations:['Operation','Operations Executive','Operations Manager'],
 Management:['Manager','Administrator','Administration'],
 Others:['Other','Other Department']
};
const exact=new Map(departments.flatMap(department=>[department,...(aliases[department]||[])].map(value=>[key(value),department])));
export function matchDepartment(value){return exact.get(key(value))||'';}
export function suggestDepartment(value,designation=''){
 const existing=matchDepartment(value);if(existing)return existing;
 const title=key(designation).replace(/^(senior|junior|lead|principal|associate|trainee|intern)\s+/,'').replace(/\s+(intern|trainee)$/,'');
 return exact.get(title)||'';
}
export function departmentAssignments(db,user){
 if(!['Admin','HR'].includes(user?.role))return [];
 const employees=(db.employees||[]).filter(row=>row.status!=='Deleted'&&(user.role==='Admin'||row.id===user.id||!['Admin','HR'].includes(row.role))).map(row=>({collection:'employees',id:row.id,name:row.name,department:row.department||'',designation:row.designation||''}));
 const projects=(db.projects||[]).map(row=>({collection:'projects',id:row.id,name:row.name,department:row.department||'',designation:''}));
 return [...employees,...projects];
}
