import test from 'node:test';
import assert from 'node:assert/strict';
import { Anomata, ToolOrganism } from '../src/index.mjs';

const address=(gate)=>({mode:'macro',gate,line:1,color:1,tone:1,base:1});

test('Anomata grows a new executable organ from a valid addressed connection',async()=>{
  const engine=new Anomata();
  const organism=new ToolOrganism({engine,address:address(1)});
  organism.ingest({id:'sensor',address:address(2),capabilities:[{id:'read',address:address(2),input:'text',output:'text',implementation:(v)=>String(v).trim()}]});
  organism.ingest({id:'voice',address:address(3),capabilities:[{id:'speak',address:address(3),input:'text',output:'text',implementation:(v)=>`voice:${v}`}]});
  const candidate=organism.connect({fromTool:'sensor',fromPort:'read',toTool:'voice',toPort:'speak',address:address(4)});
  assert.equal(candidate.status,'candidate');
  const organ=organism.accept(candidate.id,(v)=>`voice:${String(v).trim()}`);
  const output=await engine.run(organ.id,'organ-1',' hello ');
  assert.equal(output.result,'voice:hello');
  assert.equal(organism.snapshot().generation,1);
  assert.ok(engine.replay().some((event)=>event.type==='growth-accepted'));
});

test('incompatible connections remain unresolved and do not grow',()=>{
  const engine=new Anomata(); const organism=new ToolOrganism({engine,address:address(1)});
  organism.ingest({id:'a',address:address(2),capabilities:[{id:'out',address:address(2),input:'text',output:'image'}]});
  organism.ingest({id:'b',address:address(3),capabilities:[{id:'in',address:address(3),input:'audio',output:'text'}]});
  const result=organism.connect({fromTool:'a',fromPort:'out',toTool:'b',toPort:'in'});
  assert.equal(result.status,'unresolved');
  assert.equal(organism.snapshot().candidates.length,0);
});
