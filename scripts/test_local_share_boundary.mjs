// Only rejects requests before the cloud call boundary. Never generates a WeChat code.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const child=spawn(process.execPath,['scripts/share-service.mjs'],{env:{...process.env,PORT:String(port),LOCAL_TOKEN:'review-local-boundary-secret'},stdio:['ignore','pipe','pipe']});
let ready;const started=new Promise((resolve,reject)=>{ready=resolve;child.once('error',reject);child.once('exit',code=>reject(new Error(`Local service exited: ${code}`)));});
child.stdout.on('data',chunk=>{if(chunk.toString().includes('Listening strictly'))ready();});child.stderr.on('data',()=>{});
try{
 await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Local bridge startup timeout')),5000))]);
 const url=`http://127.0.0.1:${port}/api/share/code`;
 const request=async headers=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'});
 assert.equal((await request({Origin:'https://untrusted.example'})).status,403);
 const Origin='chrome-extension://'+'a'.repeat(32);
 assert.equal((await request({Origin})).status,401);
 assert.equal((await request({Origin,Authorization:'Bearer wrong'})).status,401);
 assert.equal((await request({Origin,Authorization:'Bearer review-local-boundary-secret'})).status,400);
 console.log('PASS local bridge rejects untrusted origins, missing/wrong bearer tokens and invalid FEN before cloud operations');
}finally{child.kill();}
