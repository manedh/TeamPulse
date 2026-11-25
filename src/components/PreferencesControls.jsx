import React from 'react';
import {Moon,Sun} from 'lucide-react';
import {usePreferences} from './PreferencesProvider.jsx';
export default function PreferencesControls(){
 const {theme,setTheme,t}=usePreferences();
 return <div className="preferences-controls"><button type="button" className="theme-toggle" aria-label={t(theme==='dark'?'Light mode':'Dark mode')} title={t(theme==='dark'?'Light mode':'Dark mode')} aria-pressed={theme==='dark'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button></div>;
}
