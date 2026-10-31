import test from 'node:test';
import assert from 'node:assert/strict';
import { DimensionRouter, IntegratedToolFactory, TOOL_LEVELS } from '../src/integrated-tool-factory.mjs';

test('five dimensions route independently and ties remain explicit',()=>{const r=new DimensionRouter();assert.equal(r.route('energy creation').dimension,'Movement');assert.equal(r.route('gravity memory').dimension,'Evolution');assert.equal(r.route('matter survival').dimension,'Being');assert.equal(r.route('structure art').dimension,'Design');assert.equal(r.route('form music').dimension,'Space');assert.equal(r.route('utterly unknown').status,'unresolved');});

test('all eight production levels are reachable and executable',async()=>{const f=new IntegratedToolFactory();for(const level of TOOL_LEVELS.map(x=>x.level)){const result=f.generate({purpose:'build tool',dimension:'Design',level,gate:14,input:'alpha beta alpha'});assert.equal(result.status,'generated');assert.equal(result.tool.plan.level,level);assert.doesNotReject(()=>result.tool.execute(level===1?.7:level===2?[{color:3},{tone:2}]:level===3?['alpha beta','beta gamma']:'alpha beta alpha'));}});

test('purpose planning reaches formerly unreachable bigram trigram and circuit levels',()=>{const f=new IntegratedToolFactory();assert.equal(f.generate({purpose:'compare and match a pair',dimension:'Movement'}).tool.plan.level,3);assert.equal(f.generate({purpose:'analyze and learn',dimension:'Evolution'}).tool.plan.level,4);assert.equal(f.generate({purpose:'orchestrate a workflow system',dimension:'Space'}).tool.plan.level,7);});

test('identity and circuit output are deterministic',async()=>{const a=new IntegratedToolFactory(),b=new IntegratedToolFactory();const req={purpose:'orchestrate workflow system',dimension:'Space',input:'one two three two four'};const x=a.generate(req).tool,y=b.generate(req).tool;assert.equal(x.id,y.id);assert.deepEqual(await x.execute(req.input),await y.execute(req.input));});

test('duplicates reuse the existing tool and lifecycle is reversible',()=>{const f=new IntegratedToolFactory(),req={purpose:'create grammar rule',dimension:'Design',level:5};const first=f.generate(req);assert.equal(f.generate(req).status,'existing');assert.equal(f.dissolve(first.tool.id,'test'),true);assert.equal(first.tool.lifecycle,'dissolved');assert.equal(f.restore(first.tool.id).lifecycle,'ready');});

test('generated tools expose ATO-compatible manifests and mount into a mesh surface',()=>{const f=new IntegratedToolFactory(),tool=f.generate({purpose:'connect event channel',dimension:'Space',level:6}).tool;const mesh={automatons:new Map(),add(x){this.automatons.set(x.id,x);}};const manifest=f.mount(tool,mesh);assert.equal(mesh.automatons.get(tool.id),tool);assert.equal(manifest.manifestVersion,'ato.generated-tool.v2');assert.equal(manifest.metadata.deterministic,true);assert.equal(f.snapshot().tools.length,1);});
