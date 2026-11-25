import {test} from 'node:test';
import {backend} from './helpers/backend.mjs';
import {roles,casesFor} from './helpers/role-cases.mjs';

for(const role of roles)for(const entry of casesFor(role)){
 test(`${entry.id} ${role.name}: ${entry.title}`,()=>entry.run(backend(role.email)));
}
