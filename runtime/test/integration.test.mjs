import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Harness } from '../harness.mjs';
const setup=async()=>new Harness(await mkdtemp(join(tmpdir(),'fantastic4-'))).initialize();
test('four original-engine workers produce distinct verifiable artifacts',async()=>{
 const h=await setup();
 const state=await h.snapshot();assert.equal(state.automatons.length,13);assert.equal(state.profile.personalized,false);
 const specs=[
 {capability:'tool.create',parameters:{request:{purpose:'orchestrate a workflow system',dimension:'Space'},input:'sense build test mount'}},
 {capability:'neural.compose',parameters:{configuration:{seed:7,nodeCount:4},input:[1,2,3,4]}},
 {capability:'modelmaker.inspect',parameters:{}},
 {capability:'ato.connect',parameters:{requests:[{purpose:'analyze and learn',dimension:'Evolution',level:4},{purpose:'create grammar rule',dimension:'Design',level:5}],input:'signal'}}
 ];
 const queued=await Promise.all(specs.map(s=>h.submit(s)));
 const jobs=await Promise.all(queued.map(j=>h.wait(j.id)));
 assert.deepEqual(jobs.map(j=>j.status),['verified','verified','inspected','verified']);
 assert.equal(jobs[0].result.output.output,'sense build test mount');
 assert.equal(jobs[3].result.output.visited.length,2);
 assert.equal(jobs[2].result.output.training,'not run');
 for(const job of jobs){assert.equal(await h.verify(job.result),true);assert.ok((await readFile(join(h.directory,'artifacts',job.result.artifact.path))).length);}
 const restored=await new Harness(h.directory).initialize();assert.equal((await restored.snapshot()).jobs.length,4);
});
test('unresolved routing and invalid neural input do not become success',async()=>{
 const h=await setup();
 for(const spec of [{capability:'tool.create',parameters:{request:{purpose:'xyz'}}},{capability:'neural.compose',parameters:{input:['invalid']}}]){
 const j=await h.submit(spec);const done=await h.wait(j.id);assert.equal(done.status,'failed');assert.ok(done.error);
 }
});
test('restart records interrupted jobs and tampering fails artifact verification',async()=>{
 const h=await setup();const queued=await h.submit({capability:'modelmaker.inspect',parameters:{}});const job=await h.wait(queued.id);
 await writeFile(join(h.directory,'artifacts',job.result.artifact.path),'changed');assert.equal(await h.verify(job.result),false);
 await writeFile(join(h.directory,'jobs','interrupted.json'),JSON.stringify({id:'interrupted',created:'2026-01-01',status:'running'}));
 const restarted=await new Harness(h.directory).initialize();assert.equal((await restarted.snapshot()).jobs.find(j=>j.id==='interrupted').status,'interrupted');
});
