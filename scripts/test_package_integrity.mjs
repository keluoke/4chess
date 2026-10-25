import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version;
const unpacked=path.join(root,`releases/diverge-extension-v${version}`),zip=unpacked+'.zip';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'diverge-package-check-'));
execFileSync('unzip',['-q',zip,'-d',temporary]);
const hashes={};
try{
 function walk(dir,rel=''){
  for(const name of fs.readdirSync(dir)){
   const file=path.join(dir,name),key=path.join(rel,name);
   assert(!name.startsWith('._'), `AppleDouble file leaked: ${key}`);
   assert(!name.startsWith('_')||(rel===''&&name==='_locales'),`Reserved underscore filename: ${key}`);
   if(fs.statSync(file).isDirectory()){walk(file,key);continue;}
   assert(!/puzzle-poster|qrcode\.mjs|share-service|\.env|_headers|_redirects/.test(key),`Local/generated file leaked: ${key}`);
   const bytes=fs.readFileSync(file);assert.deepEqual(bytes,fs.readFileSync(path.join(temporary,key)),`ZIP differs from unpacked: ${key}`);
   if(/\.(js|css|html|json)$/.test(name))assert(!/PUZZLE_POSTER|LOCAL_FEATURE_START|127\.0\.0\.1:3210|localhost:3210|WECHAT_APPSECRET/.test(bytes.toString()),`Local feature leaked: ${key}`);
   assert(bytes.length<25*1024*1024);if(key.startsWith('models/'))assert(bytes.length<1024*1024);
   hashes[key]=createHash('sha256').update(bytes).digest('hex');
  }
 }
 walk(unpacked);
 const manifest=JSON.parse(fs.readFileSync(path.join(unpacked,'manifest.json')));
 assert.equal(manifest.version,version);assert(fs.existsSync(path.join(unpacked,'_locales/en/messages.json')));assert(!fs.existsSync(path.join(unpacked,'__locales')));
 for(const entry of [manifest.background.service_worker,manifest.action.default_popup,...manifest.content_scripts.flatMap(c=>[...c.js,...c.css||[]])])assert(fs.existsSync(path.join(unpacked,entry)),entry);
 const prior=JSON.parse(fs.readFileSync(path.join(root,`releases/diverge-extension-v${version}.json`)));
 const record={sourceCommit:prior.sourceCommit,sourceDirty:prior.sourceDirty,version,zip,unpacked,zipSha256:createHash('sha256').update(fs.readFileSync(zip)).digest('hex'),bytes:fs.statSync(zip).size,files:hashes,localShareIncluded:false};
 fs.writeFileSync(path.join(root,`releases/diverge-extension-v${version}.json`),JSON.stringify(record,null,2)+'\n');
 console.log(`PASS current ZIP and Load unpacked directory identical; ${Object.keys(hashes).length} files; _locales spelled exactly; no local service or generated Pages files`);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
