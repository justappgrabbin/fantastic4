import test from 'node:test';
import assert from 'node:assert/strict';
import { MorphingWorkspace } from '../src/index.mjs';

const conversation={id:'conversation',type:'conversation',automatonId:'conversation',region:'main',order:0,state:{thread:[]}};
const editor={id:'editor',type:'editor',automatonId:'code',region:'main',order:0,state:{file:'tool.js'}};

test('interface morphs are reversible addressed transitions',()=>{
  const ws=new MorphingWorkspace({id:'personal',address:'G1',views:[conversation],focus:'conversation'});
  const before=ws.current;
  const transition=ws.morph([{type:'replace',id:'conversation',view:editor},{type:'focus',id:'editor'}],{rationale:'code tool required',automatons:['conversation','code']});
  assert.equal(transition.source,before.snapshotId);assert.equal(ws.current.focus,'editor');
  assert.equal(ws.undo().snapshotId,before.snapshotId);assert.equal(ws.current.focus,'conversation');
  assert.equal(ws.redo().focus,'editor');
});

test('pins, branches, restore and comparison preserve prior workspaces',()=>{
  const ws=new MorphingWorkspace({views:[conversation]});ws.pin('home');
  ws.morph([{type:'open',view:editor},{type:'focus',id:'editor'}]);ws.branch('code-work');
  assert.deepEqual(ws.compare('home','code-work').opened,['editor']);
  ws.restore('home');assert.deepEqual(ws.current.views.map(v=>v.id),['conversation']);
  assert.equal(ws.replay().at(-1).operator,'workspace.restore');
});

test('morph transitions retain rationale, participating Automatons and inverse data',()=>{
  const ws=new MorphingWorkspace({views:[conversation]});
  const event=ws.morph([{type:'state',id:'conversation',patch:{mode:'comparison'}}],{rationale:'comparison requested',automatons:['conversation','semantic']});
  assert.equal(event.rationale,'comparison requested');assert.deepEqual(event.automatons,['conversation','semantic']);assert.ok(event.inverse.length);
});
