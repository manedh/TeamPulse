import {matchDepartment} from '../data/departments.js';
export function teamDepartmentKey(value){return String(matchDepartment(value)||value||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();}
export function departmentTeammates(people,user){if(['Admin','HR'].includes(user?.role))return people;const department=teamDepartmentKey(user?.department);return people.filter(person=>String(person.id)===String(user?.id)||department&&teamDepartmentKey(person.department)===department);}
