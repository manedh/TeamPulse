import {usePreferences} from './PreferencesProvider.jsx';
import React from 'react';
import {locationMessage} from '../utils/location.js';
export default function PunchLocation({event,label}){
 const {t,language}=usePreferences();
 if(!event)return <div className="punchlocation"><b>{t(label)}</b><p>{t("No saved location received for this punch. Automatic sync will check for updates.")}</p></div>;
 if(event.status!=='captured')return <div className="punchlocation"><b>{t(label)}</b><p>{locationMessage(event)}</p></div>;
 const latitude=Number(event.latitude),longitude=Number(event.longitude);
 if(event.latitude===''||event.longitude===''||event.latitude==null||event.longitude==null||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return <p>{t("Saved coordinates are invalid.")}</p>;
 return <div className="punchlocation"><b>{t(label)}</b><p>{latitude.toFixed(6)}, {longitude.toFixed(6)}<br/>{t("Accuracy:")} {Math.round(Number(event.accuracy))} {t("m")}<br/>{new Date(event.created).toLocaleString(language==='hi'?'hi-IN':'en-IN',{timeZone:'Asia/Kolkata'})}</p></div>;
}
