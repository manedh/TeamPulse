// English interface; language is kept in the return shape for existing date formatters.
export function translateUi(_language,key,parameters={}){return String(key??'').replace(/\{(\w+)\}/g,(match,name)=>parameters[name]===undefined?match:String(parameters[name]));}
export function readPreferences(storage){try{const value=JSON.parse(storage?.getItem('teampulse-preferences-v1')||'null');return {language:'en',theme:value?.theme==='dark'?'dark':'light'};}catch{return {language:'en',theme:'light'};}}
export function savePreferences(storage,value){try{storage?.setItem('teampulse-preferences-v1',JSON.stringify({theme:value.theme==='dark'?'dark':'light'}));}catch{}}
export function notificationText(_language,message){return String(message??'');}
