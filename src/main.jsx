import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import PasswordRecovery from './pages/PasswordRecovery.jsx';
import PreferencesProvider from './components/PreferencesProvider.jsx';
import {readPreferences} from './i18n/messages.js';
import './styles/index.css';

try{const saved=readPreferences(localStorage);document.documentElement.lang=saved.language;document.documentElement.dataset.theme=saved.theme;}catch{}
const resetRoute=window.location.pathname==='/reset-password';
let recoveryToken=null;
if(resetRoute){recoveryToken=new URLSearchParams(window.location.hash.slice(1)).get('token');window.history.replaceState(null,'','/reset-password');}
createRoot(document.getElementById('root')).render(<PreferencesProvider>{resetRoute?<PasswordRecovery mode="reset" token={recoveryToken} onBack={()=>window.location.replace('/')}/>:<App/>}</PreferencesProvider>);
