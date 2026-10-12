import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {DiskBucket} from '../backend/storage.mjs';

test('disk storage preserves binary files and conditional writes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lakon-bucket-')),bucket=new DiskBucket(directory);
 try{const bytes=new Uint8Array([255,216,0,128,255,217]);const first=await bucket.put('users/a/assets/image',bytes,{httpMetadata:{contentType:'image/jpeg'},onlyIf:{etagDoesNotMatch:'*'}});assert.ok(first.etag);assert.equal(await bucket.put('users/a/assets/image','bad',{onlyIf:{etagDoesNotMatch:'*'}}),null);assert.deepEqual(new Uint8Array(await (await bucket.get('users/a/assets/image')).arrayBuffer()),bytes);assert.equal((await bucket.list({prefix:'users/b/'})).objects.length,0);assert.equal((await bucket.list({prefix:'users/a/'})).objects.length,1)}finally{await rm(directory,{recursive:true,force:true})}
});

test('hosting server boots, authenticates and never serves secrets',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lakon-host-'));
 const child=spawn(process.execPath,['backend/node-server.mjs'],{env:{...process.env,PORT:'31947',HOST:'127.0.0.1',APP_ORIGIN:'http://127.0.0.1:31947',DATA_DIRECTORY:directory,LAKON_USERNAME:'tester',LAKON_PASSWORD:'test-password',GOOGLE_API_KEY:'test-only-google-key',GOOGLE_DIRECTOR_MODEL:'gemini-3.5-flash',GOOGLE_VIDEO_MODEL:'veo-3.1-generate-preview'},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server exited before listening')})]);
  const base='http://127.0.0.1:31947';
  assert.equal((await fetch(base+'/api/config')).status,401);
  const headers={Authorization:'Basic '+Buffer.from('tester:test-password').toString('base64')};
  const html=await (await fetch(base,{headers})).text();
  assert.ok(html.includes('LAKON'));
  assert.ok(!html.includes('test-only-google-key'));
  const config=await (await fetch(base+'/api/config',{headers})).json();
  assert.equal(config.providerReady,true);
  assert.ok(!JSON.stringify(config).includes('test-only-google-key'));
  for(const path of ['/.env','/backend/server.js','/.data/file','/LAKON-hosting.zip'])assert.equal((await fetch(base+path,{headers})).status,404);
  const workspace={projects:[],assets:[],briefs:[]};
  assert.equal((await fetch(base+'/api/workspace',{method:'PUT',headers:{...headers,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(workspace)})).status,200);
  assert.equal((await (await fetch(base+'/api/workspace',{headers})).json()).workspace.projects.length,0);
  assert.equal((await fetch(base+'/api/workspace',{method:'PUT',headers:{...headers,Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify(workspace)})).status,403);
 }finally{
  child.kill();
  await once(child,'exit');
  await rm(directory,{recursive:true,force:true});
 }
});
