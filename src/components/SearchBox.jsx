import {usePreferences} from './PreferencesProvider.jsx';
import React from 'react';
import {Search} from 'lucide-react';
export default function SearchBox({value,set}){
 const {t,language}=usePreferences();return <label className="search"><Search size={16}/><input aria-label={t('Search records')} placeholder={t('Search records…')} value={value} onChange={e=>set(e.target.value)}/></label>}
