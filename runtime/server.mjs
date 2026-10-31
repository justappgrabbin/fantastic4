import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Harness } from './harness.mjs';
const token=process.env.FANTASTIC4_TOKEN;
if(!token||token.length<32)throw new Error('A per-install FANTASTIC4_TOKEN is required');
const harness=await new Harness(process.env.SYNTHIA_DATA_DIR||'./workspace').initialize();
const server=http.createServer(async(req,res)=>{
 const provided=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return send(401,{error:'Authorization required'});
 try{
  if(req.method==='GET'&&req.url==='/api/status')return send(200,await harness.snapshot());
  if(req.method==='POST'&&req.url==='/api/jobs'){
   let data='';for await(const part of req){data+=part;if(Buffer.byteLength(data)>1024*1024)return send(413,{error:'Job exceeds limit'});}
   return send(202,await harness.submit(JSON.parse(data)));
  }
  send(404,{error:'Not found'});
 }catch(error){send(400,{error:String(error.message||error)});}
});
server.listen(Number(process.env.PORT||4183),'127.0.0.1',()=>console.log('Fantastic4 local engine ready'));
process.on('SIGTERM',()=>server.close());
