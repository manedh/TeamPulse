import {usePreferences} from './PreferencesProvider.jsx';
import React from 'react';
export default function Records({rows,columns,extra,extraTitle='Review'}){
 const {t,language}=usePreferences();return <div className="tablewrap"><table><thead><tr>{columns.map(([k,l])=><th key={k}>{t(l)}</th>)}{extra&&<th>{t(extraTitle)}</th>}</tr></thead><tbody>{rows.map(r=><tr key={r.id}>{columns.map(([k,,f])=><td key={k}>{f?f(r[k]):['type','status','priority','role','department'].includes(k)?t(r[k]||'—'):r[k]||'—'}</td>)}{extra&&<td>{extra(r)}</td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty">{t("No records yet. New updates will appear here.")}</div>}</div>}
