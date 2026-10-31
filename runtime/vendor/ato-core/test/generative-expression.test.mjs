import test from 'node:test';
import assert from 'node:assert/strict';
import { Automaton, AutomataMesh, ExpressionField, GenerativeEmergence, StateSpaceAssociationResolver } from '../src/index.mjs';

const address=(gate,extra={})=>({mode:'macro',gate,line:1,color:1,tone:1,base:1,...extra});
const tool=({id,gate,run,generation=0})=>new Automaton({id,address:address(gate),structure:'bigram',activeLevels:[1],functionalLevel:'mind',ports:[{id:'in',direction:'input',type:'number',schemaVersion:'1',requires:[],guarantees:[]},{id:'out',direction:'output',type:'number',schemaVersion:'1',requires:[],guarantees:['numeric']}],implementation:run,metadata:{family:'test',generation}});

test('state-space association comes from exact addresses and ATO operators',()=>{
  const resolver=new StateSpaceAssociationResolver();
  const a=tool({id:'double',gate:1,run:n=>n*2}),b=tool({id:'increment',gate:2,run:n=>n+1});
  const relation=resolver.resolve(a,b);
  assert.equal(relation.gateRelation.left,'000000');
  assert.equal(relation.gateRelation.right,'000001');
  assert.equal(relation.gateRelation.operator,'111110');
  assert.equal(relation.emergenceSpot.address.gate,63);
  assert.deepEqual(relation.shared,{line:1,color:1,tone:1,base:1});
  assert.ok(relation.relations.some(item=>item.id==='corresponding-row'||item.id==='same-house'||item.id==='equivalence-operator'));
});

test('resonant tools synthesize a new standalone executable tool and express creation',async()=>{
  const field=new ExpressionField({address:address(63)}),generator=new GenerativeEmergence();
  const a=tool({id:'double',gate:1,run:n=>n*2}),b=tool({id:'increment',gate:2,run:n=>n+1});
  const candidate=generator.consider(a,b);
  assert.equal(candidate.status,'candidate');
  const generated=generator.synthesize(candidate.id,{expressionField:field});
  assert.equal(await generated.call(3),7);
  assert.equal(generated.metadata.decomposable,true);
  assert.deepEqual(generator.decompose(generated.id).members,['double','increment']);
  assert.equal(field.snapshot().events.at(-1).current.mode,'creation');
});

test('generated tools recursively compose and still run alone',async()=>{
  const generator=new GenerativeEmergence();
  const a=tool({id:'double',gate:1,run:n=>n*2}),b=tool({id:'increment',gate:2,run:n=>n+1}),c=tool({id:'square',gate:4,run:n=>n*n});
  const first=generator.synthesize(generator.consider(a,b).id);
  const secondCandidate=generator.consider(first,c);
  assert.equal(secondCandidate.generation,2);
  const second=generator.synthesize(secondCandidate.id);
  assert.equal(await second.call(2),25);
  const mesh=new AutomataMesh();mesh.add(second);
  assert.equal((await mesh.run(second.id,3)).outputs[second.id],49);
});

test('identical addressed members produce deterministic candidates without randomness',()=>{
  const a=tool({id:'a',gate:8,run:n=>n}),b=tool({id:'b',gate:9,run:n=>n});
  const x=new GenerativeEmergence().consider(a,b),y=new GenerativeEmergence().consider(a,b);
  assert.equal(x.id,y.id);assert.deepEqual(x.association,y.association);
});

test('incomplete addressed association does not guess an emergence location',()=>{
  const a=tool({id:'a',gate:8,run:n=>n}),b=new Automaton({id:'b',address:{mode:'macro',gate:9,line:2,color:2,tone:2,base:2},structure:'bigram',activeLevels:[1],functionalLevel:'mind',ports:[{id:'in',direction:'input',type:'number'},{id:'out',direction:'output',type:'number'}],implementation:n=>n});
  const result=new GenerativeEmergence().consider(a,b);
  assert.equal(result.reason,'EMERGENCE_ADDRESS_INCOMPLETE');
});

test('generated tools dissolve and restore reversibly',async()=>{
  const generator=new GenerativeEmergence(),a=tool({id:'a',gate:1,run:n=>n+1}),b=tool({id:'b',gate:2,run:n=>n*2});
  const generated=generator.synthesize(generator.consider(a,b).id);assert.equal(generator.dissolve(generated.id,'context-ended'),true);assert.equal(generator.generated.get(generated.id).active,false);const restored=generator.restore(generated.id);assert.equal(await restored.call(2),6);
});
