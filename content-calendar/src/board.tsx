'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Plus,ArrowUpRight,RefreshCw,X,Layers,History,Archive,Check,ChevronRight} from 'lucide-react';
import {blankProject,stages,type Stage,type Project,type ProjectData,type Change} from './project-types';
import {api} from './cloud';

const descriptors:Record<Stage,string>={'Inbox':'Capture the spark','Exploring':'Find the question','Building / Researching':'Test and discover','Drafting':'Shape the story','Ready':'Final touches','Published':'Out in the world','Parked':'Keep for later'};
const fieldLabels:Record<string,string>={idea:'Core idea',audience:'Audience & value',question:'Central question / goal',angle:'Distinctive angle',deliverable:'Deliverable',nextAction:'Next action',learning:'Evidence & learning'};
const placeholders:Record<string,string>={idea:'What do you want to explore or create?',audience:'Who is this for, and why will it matter to them?',question:'What question should this project answer?',angle:'What experience, experiment, or perspective makes it yours?',deliverable:'A prototype, video, post, demo…',nextAction:'One concrete step you can take next.',learning:'Links, observations, results, and what changed your thinking.'};

export default function Board({displayName}:{displayName:string}){
  const [projects,setProjects]=useState<Project[]>([]),[changes,setChanges]=useState<Change[]>([]);
  const [view,setView]=useState<'board'|'parked'|'activity'>('board');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [editor,setEditor]=useState<{original:Project|null;data:ProjectData}|null>(null);
  const [editorError,setEditorError]=useState('');
  const [synced,setSynced]=useState<Date|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const refresh=useCallback(async()=>{
    try{const [p,c]=await Promise.all([api('/api/projects'),api('/api/changes')]);setProjects(p.projects);setChanges(c.changes);setSynced(new Date());setError('');}
    catch(e){setError((e as Error).message);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();const id=setInterval(()=>{if(document.visibilityState==='visible') void refresh();},15000);const focus=()=>void refresh();window.addEventListener('focus',focus);window.addEventListener('board-change',focus);return()=>{clearInterval(id);window.removeEventListener('focus',focus);window.removeEventListener('board-change',focus);};},[refresh]);
  useEffect(()=>{if(editor&&!dialog.current?.open) dialog.current?.showModal();if(!editor&&dialog.current?.open) dialog.current?.close();},[editor]);
  function open(project:Project|null,stage:Stage='Inbox'){
    setEditorError('');setEditor({original:project,data:project?{title:project.title,idea:project.idea,audience:project.audience,question:project.question,angle:project.angle,deliverable:project.deliverable,nextAction:project.nextAction,learning:project.learning,stage:project.stage}:{...blankProject,stage}});
  }
  async function save(event:React.FormEvent){
    event.preventDefault();if(!editor||busy)return;setBusy(true);setEditorError('');
    try{
      if(editor.original){
        const patch=Object.fromEntries(Object.entries(editor.data).filter(([key,value])=>value!==editor.original![key as keyof ProjectData]));
        if(Object.keys(patch).length) await api('/api/projects/'+editor.original.id,{method:'PATCH',body:JSON.stringify({expectedVersion:editor.original.version,patch})});
      }else{await api('/api/projects',{method:'POST',body:JSON.stringify(editor.data)});}
      setEditor(null);setNotice('Project saved');await refresh();
    }catch(e){setEditorError((e as Error).message);}finally{setBusy(false);}
  }
  async function move(project:Project,stage:Stage){
    if(busy||project.stage===stage)return;setBusy(true);setError('');
    try{await api('/api/projects/'+project.id,{method:'PATCH',body:JSON.stringify({expectedVersion:project.version,patch:{stage}})});setNotice('Moved to '+stage);await refresh();}
    catch(e){setError((e as Error).message);await refresh();setError((e as Error).message);}finally{setBusy(false);}
  }
  function download(){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),projects,changes},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='content-projects.json';a.click();URL.revokeObjectURL(url);}
  const visibleStages=view==='parked'?['Parked' as Stage]:stages.filter(s=>s!=='Parked');
  const activeCount=projects.filter(p=>!['Inbox','Published','Parked'].includes(p.stage)).length;
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="./"><span className="brand-mark"><Layers size={20}/></span><span>Content<br/><b>Project Board</b></span></a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Views">
        <button className={view==='board'?'nav-item selected':'nav-item'} onClick={()=>setView('board')}><Layers size={18}/>Projects<span>{projects.filter(p=>p.stage!=='Parked').length}</span></button>
        <button className={view==='parked'?'nav-item selected':'nav-item'} onClick={()=>setView('parked')}><Archive size={18}/>Parked<span>{projects.filter(p=>p.stage==='Parked').length}</span></button>
        <button className={view==='activity'?'nav-item selected':'nav-item'} onClick={()=>setView('activity')}><History size={18}/>Activity</button>
      </nav>
      <div className="sidebar-bottom"><span className="avatar">{displayName.charAt(0).toUpperCase()}</span><span className="account">{displayName}<small>Private workspace</small></span></div>
    </aside>
    <main>
      <header className="topbar"><span>Workspace <ChevronRight size={14}/> {view==='activity'?'Activity':view==='parked'?'Parked':'Projects'}</span><div className="sync" aria-live="polite"><i className={error?'offline':''}/>{error?'Connection needs attention':synced?'Connected':'Connecting'}<button className="icon-button" aria-label="Refresh projects" onClick={()=>void refresh()}><RefreshCw size={16}/></button></div></header>
      <div className="page-heading"><div><p className="eyebrow">A LITTLE STRUCTURE. ROOM TO EXPLORE.</p><h1>{view==='activity'?'What changed':view==='parked'?'For another day':'Make room for your ideas.'}</h1><p className="intro">{view==='activity'?'Follow updates from your board and conversations.':view==='parked'?'Good ideas can wait until the time is right.':'Capture a thought. Shape a project. Find your next step.'}</p></div><button className="primary" onClick={()=>open(null,view==='parked'?'Parked':'Inbox')}><Plus size={18}/>New idea</button></div>
      {error&&<div className="error-banner" role="alert">{error}</div>}
      <div className="board-toolbar"><span>{loading?'Loading projects…':`${projects.length} project${projects.length===1?'':'s'} · ${activeCount} in progress`}</span><div><span className="last-sync">{synced?'Updated '+synced.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):''}</span><button className="text-button" onClick={download} disabled={loading}>Export backup</button></div></div>
      {view==='activity'?<div className="activity-list">{changes.length?changes.map(c=><article key={c.id}><span className="activity-dot"/><div><button className="activity-title" onClick={()=>{const p=projects.find(p=>p.id===c.projectId);if(p)open(p);}}>{c.title}</button><p>{c.summary}</p><small>{c.source} · {new Date(c.timestamp).toLocaleString()}</small></div></article>):<div className="activity-empty"><History size={28}/><h2>Your story starts here</h2><p>Project changes will appear here as you work.</p></div>}</div>:
      <div className={'board '+(view==='parked'?'single-lane':'')} aria-label="Project stages">{visibleStages.map((stage,index)=>{
        const items=projects.filter(p=>p.stage===stage);
        return <section className="lane" key={stage} aria-label={stage} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const p=projects.find(p=>p.id===e.dataTransfer.getData('text/plain'));if(p)void move(p,stage);}}>
          <div className="lane-heading"><span className={'stage-dot stage-'+index}/><h2>{stage}</h2><span className="count">{items.length}</span><button className="icon-button" aria-label={'Add project to '+stage} onClick={()=>open(null,stage)}><Plus size={16}/></button></div>
          <p className="lane-description">{descriptors[stage]}</p>
          <div className="cards">{items.map(p=><article className="project-card" key={p.id} draggable={!busy} onDragStart={e=>e.dataTransfer.setData('text/plain',p.id)}>
            <button className="card-title" onClick={()=>open(p)}>{p.title}<ArrowUpRight size={16}/></button>
            {(p.idea||p.question)&&<p className="card-summary">{p.idea||p.question}</p>}
            {p.deliverable&&<span className="deliverable">{p.deliverable}</span>}
            <div className="next-step"><small>NEXT ACTION</small><p>{p.nextAction||'Choose one small next step.'}</p></div>
            <label className="move-label">Stage<select aria-label={'Move '+p.title+' to stage'} value={p.stage} disabled={busy} onChange={e=>void move(p,e.target.value as Stage)}>{stages.map(s=><option key={s}>{s}</option>)}</select></label>
          </article>)}{!items.length&&<button className="empty-lane" onClick={()=>open(null,stage)}><Plus size={18}/><span>{stage==='Inbox'?'Capture your first idea':'Add a project'}</span></button>}</div>
        </section>;
      })}</div>}
      <div className="board-footer"><span>Keep the next step small.</span><span role="status">{notice}</span></div>
    </main>
    <dialog ref={dialog} className="project-dialog" onCancel={e=>{if(busy)e.preventDefault();else setEditor(null);}} onClose={()=>{if(!busy)setEditor(null);}}>
      {editor&&<form onSubmit={save}>
        <div className="dialog-header"><div><p className="eyebrow">{editor.original?'SHAPE YOUR PROJECT':'CAPTURE A THOUGHT'}</p><h2>{editor.original?'Project details':'New idea'}</h2></div><button type="button" className="icon-button" aria-label="Close project" disabled={busy} onClick={()=>setEditor(null)}><X size={22}/></button></div>
        <div className="editor-fields"><label className="title-field">Project title<input autoFocus required maxLength={160} value={editor.data.title} placeholder="Give your idea a name" onChange={e=>setEditor({...editor,data:{...editor.data,title:e.target.value}})}/></label>
          <label>Stage<select value={editor.data.stage} onChange={e=>setEditor({...editor,data:{...editor.data,stage:e.target.value as Stage}})}>{stages.map(s=><option key={s}>{s}</option>)}</select></label>
          {Object.entries(fieldLabels).map(([key,label])=><label key={key} className={key==='learning'||key==='idea'||key==='nextAction'?'full-width':''}>{label}<textarea rows={key==='learning'?4:2} maxLength={key==='learning'?12000:2000} value={editor.data[key as keyof ProjectData]} placeholder={placeholders[key]} onChange={e=>setEditor({...editor,data:{...editor.data,[key]:e.target.value}})}/></label>)}
        </div>
        {editorError&&<p className="editor-error" role="alert">{editorError}</p>}
        <div className="dialog-footer"><span>Only a title is required.</span><button type="button" className="secondary" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button><button type="submit" className="primary" disabled={busy}><Check size={16}/>{busy?'Saving…':'Save project'}</button></div>
      </form>}
    </dialog>
  </div>;
}
