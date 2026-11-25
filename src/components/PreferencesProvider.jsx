import React,{createContext,useCallback,useContext,useEffect,useState} from 'react';
import {translateUi,readPreferences,savePreferences} from '../i18n/messages.js';
const PreferencesContext=createContext({language:'en',theme:'light',t:(key,parameters)=>translateUi('en',key,parameters),setTheme:()=>{}});
export function usePreferences(){return useContext(PreferencesContext);}
export default function PreferencesProvider({children,initialPreferences}){
 const [preferences,setPreferences]=useState(()=>{if(initialPreferences)return {language:'en',theme:initialPreferences.theme==='dark'?'dark':'light'};try{return readPreferences(window.localStorage);}catch{return readPreferences();}});
 const {language,theme}=preferences;
 const t=useCallback((key,parameters)=>translateUi(language,key,parameters),[language]);
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dataset.theme=theme;try{savePreferences(window.localStorage,preferences);}catch{}},[preferences,language,theme]);
 useEffect(()=>{const sync=event=>{if(event.key==='teampulse-preferences-v1'){try{setPreferences(readPreferences(window.localStorage));}catch{}}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 return <PreferencesContext.Provider value={{language,theme,t,setTheme:value=>setPreferences(old=>({...old,theme:value==='dark'?'dark':'light'}))}}>{children}</PreferencesContext.Provider>;
}
