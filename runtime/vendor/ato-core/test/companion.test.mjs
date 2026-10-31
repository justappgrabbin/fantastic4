import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomataMesh, CompanionAutomata, MorphingWorkspace, conversationAutomaton } from '../src/index.mjs';

function build(policy={}){const mesh=new AutomataMesh();mesh.add(conversationAutomaton());const workspace=new MorphingWorkspace({views:[{id:'chat',type:'conversation',automatonId:'conversation',state:{}}]});return new CompanionAutomata({mesh,workspace,address:'G12',policy});}

test('companion can talk, introspect and rest without inventing a task',async()=>{const c=build();const reply=await c.talk('hey',{contributions:['present']});assert.match(reply,/present/);assert.equal(c.introspect().mesh.automatons.length,1);c.rest();assert.equal(c.mode,'rest');assert.equal(c.pending.length,0);});

test('task and interface morph proposals respect explicit policy',async()=>{const c=build();const proposal=c.propose({kind:'morph',operations:[{type:'open',view:{id:'editor',type:'editor',state:{}}}],context:{rationale:'needed'}});assert.equal((await c.act(proposal.id)).status,'awaiting-authorization');assert.equal((await c.act(proposal.id,{authorize:true})).status,'complete');assert.ok(c.workspace.current.views.some(v=>v.id==='editor'));c.workspace.undo();assert.ok(!c.workspace.current.views.some(v=>v.id==='editor'));});

test('autonomous morphing is opt-in and replayable',async()=>{const c=build({autonomousMorphs:true});const proposal=c.propose({kind:'morph',operations:[{type:'state',id:'chat',patch:{mode:'quiet'}}],context:{rationale:'quiet mode'}});await c.act(proposal.id);assert.equal(c.workspace.current.views[0].state.mode,'quiet');assert.ok(c.replay().some(e=>e.type==='action'));});
