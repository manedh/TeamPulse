import React,{useState} from 'react';
import Messenger from '../components/Messenger.jsx';
export default function Messages({me,selectedPeer,onSelectPeer}){
 const [peer,setPeer]=useState(null);
 return <Messenger me={me} peer={onSelectPeer?selectedPeer:peer} onPeer={onSelectPeer||setPeer}/>;
}
