import test from 'node:test';
import assert from 'node:assert/strict';
import { Automaton, AutomataMesh } from '../../ato-core-native-test/src/index.mjs';
import { ATONativeBridge, IntegratedToolFactory } from '../src/integrated-tool-factory.mjs';

test('factory product materializes as a genuine ATO Automaton and mounts normally', async () => {
  const factory=new IntegratedToolFactory(),mesh=new AutomataMesh();
  const bridge=new ATONativeBridge({Automaton,mesh,factory});
  const result=bridge.generateAndMount({purpose:'orchestrate a workflow system',dimension:'Space',input:'sense build test mount'});
  assert.equal(result.status,'mounted');
  assert.equal(result.automaton instanceof Automaton,true);
  assert.equal(mesh.automatons.get(result.automaton.id),result.automaton);
  assert.equal(result.automaton.metadata.family,'ato-native-generated-tool');
  const run=await bridge.run(result.automaton.id,'sense build test mount');
  assert.deepEqual(run.visited,[result.automaton.id]);
  assert.equal(run.outputs[result.automaton.id].output,'sense build test mount');
});

test('native generated tools connect and execute through the real ATO mesh',async()=>{
  const factory=new IntegratedToolFactory(),mesh=new AutomataMesh(),bridge=new ATONativeBridge({Automaton,mesh,factory});
  const first=bridge.generateAndMount({purpose:'analyze and learn',dimension:'Evolution',level:4}).automaton;
  const second=bridge.generateAndMount({purpose:'create grammar rule',dimension:'Design',level:5}).automaton;
  assert.equal(bridge.connect(first.id,second.id).status,'connected');
  const run=await bridge.run(first.id,'recurring signal');
  assert.deepEqual(run.visited,[first.id,second.id]);
  assert.equal(run.outputs[second.id].rule.lhs,'Design');
});

test('native dissolution removes connected edges and restoration remounts',()=>{
  const factory=new IntegratedToolFactory(),mesh=new AutomataMesh(),bridge=new ATONativeBridge({Automaton,mesh,factory});
  const a=bridge.generateAndMount({purpose:'analyze input',dimension:'Evolution',level:4}).automaton;
  const b=bridge.generateAndMount({purpose:'grammar rule',dimension:'Design',level:5}).automaton;
  bridge.connect(a.id,b.id); assert.equal(mesh.edges.size,1);
  assert.equal(bridge.dissolve(a.id,'context-ended'),true); assert.equal(mesh.automatons.has(a.id),false); assert.equal(mesh.edges.size,0);
  assert.equal(bridge.restore(a.id) instanceof Automaton,true); assert.equal(mesh.automatons.has(a.id),true);
});
