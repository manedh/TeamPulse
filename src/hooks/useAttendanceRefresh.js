import {useEffect} from 'react';

export default function useAttendanceRefresh(userId,syncAttendance){
 useEffect(()=>{if(!userId)return;syncAttendance();const refresh=()=>{if(document.visibilityState!=='hidden')syncAttendance();};const timer=setInterval(refresh,10000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[userId]);
}
