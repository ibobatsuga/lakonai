import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,generationInput,validateWorkspace,GOOGLE_ORIGIN,MODEL_MAP} from '../backend/server.js';

class Bucket {
  constructor(){this.objects=new Map();this.seq=0;}
  async get(key){const o=this.objects.get(key);if(!o)return null;return {...o,json:async()=>JSON.parse(o.value),arrayBuffer:async()=>new TextEncoder().encode(o.value).buffer,body:o.value};}
  async put(key,value,opts={}){const o=this.objects.get(key),condition=opts.onlyIf;if(condition?.etagMatches&&o?.etag!==condition.etagMatches)return null;if(condition?.etagDoesNotMatch==='*'&&o)return null;const item={value:typeof value==='string'?value:Buffer.from(value).toString('binary'),etag:String(++this.seq),httpMetadata:opts.httpMetadata||{},size:typeof value==='string'?value.length:value.byteLength};this.objects.set(key,item);return item;}
  async list({prefix}){return {objects:[...this.objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}
}

const req=(path,method='GET',body,user='alice',extra={})=>new Request('https://studio.example/api/'+path,{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),...(method!=='GET'?{Origin:'https://studio.example','Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
const workspace={projects:[{id:'p1',name:'Coffee',nodes:[],links:[]}],assets:[],briefs:[]};

test('authentication required on every data endpoint',async()=>{
  const env={BUCKET:new Bucket()};
  for(const route of ['config','workspace','jobs','assets/test'])assert.equal((await api(req(route,'GET',undefined,null),env)).status,401);
});

test('writes reject cross-origin submission',async()=>{
  const response=await api(req('workspace','PUT',workspace,'alice',{Origin:'https://attacker.example'}),{BUCKET:new Bucket()});
  assert.equal(response.status,403);
});

test('workspace round trip is durable and isolated by owner',async()=>{
  const env={BUCKET:new Bucket()};
  assert.equal((await api(req('workspace','PUT',workspace),env)).status,200);
  const own=await (await api(req('workspace'),env)).json();
  assert.equal(own.workspace.projects[0].name,'Coffee');
  const other=await (await api(req('workspace','GET',undefined,'bob'),env)).json();
  assert.equal(other.workspace,null);
});

test('concurrent writes fail instead of silently overwriting data',async()=>{
  const env={BUCKET:new Bucket()};
  const first=await (await api(req('workspace','PUT',workspace),env)).json();
  assert.equal((await api(req('workspace','PUT',workspace),env)).status,409);
  assert.equal((await api(req('workspace','PUT',workspace,'alice',{'If-Match':first.etag}),env)).status,200);
  assert.equal((await api(req('workspace','PUT',workspace,'alice',{'If-Match':first.etag}),env)).status,409);
});

test('missing AI key returns explicit unconfigured response, no fake output',async()=>{
  const env={BUCKET:new Bucket()};
  assert.equal((await api(req('generate','POST',{prompt:'Hello'}),env)).status,503);
  assert.equal(env.BUCKET.objects.size,0);
});

test('models validate counts, ratio, prompt, references and duration',()=>{
  const good={model:'google-image',prompt:'A ceramic cup',ratio:'9:16',count:2};
  assert.equal(generationInput(good).key,'google-image');
  assert.equal(generationInput(good).input.ratio,'9:16');
  for(const changes of [{model:'private-url'},{count:0},{count:5},{prompt:''},{ratio:'bad'}]) {
    assert.throws(()=>generationInput({...good,...changes}));
  }
  const video={model:'google-veo',prompt:'Camera dolly around cup',ratio:'16:9',count:1,duration:6};
  const parsedVideo=generationInput(video);
  assert.equal(parsedVideo.key,'google-veo');
  assert.equal(parsedVideo.input.duration,6);
});

test('file type and signature rejected on uploads',async()=>{
  const env={BUCKET:new Bucket()};
  const response=await api(new Request('https://studio.example/api/uploads',{method:'POST',headers:{'oai-authenticated-user-id':'alice',Origin:'https://studio.example','Content-Type':'image/png'},body:'this is not a PNG image'}),env);
  assert.equal(response.status,400);
  assert.equal(env.BUCKET.objects.size,0);
});

test('jobs and media are owner scoped',async()=>{
  const env={BUCKET:new Bucket()};
  await env.BUCKET.put('users/alice/jobs/job1',JSON.stringify({id:'job1',provider:'google',status:'completed',created:'2026-01-01',outputs:[]}));
  assert.equal((await api(req('jobs/job1','GET',undefined,'bob'),env)).status,404);
  const value=await (await api(req('jobs'),env)).json();
  assert.equal(value.jobs.length,1);
  assert.equal(value.jobs[0].id,'job1');
});

test('workspace schema rejects malformed stories, unsafe node IDs and media',()=>{
  const make=()=>({projects:[],assets:[],briefs:[]});
  assert.throws(()=>validateWorkspace({...make(),story:{name:'A',audience:'B',duration:30,scenes:'bad'}}));
  assert.throws(()=>validateWorkspace({...make(),projects:[{id:'p',name:'A',nodes:[{id:'\" onclick=x',type:'prompt',x:0,y:0}],links:[]}]}));
  assert.throws(()=>validateWorkspace({...make(),projects:[{id:'p',name:'A',nodes:[{id:'n',type:'image',x:0,y:0,output:{id:'x',url:'https://evil.example/x',type:'image/png'}}],links:[]}]}));
});

const configured=()=>({
  BUCKET:new Bucket(),
  GOOGLE_API_KEY:'test-only-google-key',
  GOOGLE_VIDEO_MODEL:'veo-3.1-generate-preview',
  GOOGLE_DIRECTOR_MODEL:'gemini-3.5-flash',
  GOOGLE_IMAGE_MODEL:'gemini-3.1-flash-image'
});

const imageRequest={requestID:'image1',model:'google-image',prompt:'A cup of coffee on marble table',ratio:'1:1',count:1};

async function withFetch(mock,run){
  const prior=globalThis.fetch;
  globalThis.fetch=mock;
  try{await run()}finally{globalThis.fetch=prior}
}

test('provider configuration never returns keys and reflects Google Flow readiness',async()=>{
  const env=configured();
  delete env.GOOGLE_API_KEY;
  const response=await (await api(req('config'),env)).json();
  assert.equal(response.providerReady,false);
  assert.equal(response.keyReady,false);
  assert.equal(response.provider,'google');
  assert.ok(response.models['google-veo']);
  assert.ok(response.models['google-gemini']);
  assert.ok(!JSON.stringify(response).includes('test-only-google-key'));
  assert.equal((await api(req('generate','POST',imageRequest),env)).status,503);
});

test('Story Planner endpoint generates multi-scene storyboards via Google Gemini',async()=>{
  const env=configured();
  let calls=0;
  const geminiResponse=()=>Response.json({
    candidates:[{
      content:{
        parts:[{
          text:JSON.stringify([
            {title:'Intro',duration:10,visual:'Opening product shot',script:'Introducing the product.'},
            {title:'Action',duration:10,visual:'Dynamic camera movement',script:'Experience perfection.'},
            {title:'Ending',duration:10,visual:'Closing branding shot',script:'Order yours today.'}
          ])
        }]
      }
    }]
  });

  await withFetch((url,options)=>{
    calls++;
    assert.ok(url.includes(GOOGLE_ORIGIN));
    assert.ok(url.includes('generateContent'));
    assert.ok(url.includes('key=test-only-google-key'));
    return geminiResponse();
  },async()=>{
    const r=await api(req('story/generate','POST',{name:'Sunday Coffee',audience:'Coffee lovers',duration:30}),env);
    assert.equal(r.status,200);
    const j=await r.json();
    assert.equal(j.scenes.length,3);
    assert.equal(j.scenes[0].title,'Intro');
    assert.equal(calls,1);
  });
});

test('Google Image generation stores image privately in Bucket and is idempotent',async()=>{
  const env=configured();
  let calls=0;
  const mockImageResponse=()=>Response.json({
    candidates:[{
      content:{
        parts:[{
          inlineData:{
            mimeType:'image/jpeg',
            data:Buffer.from([255,216,255,217]).toString('base64')
          }
        }]
      }
    }]
  });

  await withFetch((url,options)=>{
    calls++;
    assert.ok(url.includes(GOOGLE_ORIGIN));
    assert.ok(url.includes('key=test-only-google-key'));
    return mockImageResponse();
  },async()=>{
    const r=await api(req('generate','POST',imageRequest),env);
    assert.equal(r.status,200);
    const j=await r.json();
    assert.equal(j.status,'completed');
    assert.equal(j.outputs[0].type,'image/jpeg');
    assert.equal(calls,1);

    // Idempotent: second request with same ID returns existing completed job without calling provider again
    const r2=await api(req('generate','POST',imageRequest),env);
    assert.equal(r2.status,200);
    assert.equal(calls,1);

    // Private asset access: other users cannot see it
    assert.equal((await api(req('assets/image1-0','GET',undefined,'bob'),env)).status,404);
    assert.equal((await api(req('assets/image1-0'),env)).headers.get('Content-Type'),'image/jpeg');
  });
});

test('Google Veo video generation initiates predictLongRunning and safely polls until completed',async()=>{
  const env=configured();
  let calls=0;
  await withFetch((url,options)=>{
    calls++;
    if(options?.method==='POST'){
      assert.ok(url.includes('predictLongRunning'));
      const payload=JSON.parse(options.body);
      assert.equal(payload.parameters.durationSeconds,4);
      return Response.json({name:'operations/veo-op-123'});
    }
    // GET operations poll
    assert.ok(url.includes('operations/veo-op-123'));
    return Response.json({
      done:true,
      response:{
        generateVideoResponse:{
          generatedSamples:[{
            video:{
              bytesBase64Encoded:Buffer.from('mock-mp4-video-data').toString('base64')
            }
          }]
        }
      }
    });
  },async()=>{
    const videoReq={...imageRequest,model:'google-veo',duration:4};
    const r=await api(req('generate','POST',videoReq),env);
    assert.equal(r.status,202);
    const initiated=await r.json();
    assert.equal(initiated.status,'queued');

    // Poll job status
    const poll=await (await api(req('jobs/image1'),env)).json();
    assert.equal(poll.status,'completed');
    assert.equal(poll.outputs[0].type,'video/mp4');
    assert.equal(calls,2);
  });
});

test('Google quota exhausted (429) returns actionable billing error message',async()=>{
  const env=configured();
  await withFetch(()=>Response.json({
    error:{
      code:429,
      status:'RESOURCE_EXHAUSTED',
      message:'Quota exceeded for quota metric...'
    }
  },{status:429}),async()=>{
    const r=await api(req('generate','POST',imageRequest),env);
    assert.equal(r.status,422);
    const j=await r.json();
    assert.equal(j.code,'RATE_LIMITED');
    assert.ok(j.error.includes('Batas kuota Google AI Studio tercapai'));
  });
});

test('Google authentication failure (401/403) returns actionable error message',async()=>{
  const env=configured();
  await withFetch(()=>Response.json({
    error:{
      code:401,
      status:'PERMISSION_DENIED',
      message:'API key not valid'
    }
  },{status:401}),async()=>{
    const r=await api(req('generate','POST',imageRequest),env);
    assert.equal(r.status,422);
    const j=await r.json();
    assert.equal(j.code,'PROVIDER_AUTHENTICATION_FAILED');
    assert.ok(j.error.includes('GOOGLE_API_KEY'));
  });
});

test('reference nodes and local draft migrations have a supported server schema',()=>{
  const value=structuredClone(workspace);
  value.projects[0].nodes.push({id:'ref',type:'reference',x:0,y:0,text:'',referenceID:'image-ref',referenceRole:'location'});
  assert.equal(validateWorkspace(value),value);
  value.projects[0].nodes[0].referenceRole='unsafe';
  assert.throws(()=>validateWorkspace(value));
});
