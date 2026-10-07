export const stages = ['Inbox','Exploring','Building / Researching','Drafting','Ready','Published','Parked'] as const;
export type Stage = typeof stages[number];
export type ProjectData = {title:string;idea:string;audience:string;question:string;angle:string;deliverable:string;nextAction:string;learning:string;stage:Stage};
export type Project = ProjectData & {id:string;version:number;createdAt:string;updatedAt:string};
export type Change = {id:string;projectId:string;title:string;summary:string;source:string;timestamp:string};
export const blankProject:ProjectData = {title:'',idea:'',audience:'',question:'',angle:'',deliverable:'',nextAction:'',learning:'',stage:'Inbox'};
