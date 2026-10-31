import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const directory=await mkdtemp(join(tmpdir(),'fantastic4-http-'));
const token=randomUUID()+randomUUID(),port=43000+Math.floor(Math.random()*10000),url='http://127.0.0.1:'+port;
let child,logs='';
const start=()=>{child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,PORT:String(port),FANTASTIC4_TOKEN:token,SYNTHIA_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});child.stdout.on('data',s=>logs+=s);child.stderr.on('data',s=>logs+=s);};
const request=(path,body)=>fetch(url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
async function ready(){for(let i=0;i<100;i++){try{const r=await request('/api/status');if(r.ok)return;}catch{}if(child.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}throw Error('Startup timed out: '+logs);}
async function stop(){const p=child;await new Promise(resolve=>{p.once('exit',resolve);p.kill('SIGTERM');});}
try {
 start();await ready();assert.equal((await fetch(url+'/api/status')).status,401);
 const response=await request('/api/jobs',{capability:'tool.create',parameters:{request:{purpose:'orchestrate a workflow system',dimension:'Space'},input:'sense build test mount'}});
 assert.equal(response.status,202);const queued=await response.json();let job;
 for(let i=0;i<100;i++){const state=await(await request('/api/status')).json();job=state.jobs.find(j=>j.id===queued.id);if(job?.finished)break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(job.status,'verified');assert.equal(job.result.output.output,'sense build test mount');
 await stop();start();await ready();const restored=await(await request('/api/status')).json();assert.equal(restored.jobs.find(j=>j.id===queued.id).status,'verified');
 console.log('Authenticated API, original tool execution, evidence and restart persistence PASS');
}finally{if(child&&child.exitCode===null)await stop();}
