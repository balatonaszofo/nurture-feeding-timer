export const stages = ['Inbox','Exploring','Building / Researching','Drafting','Ready','Published','Parked'];
export const blank = {title:'',idea:'',audience:'',question:'',angle:'',deliverable:'',nextAction:'',learning:'',stage:'Inbox'};
export function validate(patch, partial=false) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Error('Project details must be an object.');
  const result = partial ? {} : {...blank};
  for (const [key,value] of Object.entries(patch)) {
    if (!Object.hasOwn(blank,key) || typeof value !== 'string') throw Error('Invalid project field: '+key);
    if (key==='stage' && !stages.includes(value)) throw Error('Choose a valid stage.');
    if (value.length > (key==='learning'?12000:key==='title'?160:2000)) throw Error(key+' is too long.');
    result[key] = key==='title'?value.trim():value;
  }
  if ((!partial || 'title' in result) && !result.title) throw Error('Give your project a title.');
  return result;
}
export function applyChange(state, input, context) {
  const projects = [...(state.projects || [])], changes = [...(state.changes || [])];
  const {id, timestamp, source='Board'} = context;
  let project, summary;
  if (input.kind==='create') {
    if (projects.length>=100) throw Error('This starter board holds 100 projects. Export a backup before expanding it.');
    project = {...validate(input.data),id,version:1,createdAt:timestamp,updatedAt:timestamp};
    projects.unshift(project); summary='Created in '+project.stage;
  } else {
    const index = projects.findIndex(p=>p.id===input.id);
    if(index<0) throw Error('Project not found.');
    const current=projects[index];
    if(!Number.isInteger(input.expectedVersion) || current.version!==input.expectedVersion) throw Error('This project changed on another device. Refresh and reopen it before saving.');
    const patch=validate(input.patch,true);
    if(!Object.keys(patch).length) throw Error('Provide at least one field to update.');
    project={...current,...patch,version:current.version+1,updatedAt:timestamp};
    projects[index]=project;
    summary=patch.stage && patch.stage!==current.stage ? 'Moved from '+current.stage+' to '+patch.stage : 'Updated '+Object.keys(patch).join(', ');
  }
  changes.unshift({id:context.changeId,projectId:project.id,title:project.title,summary,source,timestamp});
  const next={projects,changes:changes.slice(0,100),schemaVersion:1};
  if(new TextEncoder().encode(JSON.stringify(next)).length>800000) throw Error('Your board is nearly full. Export a backup before expanding its storage.');
  return {state:next,project};
}
