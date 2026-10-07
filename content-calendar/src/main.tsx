import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Board from './board';
import {connect,useLocal,registerTools} from './cloud';
function App(){
  const [user,setUser]=useState<any>(null),[services,setServices]=useState<any>(null),[error,setError]=useState(''),[ready,setReady]=useState(false),[local,setLocal]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{let dispose=()=>{};void connect(u=>{setUser(u);setReady(true);setError('');},e=>{setError(e.message);setReady(true);}).then(s=>{setServices(s);dispose=s.stop;}).catch(()=>{setError('Sign-in is unavailable. Check your internet connection and try again.');setReady(true);});return()=>dispose();},[]);
  useEffect(()=>{if(user||local)return registerTools();},[user,local]);
  if(!user&&!local)return <main className="signin"><a href="../">← Nurture Day</a><p className="eyebrow">YOUR NEXT IDEA STARTS HERE</p><h1>Content Project Board</h1><p>Capture a thought, shape a project, and take the next small step.</p><p>Sign in with the same Google account on your phone and desktop to share a private board.</p><button className="primary" disabled={!services||busy} onClick={async()=>{setBusy(true);setError('');try{await services.login();}catch{setError('Google sign-in was canceled or blocked. Allow the sign-in window and try again.');}finally{setBusy(false);}}}>{!ready?'Connecting…':busy?'Signing in…':'Continue with Google'}</button><button className="secondary" onClick={()=>{useLocal();setLocal(true);}}>Try on this device</button><small>Device-only projects stay in this browser and do not sync to your phone.</small>{error&&<p role="alert" className="editor-error">{error}</p>}</main>;
  return <><div className="account-strip"><a href="../">← Nurture Day</a><span>{local?'Device-only board':user.email||'Private account'}<button className="text-button" onClick={async()=>{if(local)window.location.reload();else await services.logout();}}>{local?'Sign in for cloud sync':'Sign out'}</button></span></div><Board key={local?'local':user.uid} displayName={local?'This device':user.displayName||'Your account'}/></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
