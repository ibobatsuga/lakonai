import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,generationInput,validateWorkspace,arkBase,safeOutput} from '../backend/server.js';
class Bucket {
 constructor(){this.objects=new Map();this.seq=0;}
 async get(key){const o=this.objects.get(key);if(!o)return null;return {...o,json:async()=>JSON.parse(o.value),arrayBuffer:async()=>new TextEncoder().encode(o.value).buffer,body:o.value};}
 async put(key,value,opts={}){const o=this.objects.get(key),condition=opts.onlyIf;if(condition?.etagMatches&&o?.etag!==condition.etagMatches)return null;if(condition?.etagDoesNotMatch==='*'&&o)return null;const item={value:typeof value==='string'?value:Buffer.from(value).toString('binary'),etag:String(++this.seq),httpMetadata:opts.httpMetadata||{},size:typeof value==='string'?value.length:value.byteLength};this.objects.set(key,item);return item;}
 async list({prefix}){return {objects:[...this.objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}
}
const req=(path,method='GET',body,user='alice',extra={})=>new Request('https://studio.example/api/'+path,{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),...(method!=='GET'?{Origin:'https://studio.example','Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
const workspace={projects:[{id:'p1',name:'Coffee',nodes:[],links:[]}],assets:[],briefs:[]};
test('authentication required on every data endpoint',async()=>{const env={BUCKET:new Bucket()};for(const route of ['config','workspace','jobs','assets/test'])assert.equal((await api(req(route,'GET',undefined,null),env)).status,401)});
test('writes reject cross-origin submission',async()=>{const response=await api(req('workspace','PUT',workspace,'alice',{Origin:'https://attacker.example'}),{BUCKET:new Bucket()});assert.equal(response.status,403)});
test('workspace round trip is durable and isolated by owner',async()=>{const env={BUCKET:new Bucket()};assert.equal((await api(req('workspace','PUT',workspace),env)).status,200);const own=await (await api(req('workspace'),env)).json();assert.equal(own.workspace.projects[0].name,'Coffee');const other=await (await api(req('workspace','GET',undefined,'bob'),env)).json();assert.equal(other.workspace,null)});
test('concurrent writes fail instead of silently overwriting data',async()=>{const env={BUCKET:new Bucket()};const first=await (await api(req('workspace','PUT',workspace),env)).json();assert.equal((await api(req('workspace','PUT',workspace),env)).status,409);assert.equal((await api(req('workspace','PUT',workspace,'alice',{'If-Match':first.etag}),env)).status,200);assert.equal((await api(req('workspace','PUT',workspace,'alice',{'If-Match':first.etag}),env)).status,409)});
test('missing AI key returns explicit unconfigured response, no fake output',async()=>{const env={BUCKET:new Bucket()};assert.equal((await api(req('generate','POST',{prompt:'Hello'}),env)).status,503);assert.equal(env.BUCKET.objects.size,0)});
test('models validate counts, ratio, prompt, seed, duration',()=>{const good={model:'schnell',prompt:'A ceramic cup',ratio:'9:16',count:2,seed:123};assert.deepEqual(generationInput(good).input.size,'1440x2560');for(const changes of [{model:'private-url'},{count:0},{count:5},{prompt:''},{ratio:'bad'},{seed:-1}])assert.throws(()=>generationInput({...good,...changes}));assert.throws(()=>generationInput({...good,model:'kling',count:1,duration:25}));assert.throws(()=>generationInput({...good,model:'kling',duration:5}));assert.equal(generationInput({...good,model:'kling',count:1,duration:5}).input.generate_audio,false)});
test('file type and signature rejected',async()=>{const env={BUCKET:new Bucket()};const response=await api(new Request('https://studio.example/api/uploads',{method:'POST',headers:{'oai-authenticated-user-id':'alice',Origin:'https://studio.example','Content-Type':'image/png'},body:'this is not a PNG image'}),env);assert.equal(response.status,400);assert.equal(env.BUCKET.objects.size,0)});
test('jobs and media are owner scoped',async()=>{const env={BUCKET:new Bucket()};await env.BUCKET.put('users/alice/jobs/job1',JSON.stringify({id:'job1',status:'completed',created:'2026-01-01',statusURL:'secret',responseURL:'secret',outputs:[]}));assert.equal((await api(req('jobs/job1','GET',undefined,'bob'),env)).status,404);const value=await (await api(req('jobs'),env)).json();assert.equal(value.jobs.length,1);assert.equal(value.jobs[0].statusURL,undefined)});
test('workspace schema rejects malformed stories, unsafe node IDs and media',()=>{
 const make=()=>({projects:[],assets:[],briefs:[]});
 assert.throws(()=>validateWorkspace({...make(),story:{name:'A',audience:'B',duration:30,scenes:'bad'}}));
 assert.throws(()=>validateWorkspace({...make(),projects:[{id:'p',name:'A',nodes:[{id:'\" onclick=x',type:'prompt',x:0,y:0}],links:[]}]}));
 assert.throws(()=>validateWorkspace({...make(),projects:[{id:'p',name:'A',nodes:[{id:'n',type:'image',x:0,y:0,output:{id:'x',url:'https://evil.example/x',type:'image/png'}}],links:[]}]}));
});

const configured=()=>({BUCKET:new Bucket(),ARK_API_KEY:'test-only-key',ARK_FREE_ONLY_CONFIRMED:'true',ARK_IMAGE_MODEL:'seedream-4-5-251128',ARK_VIDEO_MODEL:'dreamina-seedance-2-0-mini-260615'});
const imageRequest={requestID:'image1',model:'seedream',prompt:'A cup',ratio:'1:1',count:1};
const sampleImage=()=>Response.json({data:[{b64_json:Buffer.from([255,216,255,217]).toString('base64')}],usage:{total_tokens:42}});
async function withFetch(mock,run){const prior=globalThis.fetch;globalThis.fetch=mock;try{await run()}finally{globalThis.fetch=prior}}
test('provider configuration never returns keys or enables a missing model',async()=>{
 const env=configured();delete env.ARK_IMAGE_MODEL;delete env.ARK_VIDEO_MODEL;
 const response=await (await api(req('config'),env)).json();assert.equal(response.providerReady,false);assert.equal(response.keyReady,true);assert.ok(!JSON.stringify(response).includes('test-only-key'));
 assert.equal((await api(req('generate','POST',imageRequest),env)).status,503);
});
test('no generation occurs until free-only mode is confirmed',async()=>{
 const env=configured();delete env.ARK_FREE_ONLY_CONFIRMED;
 await withFetch(()=>{throw Error('Provider must not be called')},async()=>{
  const r=await api(req('generate','POST',imageRequest),env);assert.equal(r.status,503);assert.equal((await r.json()).code,'FREE_ONLY_NOT_CONFIRMED');assert.equal(env.BUCKET.objects.size,0);
 });
});
test('official origin, credentials, query and content hosts are validated',()=>{
 for(const url of ['https://attacker.example/api/v3','https://ark.ap-southeast.bytepluses.com/api/v3?x=1','https://user:pass@ark.ap-southeast.bytepluses.com/api/v3'])assert.throws(()=>arkBase({ARK_BASE_URL:url}));
 assert.equal(arkBase({}), 'https://ark.ap-southeast.bytepluses.com/api/v3');
 assert.throws(()=>safeOutput('https://tos-ap-southeast-1.volces.com.evil.example/x'));
 assert.throws(()=>safeOutput('http://127.0.0.1/x'));
});
test('Seedream submission is idempotent, uses Bearer auth and stores actual image MIME privately',async()=>{
 const env=configured();let calls=0;
 await withFetch((url,options)=>{calls++;assert.equal(url,'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations');assert.equal(options.headers.Authorization,'Bearer test-only-key');assert.equal(options.redirect,'manual');const b=JSON.parse(options.body);assert.equal(b.model,env.ARK_IMAGE_MODEL);assert.equal(b.response_format,'b64_json');assert.equal(b.size,'2048x2048');return sampleImage()},async()=>{
  const r=await api(req('generate','POST',imageRequest),env);assert.equal(r.status,200);const j=await r.json();assert.equal(j.status,'completed');assert.equal(j.outputs[0].type,'image/jpeg');assert.equal(j.usage.total_tokens,42);
  assert.equal((await api(req('generate','POST',imageRequest),env)).status,200);assert.equal(calls,1);
  assert.equal((await api(req('assets/image1-0','GET',undefined,'bob'),env)).status,404);
  assert.equal((await api(req('assets/image1-0'),env)).headers.get('Content-Type'),'image/jpeg');
 });
});
test('concurrent duplicate generation claims send exactly one provider request',async()=>{
 const env=configured();let calls=0;
 await withFetch(async()=>{calls++;await new Promise(r=>setImmediate(r));return sampleImage()},async()=>{
  await Promise.all([api(req('generate','POST',imageRequest),env),api(req('generate','POST',imageRequest),env)]);assert.equal(calls,1);
 });
});
test('references are resolved privately before submission and foreign assets are rejected',async()=>{
 const env=configured();await env.BUCKET.put('users/alice/assets/local1',new Uint8Array([255,216,0,0]),{httpMetadata:{contentType:'image/jpeg'}});await env.BUCKET.put('users/alice/assets/local2',new Uint8Array([255,216,0,0]),{httpMetadata:{contentType:'image/jpeg'}});
 let calls=0;await withFetch((url,options)=>{calls++;const b=JSON.parse(options.body);assert.equal(b.image.length,2);assert.ok(b.image.every(v=>v.startsWith('data:image/jpeg;base64,')));return sampleImage()},async()=>{
  const data={...imageRequest,model:'seedream-edit',references:[{id:'local1',role:'character'},{id:'local2',role:'location'}]};assert.equal((await api(req('generate','POST',data,'bob'),env)).status,404);assert.equal(calls,0);assert.equal((await api(req('generate','POST',data),env)).status,200);assert.equal(calls,1);
 });
});
test('free quota exhausted blocks all subsequent generations without any fallback',async()=>{
 const env=configured();let calls=0;await withFetch(()=>{calls++;return Response.json({error:{code:'SetLimitExceeded'}},{status:429})},async()=>{
  const first=await api(req('generate','POST',imageRequest),env);assert.equal(first.status,429);assert.equal((await first.json()).code,'FREE_QUOTA_EXHAUSTED');
  assert.equal((await api(req('generate','POST',{...imageRequest,requestID:'image2'}),env)).status,429);assert.equal(calls,1);
  const config=await (await api(req('config'),env)).json();assert.equal(config.quotaBlocked,true);assert.equal(config.providerReady,false);
 });
});
test('normal rate limiting is distinct from free quota exhaustion',async()=>{
 const env=configured();await withFetch(()=>Response.json({error:{code:'TooManyRequests'}},{status:429}),async()=>{
  const r=await api(req('generate','POST',imageRequest),env);assert.equal((await r.json()).code,'RATE_LIMITED');assert.equal((await (await api(req('config'),env)).json()).quotaBlocked,false);
 });
});
test('ambiguous image response is not retried on the same request ID',async()=>{
 const env=configured();let calls=0;await withFetch(()=>{calls++;throw new Error('timeout')},async()=>{const r=await api(req('generate','POST',imageRequest),env);assert.equal((await r.json()).code,'SUBMISSION_UNCERTAIN');await api(req('generate','POST',imageRequest),env);assert.equal(calls,1)});
});
test('Seedance supports text-only video and safely polls until private output is available',async()=>{
 const env=configured();let calls=0;const media='https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/video.mp4';
 await withFetch((url,options)=>{calls++;if(options.method==='POST'){const b=JSON.parse(options.body);assert.equal(b.content.length,1);assert.equal(b.resolution,'480p');assert.equal(b.duration,5);return Response.json({id:'cgt-test'})}if(url===media){assert.equal(options.headers,undefined);return new Response(new Uint8Array(16),{headers:{'Content-Type':'video/mp4'}})}assert.equal(url,'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-test');assert.equal(options.headers.Authorization,'Bearer test-only-key');return Response.json({status:'succeeded',content:{video_url:media},usage:{total_tokens:100}})},async()=>{
  const r=await api(req('generate','POST',{...imageRequest,model:'seedance',duration:5}),env);assert.equal(r.status,202);const value=await r.json();assert.equal(value.providerID,undefined);const j=await (await api(req('jobs/image1'),env)).json();assert.equal(j.status,'completed');assert.equal(j.outputs[0].type,'video/mp4');assert.equal((await api(req('jobs/image1','GET',undefined,'bob'),env)).status,404);assert.equal(calls,3);
 });
});
test('multiple Seedance 2.x reference images carry the correct input role',async()=>{
 const env=configured();for(const id of ['a','b'])await env.BUCKET.put('users/alice/assets/'+id,new Uint8Array([255,216,0,0]),{httpMetadata:{contentType:'image/jpeg'}});
 await withFetch((url,options)=>{const b=JSON.parse(options.body);assert.equal(b.content.length,3);assert.ok(b.content.slice(1).every(c=>c.role==='reference_image'));return Response.json({id:'cgt-ref'})},async()=>{assert.equal((await api(req('generate','POST',{...imageRequest,model:'seedance',duration:5,references:[{id:'a',role:'character'},{id:'b',role:'property'}]}),env)).status,202)});
});
test('unsafe provider media never receives the API key or a network request',async()=>{
 const env=configured();await env.BUCKET.put('users/alice/jobs/bad',JSON.stringify({id:'bad',provider:'byteplus',providerID:'cgt-bad',status:'queued',kind:'video',outputs:[]}));let calls=0;
 await withFetch(()=>{calls++;return Response.json({status:'succeeded',content:{video_url:'https://attacker.example/steal'}})},async()=>{const r=await (await api(req('jobs/bad'),env)).json();assert.equal(r.status,'queued');assert.ok(r.pollError);assert.equal(calls,1);assert.equal(r.resultURL,undefined)});
});
test('reference nodes and local draft migrations have a supported server schema',()=>{
 const value=structuredClone(workspace);value.projects[0].nodes.push({id:'ref',type:'reference',x:0,y:0,text:'',referenceID:'image-ref',referenceRole:'location'});assert.equal(validateWorkspace(value),value);value.projects[0].nodes[0].referenceRole='unsafe';assert.throws(()=>validateWorkspace(value));
});

// Actual owner-selected model versions: reject unsupported controls before provider calls.
test('Seedream Flash sends one image without sequential options or manual seed',async()=>{
 const env=configured();env.ARK_IMAGE_MODEL='dola-seedream-5-0-flash-260915';
 const config=await (await api(req('config'),env)).json();assert.equal(config.models.seedream.maxCount,1);assert.equal(config.models.seedream.supportsSeed,false);
 const input=generationInput(imageRequest,env).input;assert.equal(input.response_format,'b64_json');assert.equal(input.sequential_image_generation,undefined);assert.equal(input.sequential_image_generation_options,undefined);
 let calls=0;await withFetch(()=>{calls++;return sampleImage()},async()=>{
  assert.equal((await api(req('generate','POST',{...imageRequest,count:2}),env)).status,400);
  assert.equal((await api(req('generate','POST',{...imageRequest,seed:42}),env)).status,400);assert.equal(calls,0);assert.equal(env.BUCKET.objects.size,0);
  assert.equal((await api(req('generate','POST',imageRequest),env)).status,200);assert.equal(calls,1);
 });
});
test('Seedance 2.5 supports owner references and rejects unsupported manual seed',()=>{
 const env=configured();env.ARK_VIDEO_MODEL='dreamina-seedance-2-5-260628';
 const data={...imageRequest,model:'seedance',duration:4,references:[{id:'a',role:'character'},{id:'b',role:'location'}]};
 assert.equal(generationInput(data,env).input.model,env.ARK_VIDEO_MODEL);assert.throws(()=>generationInput({...data,seed:42},env),/tidak mendukung seed/);
});

test('provider rejects invalid key with a distinct actionable authentication error',async()=>{const env=configured();await withFetch(()=>Response.json({error:{code:'AuthenticationError'}},{status:401}),async()=>{const response=await api(req('generate','POST',imageRequest),env),job=await response.json();assert.equal(response.status,422);assert.equal(job.code,'PROVIDER_AUTHENTICATION_FAILED');assert.equal(job.providerCode,'AuthenticationError');assert.match(job.error,/ARK_API_KEY/);assert.equal(job.outputs.length,0);assert.ok(!JSON.stringify(job).includes(env.ARK_API_KEY))})});
