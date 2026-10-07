import {applyChange} from './model.mjs';
let sdk:any, db:any, user:any, reference:any;
let snapshot:any={projects:[],changes:[]};
let local=false;
const localKey='content-calendar-local-v1';
const base='https://www.gstatic.com/firebasejs/12.17.1';
export async function connect(onUser:(user:any)=>void,onError:(error:Error)=>void){
  const [app,auth,firestore]=await Promise.all([import(/* @vite-ignore */ base+'/firebase-app.js'),import(/* @vite-ignore */ base+'/firebase-auth.js'),import(/* @vite-ignore */ base+'/firebase-firestore.js')]);
  const config=(window as any).NURTURE_FIREBASE_CONFIG;
  const instance=app.getApps().length?app.getApp():app.initializeApp(config);
  sdk=firestore; db=sdk.getFirestore(instance);
  const identity=auth.getAuth(instance);
  await auth.setPersistence(identity,auth.browserLocalPersistence);
  const stop=auth.onAuthStateChanged(identity,(current:any)=>{user=current?.isAnonymous?null:current;reference=user?sdk.doc(db,'users',user.uid,'contentBoard','state'):null;snapshot={projects:[],changes:[]};onUser(user);},onError);
  return {login:()=>auth.signInWithPopup(identity,new auth.GoogleAuthProvider()),logout:()=>auth.signOut(identity),stop};
}
export function useLocal(){local=true;try{snapshot=JSON.parse(localStorage.getItem(localKey)||'{"projects":[],"changes":[]}');}catch{snapshot={projects:[],changes:[]};}}
export async function read(){
  if(local)return snapshot;
  if(!reference)throw Error('Sign in with Google to open your private board.');
  try{const result=await sdk.getDocFromServer(reference);snapshot=result.exists()?result.data():{projects:[],changes:[]};return snapshot;}
  catch(e:any){if(e.code==='permission-denied')throw Error('Cloud sync needs the new Firebase rules to be published. Your projects have not been changed.');throw Error('Unable to reach cloud storage. Reconnect and refresh before saving.');}
}
export async function mutate(input:any,source='Board'){
  const context={id:crypto.randomUUID(),changeId:crypto.randomUUID(),timestamp:new Date().toISOString(),source};
  if(local){const result=applyChange(snapshot,input,context);localStorage.setItem(localKey,JSON.stringify(result.state));snapshot=result.state;window.dispatchEvent(new Event('board-change'));return result.project;}
  if(!reference||!user)throw Error('Sign in to save this project.');
  const captured=reference;
  const project=await sdk.runTransaction(db,async(transaction:any)=>{
    const result=await transaction.get(captured);
    const update=applyChange(result.exists()?result.data():{},input,context);
    transaction.set(captured,{...update.state,updatedAt:sdk.serverTimestamp()});
    return update.project;
  });
  await read();window.dispatchEvent(new Event('board-change'));return project;
}
export async function api(path:string,options?:RequestInit):Promise<any>{
  if(options?.method==='POST')return {project:await mutate({kind:'create',data:JSON.parse(options.body as string)})};
  if(options?.method==='PATCH')return {project:await mutate({kind:'update',id:path.split('/').at(-1),...JSON.parse(options.body as string)})};
  const state=await read();return {projects:state.projects||[],changes:state.changes||[]};
}
export function registerTools(){
  const registry=(document as any).modelContext;
  if(typeof registry?.registerTool!=='function')return ()=>{};
  const lifecycle=new AbortController();
  const register=(name:string,description:string,inputSchema:any,execute:any,readOnly=false)=>{
    try{Promise.resolve(registry.registerTool({name,description,inputSchema,annotations:{readOnlyHint:readOnly,untrustedContentHint:true},execute},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  };
  const empty={type:'object',properties:{},additionalProperties:false};
  register('list_content_projects','Read the signed-in user’s content board projects.',empty,async()=>({projects:(await read()).projects||[]}),true);
  register('list_content_changes','Read the latest 100 content project changes.',empty,async()=>({changes:(await read()).changes||[]}),true);
  const fields={title:{type:'string',maxLength:160},idea:{type:'string'},audience:{type:'string'},question:{type:'string'},angle:{type:'string'},deliverable:{type:'string'},nextAction:{type:'string'},learning:{type:'string'},stage:{type:'string',enum:['Inbox','Exploring','Building / Researching','Drafting','Ready','Published','Parked']}};
  register('create_content_project','Save a new content project. Only title is required.',{type:'object',properties:fields,required:['title'],additionalProperties:false},async(input:any)=>({project:await mutate({kind:'create',data:input},'Conversation')}));
  register('update_content_project','Update selected fields on a content project. Read its current version first.',{type:'object',properties:{id:{type:'string'},expectedVersion:{type:'integer'},patch:{type:'object',properties:fields,additionalProperties:false}},required:['id','expectedVersion','patch'],additionalProperties:false},async(input:any)=>({project:await mutate({kind:'update',...input},'Conversation')}));
  return ()=>lifecycle.abort();
}
