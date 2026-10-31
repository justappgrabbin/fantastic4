import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Automaton, AutomataMesh, bootstrapATO } from './vendor/ato-core/src/index.mjs';
import { IntegratedToolFactory, ATONativeBridge } from './vendor/tool-factory/src/integrated-tool-factory.mjs';
import { MCPHub } from './vendor/adaya/MCPHub.js';
import { NeuralArchitectureRuntime } from './vendor/neural/architectureModulation.mjs';

export const CORNERS = Object.freeze([
 {id:'tool-factory',name:'Tool Factory',capability:'tool.create',directive:'Use the original Tool Factory to create executable tools. Preserve source and lineage; verify the exported artifact before completion.'},
 {id:'neural-net-maker',name:'Neural Net Maker',capability:'neural.compose',directive:'Use the preserved neural-architecture generator. Evaluate compositions and state their limits. Personal qualities require supplied configuration.'},
 {id:'model-maker',name:'Model Maker',capability:'modelmaker.inspect',directive:'Use the preserved Stellarproximology trainer. Record requirements and actual training evidence. Never call a source inspection a trained model.'},
 {id:'ato-engine',name:'ATO Engine',capability:'ato.connect',directive:'Connect genuine Tool-Automatons with typed ports. Execute the resulting mesh and retain evidence of each participating tool.'}
]);
const digest = value => createHash('sha256').update(value).digest('hex');
async function atomic(path, value) {const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2));await rename(temp,path);}
export class Harness {
 constructor(directory){this.directory=resolve(directory);this.hub=new MCPHub({maxParallel:4});this.hub.verify=async(_task,result)=>({ok:await this.verify(result),quality:1});this.neural=new NeuralArchitectureRuntime();this.atoSystem=bootstrapATO();this.pending=new Map();this.tails=new Map();
  for(const corner of CORNERS)this.hub.registerProvider({id:corner.id,capabilities:[corner.capability],execute:task=>this.runCorner(corner,task)});
 }
 async initialize(){for(const name of ['jobs','artifacts','originals'])await mkdir(join(this.directory,name),{recursive:true});
  // A process interrupted during a job leaves evidence, never an invented completion.
  for(const name of await readdir(join(this.directory,'jobs'))){if(!name.endsWith('.json'))continue;const p=join(this.directory,'jobs',name);const job=JSON.parse(await readFile(p,'utf8'));if(['running','queued'].includes(job.status)){job.status='interrupted';job.error='Runtime restarted before verified completion; submit again to retry.';await atomic(p,job);}}
  return this;
 }
 async snapshot(){const jobs=[];for(const name of await readdir(join(this.directory,'jobs')))if(name.endsWith('.json'))jobs.push(JSON.parse(await readFile(join(this.directory,'jobs',name),'utf8')));
  return {ok:true,runtime:'fantastic4-linux',corners:CORNERS,automatons:this.atoSystem.manifests,profile:this.atoSystem.profile, jobs:jobs.sort((a,b)=>b.created.localeCompare(a.created)), reasoning:'No autonomous language-model planner connected',personalization:{humanDesign:'awaiting supplied configuration adapter',spaceTime:'original tool routing only; person-specific configuration not connected'},population:'Four worker providers and 13 bootstrapped original ATO Automatons; original files retained'};
 }
 async submit(spec){if(!spec||!CORNERS.some(c=>c.capability===spec.capability))throw new Error('Unknown capability');
  if(!spec.parameters||typeof spec.parameters!=='object'||Array.isArray(spec.parameters))throw new Error('parameters must be an object');
  if(Buffer.byteLength(JSON.stringify(spec.parameters))>65536)throw new Error('Job inputs exceed 64 KB');
  const id=randomUUID(),corner=CORNERS.find(c=>c.capability===spec.capability);
  const job={id,agent:corner.id,capability:spec.capability,parameters:spec.parameters,created:new Date().toISOString(),status:'queued'};
  await atomic(join(this.directory,'jobs',id+'.json'),job);
  // Each corner has its own serial queue; separate corners can work concurrently.
  const previous=this.tails.get(corner.id)||Promise.resolve();
  const work=previous.catch(()=>{}).then(()=>this.execute(job));this.tails.set(corner.id,work);this.pending.set(id,work);work.finally(()=>this.pending.delete(id)).catch(()=>{});
  return job;
 }
 async wait(id){await this.pending.get(id);return JSON.parse(await readFile(join(this.directory,'jobs',id+'.json'),'utf8'));}
 async execute(job){const path=join(this.directory,'jobs',job.id+'.json');job.status='running';await atomic(path,job);
  try{const outcome=await this.hub.runTask({...job});
   if(!outcome.verification.ok)throw new Error(outcome.result?.error||'Output verification failed');
   job.status=outcome.result.kind==='inspection'?'inspected':'verified';job.result=outcome.result;job.verification=outcome.verification;
  }catch(error){job.status='failed';job.error=String(error.message||error);}
  job.finished=new Date().toISOString();await atomic(path,job);return job;
 }
 async artifact(job, filename, source){const directory=join(this.directory,'artifacts',job.id);await mkdir(directory,{recursive:true});const path=join(directory,filename);await writeFile(path,source);return {path:join(job.id,filename),sha256:digest(source),bytes:Buffer.byteLength(source)};}
 async verify(result){if(!result||result.success===false||!result.artifact)return false;const full=resolve(this.directory,'artifacts',result.artifact.path);if(!full.startsWith(join(this.directory,'artifacts')+'/'))return false;const bytes=await readFile(full);return digest(bytes)===result.artifact.sha256 && result.checked===true;}
 async runCorner(corner,job){const p=job.parameters;
  if(corner.id==='tool-factory'){
   const factory=new IntegratedToolFactory();const generated=factory.generate(p.request||{});
   if(!generated.tool)throw new Error('Original factory could not resolve the request: '+JSON.stringify(generated));
   const output=await generated.tool.execute(p.input??'');const exported=factory.exportTool(generated.tool.id);
   const artifact=await this.artifact(job,exported.fileName,exported.source);
   // Run only source emitted by the fixed, preserved factory; never incoming package code.
   const module=await import('data:text/javascript;base64,'+Buffer.from(exported.source).toString('base64'));
   if(module.manifest.id!==generated.tool.id)throw new Error('Exported identity mismatch');
   const replay=await module.execute(p.input??'');
   // Exports carry learned state; a second call may deliberately increment counts.
   const expectedReplay=await generated.tool.execute(p.input??'');
   if(!isDeepStrictEqual(replay,expectedReplay))throw new Error('Exported tool output differs from the original runtime');
   return {success:true,kind:'tool',checked:true,artifact,manifest:exported.manifest,output,replay,limits:'Bounded original runtime families; not arbitrary algorithm generation'};
  }
  if(corner.id==='neural-net-maker'){
   const config=p.configuration||{};
   if(config.nodeCount!==undefined&&(!Number.isInteger(config.nodeCount)||config.nodeCount<2||config.nodeCount>32))throw new Error('nodeCount must be 2–32');
   if(p.input!==undefined&&(!Array.isArray(p.input)||p.input.length!==4||!p.input.every(Number.isFinite)))throw new Error('Provide four finite input values');
   const composition=await this.neural.call({operation:'generate',seed:config.seed??1,nodeCount:config.nodeCount??4,allowInhibition:config.allowInhibition??true});
   const output=await this.neural.call({operation:'run',composition:composition.id,input:p.input||[0,0,0,0]});
   if(!output||!composition.nodes?.length)throw new Error('Neural composition failed');
   const artifact=await this.artifact(job,'composition.json',JSON.stringify({composition,output},null,2));
   return {success:true,kind:'neural-composition',checked:true,artifact,output,limits:'Original lightweight mathematical architecture families; not full production models or personalized birth-chart inference'};
  }
  if(corner.id==='model-maker'){
   const requirements=await readFile(new URL('./vendor/modelmaker/requirements.txt',import.meta.url),'utf8');
   const source=await readFile(new URL('./vendor/modelmaker/app.py',import.meta.url),'utf8');
   const report={trainer:'Stellarproximology Modelmaker',sourceSha256:digest(source),requirements,training:'not run',reason:'Python training dependencies and a training corpus have not been provisioned. No model has been generated.'};
   const artifact=await this.artifact(job,'modelmaker-inspection.json',JSON.stringify(report,null,2));
   return {success:true,kind:'inspection',checked:true,artifact,output:report};
  }
  const factory=new IntegratedToolFactory(),mesh=new AutomataMesh(),bridge=new ATONativeBridge({Automaton,mesh,factory});
  if(!Array.isArray(p.requests)||p.requests.length<2||p.requests.length>16)throw new Error('Provide 2–16 original factory requests to connect');
  const tools=p.requests.map(request=>{const r=bridge.generateAndMount(request);if(!r.automaton)throw new Error('Unresolved ATO tool request');return r.automaton;});
  for(let i=1;i<tools.length;i++){const c=bridge.connect(tools[i-1].id,tools[i].id);if(c.status!=='connected')throw new Error('Original ATO port connection rejected');}
  const run=await bridge.run(tools[0].id,p.input??'');if(run.visited.length!==tools.length)throw new Error('Not all tools ran');
  const artifact=await this.artifact(job,'mesh-run.json',JSON.stringify({mesh:mesh.snapshot(),run},null,2));
  return {success:true,kind:'ato-mesh',checked:true,artifact,output:run};
 }
}
