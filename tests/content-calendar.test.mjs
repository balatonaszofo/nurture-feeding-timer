import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyChange,validate} from '../content-calendar/src/model.mjs';
const context={id:'one',changeId:'event-1',timestamp:'2026-10-07T18:00:00Z'};
test('create, partial updates, and history preserve the project framework',()=>{
  const created=applyChange({}, {kind:'create',data:{title:' Experiment ',idea:'Original idea',learning:'Observed result'}},context);
  assert.equal(created.project.title,'Experiment');
  const moved=applyChange(created.state,{kind:'update',id:'one',expectedVersion:1,patch:{stage:'Exploring'}},{...context,changeId:'event-2',source:'Conversation'});
  assert.equal(moved.project.version,2);assert.equal(moved.project.idea,'Original idea');assert.equal(moved.project.learning,'Observed result');assert.equal(moved.state.changes[0].source,'Conversation');
  assert.throws(()=>applyChange(moved.state,{kind:'update',id:'one',expectedVersion:1,patch:{idea:'stale'}},context),/another device/);
  assert.equal(moved.project.idea,'Original idea');
});
test('invalid inputs and missing projects cannot mutate a board',()=>{
  assert.throws(()=>validate({title:' '}),/title/);assert.throws(()=>validate({title:'Idea',stage:'Unknown'}),/stage/);
  assert.throws(()=>validate({title:'Idea',owner:'someone'}),/field/);
  assert.throws(()=>applyChange({},{kind:'update',id:'missing',expectedVersion:1,patch:{title:'New'}},context),/not found/);
});
test('starter storage bounds are enforced before a write',()=>{
  assert.throws(()=>applyChange({projects:Array.from({length:100},()=>({id:'other'}))},{kind:'create',data:{title:'New'}},context),/100 projects/);
});
