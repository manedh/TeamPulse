import fs from 'node:fs';
import vm from 'node:vm';
fs.mkdirSync('deployment',{recursive:true});
const combined=['Bcrypt.gs','Code.gs','Auth.gs','Seed.gs'].map(name=>`\n// ---- ${name} ----\n`+fs.readFileSync('apps-script/'+name,'utf8')).join('\n');
new vm.Script(combined,{filename:'deployment/Code.gs'});
fs.writeFileSync('deployment/Code.gs',combined);
for(const name of ['appsscript.json','BCRYPT-LICENSE.txt'])fs.copyFileSync('apps-script/'+name,'deployment/'+name);
console.log('Deployment prepared: one combined Code.gs, Index.html, manifest and license.');
