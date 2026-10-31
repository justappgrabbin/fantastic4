import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomataMesh, computationAutomaton, semanticAutomaton, codeAutomaton, visualAutomaton, timelineAutomaton, gameAutomaton, ichingAutomaton, conversationAutomaton, createPrimaryAutomata } from '../src/index.mjs';

test('primary families are real standalone Automatons across five functional levels',()=>{
  const tools=createPrimaryAutomata();
  assert.equal(tools.length,8);
  assert.deepEqual(new Set(tools.map(t=>t.functionalLevel)),new Set(['movement','mind','design','space','being']));
  assert.ok(tools.every(t=>typeof t.implementation==='function'));
});

test('computation, code and visual Automatons execute',async()=>{
  assert.equal(await computationAutomaton().call([2,3,5],{operation:'sum'}),10);
  assert.match(await codeAutomaton().call({name:'double',params:['input'],body:'return input * 2;'}),/function double/);
  assert.match(await visualAutomaton().call({shapes:[{type:'circle',x:20,y:20,r:10}]}),/<circle/);
});

test('semantic Automaton learns and completes an analogy',async()=>{
  const sem=semanticAutomaton({features:['a','b','c']});
  await sem.call({learn:true,id:'x',vector:'101'});await sem.call({learn:true,id:'y',vector:'011'});await sem.call({learn:true,id:'z',vector:'001'});
  const result=await sem.call({analogy:{a:'x',b:'y',c:'z'}});
  assert.equal(result.vector,'111');
});

test('timeline, game, state-space and conversation Automatons execute',async()=>{
  assert.deepEqual((await timelineAutomaton().call([{duration:10,action:'move'},{duration:20,action:'hold'}])).map(x=>x.end),[10,30]);
  const game=gameAutomaton();assert.equal((await game.call({spawn:{id:'p',x:0,y:0}})).entities.length,1);assert.equal((await game.call({move:{id:'p',x:4,y:5}})).entities[0].x,4);
  assert.equal((await ichingAutomaton().call({bits:'001000'})).houseId,'arousing');
  assert.match(await conversationAutomaton().call('Question',{contributions:['semantic','state']}),/semantic/);
});

test('Automata mesh connects sovereign tools by typed ports and executes the cluster',async()=>{
  const mesh=new AutomataMesh();
  const a=conversationAutomaton({id:'a'}),b=conversationAutomaton({id:'b'});mesh.add(a);mesh.add(b);
  assert.equal(mesh.connect('a','b',{outputPort:'utterance',inputPort:'context'}).status,'connected');
  const result=await mesh.run('a','hello');assert.deepEqual(result.visited,['a','b']);
});
