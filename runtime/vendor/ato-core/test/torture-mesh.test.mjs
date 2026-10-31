import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomataMesh, Automaton } from '../src/index.mjs';

const address=(gate)=>({mode:'macro',gate,line:1,color:1,tone:1,base:1});
const names=['conversation-in','semantic','iching','computation','code','visual','timeline','game','conversation-out'];
const levels=['space','mind','movement','mind','design','design','movement','being','space'];

function automaton(id,index){
  const outputType=index===names.length-1?'text':`stage-${index+1}`;
  const inputType=index===0?'text':`stage-${index}`;
  return new Automaton({
    id,address:address(index+1),structure:index%3===0?'bigram':index%3===1?'trigram':'hexagram',
    activeLevels:index%3===0?[1]:index%3===1?[1,2]:[1,2,3,4,5],functionalLevel:levels[index],
    ports:[
      {id:'in',direction:'input',type:inputType,schemaVersion:'1',requires:['addressed'],guarantees:[]},
      {id:'out',direction:'output',type:outputType,schemaVersion:'1',requires:[],guarantees:['addressed']},
    ],
    metadata:{family:names[index]},
    implementation:(input,{address})=>Object.freeze({stage:id,address:`G${address.gate}`,previous:input}),
  });
}

function build(){
  const mesh=new AutomataMesh();names.forEach((name,index)=>mesh.add(automaton(name,index)));
  for(let index=0;index<names.length-1;index++){
    const connected=mesh.connect(names[index],names[index+1],{outputPort:'out',inputPort:'in'});
    assert.equal(connected.status,'connected');
  }
  return mesh;
}

function canonical(value){return JSON.stringify(value,(key,item)=>key==='calls'||key==='lifecycle'?undefined:item);}

test('full Automata substrate replays identically from identical fresh snapshots',async()=>{
  const first=build(),second=build();
  const initial=Object.freeze({text:'build the addressed thing',address:'G1'});
  const [a,b]=await Promise.all([first.run('conversation-in',initial),second.run('conversation-in',initial)]);
  assert.deepEqual(a.visited,names);assert.deepEqual(b.visited,names);
  assert.equal(canonical(first.snapshot()),canonical(second.snapshot()));
  assert.equal(canonical(a.outputs),canonical(b.outputs));
  assert.equal(canonical(a.log),canonical(b.log));
  assert.equal(a.log.length,9);
  assert.ok(a.log.every((event,index)=>event.address.includes(`gate=${index+1}`)));
});

test('wrapper intervention is absent from execution history',async()=>{
  const mesh=build();const result=await mesh.run('conversation-in',{text:'x',address:'G1'});
  assert.ok(result.log.every(event=>!('wrapper' in event)));
  assert.ok(mesh.snapshot().automatons.every(item=>item.metadata.family));
});

test('cycle, schema and invariant failures stop at connection time',()=>{
  const mesh=build();
  assert.equal(mesh.connect('conversation-out','conversation-in',{outputPort:'out',inputPort:'in'}).reason,'CYCLE_REQUIRES_PERMISSION');
  const bad=new Automaton({id:'bad',address:address(60),structure:'bigram',activeLevels:[1],functionalLevel:'mind',ports:[{id:'in',direction:'input',type:'text',schemaVersion:'2',requires:['signed']}],implementation:v=>v});
  mesh.add(bad);
  const mismatch=mesh.connect('conversation-out','bad',{outputPort:'out',inputPort:'in'});
  assert.equal(mismatch.reason,'INCOMPATIBLE_CONTRACT');
  assert.deepEqual(mismatch.issues,['SCHEMA_VERSION_MISMATCH','INVARIANT_MISMATCH']);
});
