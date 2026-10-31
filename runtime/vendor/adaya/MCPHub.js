/**
 * MCP CAPABILITY HUB
 * Message-passing workforce router for large projects.
 * MCP does not become cognition: Synthia owns decomposition, verification,
 * integration, addressing, permissions and learning.
 */
export class MCPHub {
  constructor({ apprenticeship = null, maxParallel = 4 } = {}) {
    this.apprenticeship = apprenticeship;
    this.maxParallel = Math.max(1, maxParallel);
    this.providers = new Map();
    this.evidence = new Map();
    this.audit = [];
  }
  registerProvider(provider) {
    if (!provider?.id || typeof provider.execute !== 'function')
      throw new TypeError('provider requires id and execute(task, context)');
    this.providers.set(provider.id, provider); return this;
  }
  evidenceKey(providerId, capability) { return `${providerId}::${capability}`; }
  profile(providerId, capability) {
    const k=this.evidenceKey(providerId, capability);
    return this.evidence.get(k) || {providerId,capability,attempts:0,successes:0,verifiedSuccesses:0,totalLatencyMs:0,totalCost:0,qualityTotal:0,lastVerified:null};
  }
  score(providerId, capability) {
    const e=this.profile(providerId, capability);
    const reliability=(e.verifiedSuccesses+1)/(e.attempts+2);
    const quality=e.attempts ? e.qualityTotal/e.attempts : 0.5;
    const latency=e.attempts ? e.totalLatencyMs/e.attempts : 1000;
    const cost=e.attempts ? e.totalCost/e.attempts : 0;
    const specialization=this.providers.get(providerId)?.capabilities?.includes(capability) ? 1 : 0.25;
    return 0.35*quality+0.30*reliability+0.25*specialization-0.07*Math.min(1,latency/10000)-0.03*Math.min(1,cost);
  }
  bestProvider(capability) {
    return [...this.providers.values()]
      .filter(p=>!p.capabilities || p.capabilities.includes(capability))
      .sort((a,b)=>this.score(b.id,capability)-this.score(a.id,capability))[0] || null;
  }
  async runTask(task, context={}) {
    const capability=String(task.capability || task.capabilities?.[0] || 'general');
    const provider=this.bestProvider(capability);
    if (!provider) throw new Error(`No provider for ${capability}`);
    const started=Date.now(); let result;
    try { result=await provider.execute(structuredClone(task), this.safeContext(context)); }
    catch(error) { result={success:false,error:String(error?.message||error)}; }
    const latencyMs=Date.now()-started;
    const verification=await this.verify(task,result,context);
    this.record(provider,capability,{success:result?.success!==false,verified:verification.ok,quality:verification.quality,latencyMs,cost:result?.cost||0});
    this.audit.push({type:'DELEGATED',taskId:task.id,providerId:provider.id,capability,verified:verification.ok,at:Date.now()});
    if (verification.ok && this.apprenticeship) this.apprenticeship.recordLesson(capability,{
      output:result.output??result, recipe:result.recipe, task:structuredClone(task), verification
    },provider.id);
    return {taskId:task.id,providerId:provider.id,capability,result,verification,latencyMs};
  }
  async runProject(project, context={}) {
    const tasks=(project.tasks||[]).map((t,i)=>({...t,id:t.id||`${project.id||'project'}:${i}`}));
    const pending=new Map(tasks.map(t=>[t.id,t])), completed=new Map(), failed=new Map();
    while(pending.size) {
      const ready=[...pending.values()].filter(t=>(t.dependsOn||[]).every(id=>completed.has(id)));
      if(!ready.length) throw new Error('Project dependency deadlock/cycle');
      for(let i=0;i<ready.length;i+=this.maxParallel) {
        const batch=ready.slice(i,i+this.maxParallel);
        const results=await Promise.all(batch.map(t=>this.runTask(t,{...context,completed:Object.fromEntries(completed)})));
        results.forEach(r=>{ pending.delete(r.taskId); r.verification.ok?completed.set(r.taskId,r):failed.set(r.taskId,r); });
      }
      if(failed.size) break;
    }
    const output={projectId:project.id,completed:Object.fromEntries(completed),failed:Object.fromEntries(failed)};
    this.audit.push({type:'PROJECT_COMPLETE',projectId:project.id,completed:completed.size,failed:failed.size,at:Date.now()});
    return output;
  }
  async verify(task,result,context) {
    if(typeof task.verify==='function') {
      const v=await task.verify(result,context);
      return typeof v==='boolean'?{ok:v,quality:v?1:0}:{ok:!!v.ok,quality:Number(v.quality??(v.ok?1:0))};
    }
    const ok=result?.success!==false && result!=null;
    return {ok,quality:ok?Number(result.quality??0.7):0};
  }
  record(provider,capability,x) {
    const k=this.evidenceKey(provider.id,capability),e=this.profile(provider.id,capability);
    e.attempts++; if(x.success)e.successes++; if(x.verified)e.verifiedSuccesses++;
    e.totalLatencyMs+=x.latencyMs;e.totalCost+=Number(x.cost||0);e.qualityTotal+=Number(x.quality||0);
    if(x.verified)e.lastVerified=Date.now(); this.evidence.set(k,e);
  }
  safeContext(context){return {sessionId:context.sessionId,projectId:context.projectId,completed:context.completed||{}};}
  snapshot(){return {providers:[...this.providers.keys()],evidence:[...this.evidence.values()].map(e=>({...e,score:this.score(e.providerId,e.capability)})),audit:structuredClone(this.audit)};}
}
export default MCPHub;
