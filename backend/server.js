export const ARK_ORIGIN='https://ark.ap-southeast.bytepluses.com';
export const MODEL_MAP={
 seedream:{kind:'image',label:'Seedream · Gambar'},
 'seedream-edit':{kind:'edit',label:'Seedream · Referensi'},
 seedance:{kind:'video',label:'Seedance · Video'}
};
const MODEL_ALIASES={schnell:'seedream',dev:'seedream',kontext:'seedream-edit',kling:'seedance'};
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const fail=(message,status=400,code)=>{throw Object.assign(new Error(message),{status,code})};
const safeID=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
const getJSON=async(bucket,key)=>{const o=await bucket.get(key);return o?{data:await o.json(),etag:o.etag}:null;};
const putJSON=(bucket,key,data,opts={})=>bucket.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'},...opts});
const publicJob=j=>{const {providerID,resultURL,statusURL,responseURL,cancelURL,...v}=j;return v;};
export function arkBase(env){const raw=env.ARK_BASE_URL||ARK_ORIGIN+'/api/v3';let u;try{u=new URL(raw)}catch{fail('Konfigurasi alamat BytePlus tidak valid.',503)}if(u.origin!==ARK_ORIGIN||u.pathname.replace(/\/$/,'')!=='/api/v3'||u.search||u.hash||u.username||u.password)fail('Alamat BytePlus harus memakai endpoint resmi Singapore.',503);return ARK_ORIGIN+'/api/v3';}
const modelID=(env,kind)=>kind==='video'?env.ARK_VIDEO_MODEL:env.ARK_IMAGE_MODEL;
const singleImageModel=id=>/^dola-seedream-5-0-(?:pro|flash)-/.test(id||'');
const seedSupported=id=>!singleImageModel(id)&&!/^dreamina-seedance-2-/.test(id||'');
const validModel=id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,119}$/.test(id);
async function readLimited(response,max){const reader=response.body?.getReader();if(!reader)return new Uint8Array();let total=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();fail('Respons provider terlalu besar.',502)}chunks.push(value)}}finally{reader.releaseLock()}const out=new Uint8Array(total);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length}return out;}
async function bodyJSON(req,max=1024*1024){const bytes=await readLimited(req,max);try{return JSON.parse(new TextDecoder().decode(bytes))}catch(e){if(e.status)throw e;fail('JSON tidak valid.')}}
async function providerJSON(response){return bodyJSON(response,32*1024*1024)}
function imageType(bytes){return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80?'image/webp':null;}
const toBase64=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);};
export function generationInput(data,env={}){
 const key=MODEL_ALIASES[data.model]||data.model,model=MODEL_MAP[key];if(!model)fail('Model tidak didukung.');
 if(typeof data.prompt!=='string'||!data.prompt.trim()||data.prompt.length>6000)fail('Prompt wajib diisi, maksimal 6.000 karakter.');
 if(!['1:1','9:16','16:9','3:4','4:3'].includes(data.ratio))fail('Rasio tidak valid.');
 if(!Number.isInteger(data.count)||data.count<1||data.count>4)fail('Jumlah harus 1–4.');
 if(data.seed!==null&&data.seed!==undefined&&(!Number.isInteger(data.seed)||data.seed<0||data.seed>2147483647))fail('Seed tidak valid.');
 const references=data.references??(data.referenceID?[{id:data.referenceID,role:'character'}]:[]);
 if(!Array.isArray(references)||references.length>8)fail('Maksimal 8 referensi gambar.');
 for(const ref of references){if(!ref||!safeID(ref.id)||!['character','location','property','style'].includes(ref.role||'style'))fail('Referensi tidak valid.');}
 if(model.kind==='edit'&&!references.length)fail('Pilih gambar referensi terlebih dahulu.');
 const dimensions={'1:1':'2048x2048','9:16':'1440x2560','16:9':'2560x1440','3:4':'1728x2304','4:3':'2304x1728'};
 const providerModel=modelID(env,model.kind),singleImage=singleImageModel(providerModel);
 if(singleImage&&data.count!==1)fail('Seedream 5.0 Flash/Pro menghasilkan satu gambar per permintaan. Pilih jumlah 1.',400,'MODEL_COUNT_UNSUPPORTED');
 if(!seedSupported(providerModel)&&data.seed!==null&&data.seed!==undefined)fail('Model ini tidak mendukung seed manual. Kosongkan kolom seed.',400,'MODEL_SEED_UNSUPPORTED');
 let input={model:providerModel,prompt:data.prompt.trim(),size:dimensions[data.ratio],response_format:'b64_json',watermark:true};
 if(model.kind!=='video'&&!singleImage){input.sequential_image_generation=data.count>1?'auto':'disabled';if(data.count>1)input.sequential_image_generation_options={max_images:data.count};}
 if(data.seed!==null&&data.seed!==undefined)input.seed=data.seed;
 if(model.kind==='video'){
  if(!Number.isInteger(data.duration)||data.duration<4||data.duration>15)fail('Durasi harus 4–15 detik.');
  if(data.count!==1)fail('Video dibuat satu per permintaan.');
  if(references.length>1&&!String(input.model).startsWith('dreamina-seedance-2-'))fail('Beberapa referensi video memerlukan Seedance 2.x yang tersedia di akunmu.');
  if(!['480p','720p'].includes(data.resolution||'480p'))fail('Resolusi video tidak valid.');
  input={model:input.model,content:[{type:'text',text:data.prompt.trim()}],duration:data.duration,ratio:data.ratio,resolution:data.resolution||'480p',generate_audio:data.audio===true,watermark:true};
  if(data.seed!==null&&data.seed!==undefined)input.seed=data.seed;
 }
 return {key,model,input,references};
}
function providerFailure(status,out){const raw=out?.error?.code||out?.code,providerCode=typeof raw==='string'&&/^[A-Za-z0-9_.-]{1,120}$/.test(raw)?raw:undefined;if(raw==='SetLimitExceeded')return {code:'FREE_QUOTA_EXHAUSTED',providerCode,error:'Kuota gratis BytePlus habis. Generasi dihentikan; mode gratis tidak diubah.'};if(status===429)return {code:'RATE_LIMITED',providerCode,error:'Batas permintaan BytePlus tercapai. Coba lagi nanti.'};if(status===401)return {code:'PROVIDER_AUTHENTICATION_FAILED',providerCode,error:'API key BytePlus ditolak. Perbarui ARK_API_KEY pada konfigurasi backend dengan API key ModelArk yang aktif.'};if(status===403)return {code:'PROVIDER_ACCESS_DENIED',providerCode,error:'BytePlus menolak akses ke model. Periksa project, aktivasi model, dan kuota gratis.'};return {code:'PROVIDER_FAILED',providerCode,error:'BytePlus belum dapat memproses permintaan (HTTP '+status+'). Periksa model dan dashboard provider.'};}
async function markQuota(bucket,ownerBase,model){await putJSON(bucket,ownerBase+'provider-quota.json',{blocked:true,model,updated:new Date().toISOString()});}
export function safeOutput(url){let u;try{u=new URL(url)}catch{fail('Alamat hasil tidak valid.',502)}const allowed=['tos-ap-southeast-1.volces.com','tos-ap-southeast-1.bytepluses.com','bytepluscdn.com'];if(u.protocol!=='https:'||u.username||u.password||u.port||!allowed.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))fail('Alamat hasil BytePlus tidak diizinkan.',502);return u.href;}
async function saveImages(out,job,bucket,base){const media=out.data;if(!Array.isArray(media)||!media.length)fail('BytePlus tidak menghasilkan gambar.',502);job.outputs=[];for(const [i,m] of media.slice(0,job.count).entries()){if(m.error){job.partialError=true;continue}if(typeof m.b64_json!=='string'||m.b64_json.length>28*1024*1024)fail('Gambar BytePlus tidak valid atau terlalu besar.',502);let bin;try{bin=atob(m.b64_json)}catch{fail('Data gambar tidak valid.',502)}const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0)),type=imageType(bytes);if(!type)fail('Format hasil gambar tidak didukung.',502);const id=job.id+'-'+i;await bucket.put(base+'assets/'+id,bytes,{httpMetadata:{contentType:type}});job.outputs.push({id,url:'/api/assets/'+id,type});}if(!job.outputs.length)fail('Tidak ada gambar yang berhasil dibuat.',502);job.status='completed';job.usage=out.usage||null;}
async function saveVideo(out,job,bucket,base){const src=safeOutput(out.content?.video_url);job.resultURL=src;const response=await fetch(src,{redirect:'manual',signal:AbortSignal.timeout(60000)});if(!response.ok)fail('Unduhan video gagal.',502);const type=(response.headers.get('Content-Type')||'').split(';')[0];if(type!=='video/mp4')fail('Format hasil video tidak didukung.',502);const bytes=await readLimited(response,60*1024*1024),id=job.id+'-0';if(bytes.length<12)fail('Video kosong.',502);await bucket.put(base+'assets/'+id,bytes,{httpMetadata:{contentType:type}});job.outputs=[{id,url:'/api/assets/'+id,type}];job.status='completed';job.usage=out.usage||null;delete job.resultURL;}
export function validateWorkspace(value){
  if(!value||!Array.isArray(value.projects)||!Array.isArray(value.assets)||!Array.isArray(value.briefs))fail('Workspace tidak valid.');
  if(value.projects.length>200||value.assets.length>1000||value.briefs.length>1000)fail('Batas workspace terlampaui.');
  for(const p of value.projects){
    if(!safeID(p.id)||typeof p.name!=='string'||p.name.length>120||!Array.isArray(p.nodes)||p.nodes.length>100||!Array.isArray(p.links)||p.links.length>300)fail('Proyek tidak valid.');
    for(const n of p.nodes){if(!safeID(n.id)||!['prompt','image','video','note','reference'].includes(n.type)||!Number.isFinite(n.x)||!Number.isFinite(n.y)||n.x<0||n.x>2000||n.y<0||n.y>1400||typeof(n.text||'')!=='string'||(n.text||'').length>6000)fail('Node tidak valid.');if(n.referenceID&&!safeID(n.referenceID))fail('Referensi node tidak valid.');if(n.referenceRole&&!['character','location','property','style'].includes(n.referenceRole))fail('Peran referensi tidak valid.');if(n.output&&(!safeID(n.output.id)||!/^\/api\/assets\/[\w-]+$/.test(n.output.url)||!['image/png','image/jpeg','image/webp','video/mp4'].includes(n.output.type)))fail('Hasil node tidak valid.');}
    for(const l of p.links){if(!safeID(l.from)||!safeID(l.to)||!p.nodes.some(n=>n.id===l.from)||!p.nodes.some(n=>n.id===l.to))fail('Koneksi node tidak valid.');}
  }
  for(const a of value.assets){if(!safeID(a.id)||typeof a.name!=='string'||a.name.length>300||!/^\/api\/assets\/[\w-]+$/.test(a.url)||!['image/png','image/jpeg','image/webp','video/mp4'].includes(a.type))fail('Aset tidak valid.');}
  for(const b of value.briefs){if(!safeID(b.id)||typeof b.prompt!=='string'||b.prompt.length>10000||typeof b.created!=='string')fail('Brief tidak valid.');}
  if(value.story!==null&&value.story!==undefined){const s=value.story;if(typeof s.name!=='string'||s.name.length>120||typeof s.audience!=='string'||s.audience.length>300||![15,30,60].includes(s.duration)||!Array.isArray(s.scenes)||s.scenes.length>30)fail('Storyboard tidak valid.');for(const sc of s.scenes){if(typeof sc.title!=='string'||sc.title.length>120||typeof sc.visual!=='string'||sc.visual.length>6000||typeof sc.script!=='string'||sc.script.length>6000||!Number.isFinite(sc.duration)||sc.duration<=0||sc.duration>60)fail('Adegan tidak valid.');}}
  return value;
}
export async function api(req,env){
 try{
 const url=new URL(req.url),path=url.pathname,user=req.headers.get('oai-authenticated-user-id');
 if(!user)return json({error:'Silakan masuk dengan ChatGPT untuk membuka studio privat.'},401);
 const owner=encodeURIComponent(user),base='users/'+owner+'/';
 if(!['GET','HEAD'].includes(req.method)&&req.headers.get('Origin')!==url.origin)return json({error:'Permintaan lintas situs ditolak.'},403);
 if(path==='/api/config'&&req.method==='GET'){
  const quota=env.BUCKET?(await getJSON(env.BUCKET,base+'provider-quota.json'))?.data:null;
  const keyReady=!!env.ARK_API_KEY,freeOnlyConfirmed=env.ARK_FREE_ONLY_CONFIRMED==='true';
  const models=Object.fromEntries(Object.entries(MODEL_MAP).map(([key,m])=>{const id=modelID(env,m.kind);return [key,{...m,modelID:id||null,configured:validModel(id),maxCount:m.kind==='video'||singleImageModel(id)?1:4,supportsSeed:seedSupported(id)}]}));
  return json({provider:'byteplus',keyReady,freeOnlyConfirmed,quotaBlocked:!!quota?.blocked,providerReady:keyReady&&freeOnlyConfirmed&&Object.values(models).some(m=>m.configured)&&!quota?.blocked,storageReady:!!env.BUCKET,models,displayName:decodeName(req.headers)||'Studio pribadi'});
 }
 if(!env.BUCKET)return json({error:'Penyimpanan server belum terhubung.'},503);
 const bucket=env.BUCKET;
    if(path==='/api/workspace'){
      const key=base+'workspace.json';
      if(req.method==='GET'){const w=await getJSON(bucket,key);return json({workspace:w?.data||null,etag:w?.etag||null});}
      if(req.method==='PUT'){
        const value=validateWorkspace(await bodyJSON(req));const etag=req.headers.get('If-Match');
        const object=await putJSON(bucket,key,value,{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}});
        if(!object)return json({error:'Workspace berubah di tab lain. Muat versi terbaru sebelum menyimpan.'},409);
        return json({etag:object.etag});
      }
    }
    if(path==='/api/uploads'&&req.method==='POST'){
      const type=req.headers.get('Content-Type');if(!['image/png','image/jpeg','image/webp'].includes(type))fail('Gunakan JPG, PNG, atau WebP.');
      const bytes=await req.arrayBuffer();if(bytes.byteLength>10*1024*1024||bytes.byteLength<12)fail('Berkas maksimal 10 MB dan tidak boleh kosong.',413);
      const b=new Uint8Array(bytes),valid=type==='image/png'?b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71:type==='image/jpeg'?b[0]===255&&b[1]===216:b[0]===82&&b[1]===73&&b[2]===70&&b[3]===70&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80;
      if(!valid)fail('Isi berkas tidak cocok dengan format gambar.');
      const id=crypto.randomUUID();await bucket.put(base+'assets/'+id,bytes,{httpMetadata:{contentType:type}});
      return json({id,url:'/api/assets/'+id,type,size:bytes.byteLength},201);
    }
    if(path.startsWith('/api/assets/')&&req.method==='GET'){
      const id=path.slice(12);if(!safeID(id))fail('Aset tidak valid.');const asset=await bucket.get(base+'assets/'+id);
      if(!asset)return json({error:'Aset tidak ditemukan.'},404);
      return new Response(asset.body,{headers:{'Content-Type':asset.httpMetadata.contentType,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
    }
    if(path==='/api/jobs'&&req.method==='GET'){
      const objects=await bucket.list({prefix:base+'jobs/',limit:200});
      const jobs=await Promise.all(objects.objects.map(async o=>(await getJSON(bucket,o.key))?.data));
      return json({jobs:jobs.filter(Boolean).map(publicJob).sort((a,b)=>b.created.localeCompare(a.created))});
    }
    if(path==='/api/generate'&&req.method==='POST'){
      if(!env.ARK_API_KEY)return json({error:'API key BytePlus belum dipasang.',code:'PROVIDER_NOT_CONFIGURED'},503);
      if(env.ARK_FREE_ONLY_CONFIRMED!=='true')return json({error:'Generasi terkunci sampai Free Tokens Only Mode dikonfirmasi aktif di akun BytePlus.',code:'FREE_ONLY_NOT_CONFIRMED'},503);
      const data=await bodyJSON(req,20000),parsed=generationInput(data,env),{model,input,references}=parsed;
      if(!validModel(input.model))return json({error:'Model ID BytePlus belum dipilih pada konfigurasi server.',code:'MODEL_NOT_CONFIGURED'},503);
      arkBase(env);
      if(data.nodeID&&!safeID(data.nodeID)||data.projectID&&!safeID(data.projectID))fail('Tujuan node tidak valid.');
      const id=data.requestID;if(!safeID(id))fail('ID permintaan tidak valid.');
      const jobKey=base+'jobs/'+id,prior=await getJSON(bucket,jobKey);if(prior)return json(publicJob(prior.data),prior.data.status==='submitting'?202:200);
      if((await getJSON(bucket,base+'provider-quota.json'))?.data?.blocked)return json({error:'Generasi berhenti karena kuota gratis BytePlus habis.',code:'FREE_QUOTA_EXHAUSTED'},429);
      // Resolve all references and validate ownership before claiming a generation.
      const images=[];let refBytes=0;
      for(const ref of references){const asset=await bucket.get(base+'assets/'+ref.id);if(!asset)fail('Referensi tidak ditemukan di pustaka milikmu.',404);if(!['image/png','image/jpeg','image/webp'].includes(asset.httpMetadata?.contentType))fail('Referensi harus berupa gambar.');refBytes+=asset.size;if(asset.size>8*1024*1024||refBytes>16*1024*1024)fail('Total referensi maksimal 16 MB, 8 MB per gambar.',413);images.push({url:'data:'+asset.httpMetadata.contentType+';base64,'+toBase64(new Uint8Array(await asset.arrayBuffer())),role:ref.role||'style'});}
      if(images.length){if(model.kind==='video'){for(const image of images)input.content.push({type:'image_url',image_url:{url:image.url},role:images.length>1?'reference_image':'first_frame'});}else input.image=images.length===1?images[0].url:images.map(a=>a.url);}
      const job={id,provider:'byteplus',model:parsed.key,modelID:input.model,label:model.label,prompt:data.prompt.trim(),kind:model.kind,ratio:data.ratio,count:data.count,referenceRoles:images.map(i=>i.role),created:new Date().toISOString(),status:'submitting',outputs:[],nodeID:data.nodeID||null,projectID:data.projectID||null};
      if(!await putJSON(bucket,jobKey,job,{onlyIf:{etagDoesNotMatch:'*'}}))return json({error:'Permintaan sedang dikirim. Periksa riwayat.'},409);
      try{
        const response=await fetch(arkBase(env)+(model.kind==='video'?'/contents/generations/tasks':'/images/generations'),{method:'POST',headers:{Authorization:'Bearer '+env.ARK_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(input),redirect:'manual',signal:AbortSignal.timeout(model.kind==='video'?30000:120000)});
        const out=await providerJSON(response);
        if(!response.ok||out.error){Object.assign(job,providerFailure(response.status,out),{status:'failed'});if(job.code==='FREE_QUOTA_EXHAUSTED')await markQuota(bucket,base,job.modelID);}
        else if(model.kind==='video'){if(!safeID(out.id))fail('ID video BytePlus tidak valid.',502);job.providerID=out.id;job.status='queued';}
        else await saveImages(out,job,bucket,base);
      }catch(e){job.status='failed';job.code=e.code||'SUBMISSION_UNCERTAIN';job.error=e.status?e.message:'Respons BytePlus belum dapat dipastikan. Jangan kirim ulang sebelum memeriksa dashboard BytePlus; tidak ada pengiriman ulang otomatis.';}
      await putJSON(bucket,jobKey,job);return json(publicJob(job),job.status==='failed'?(job.code==='FREE_QUOTA_EXHAUSTED'?429:422):job.status==='completed'?200:202);
    }
    if(path.startsWith('/api/jobs/')&&req.method==='GET'){
      const id=path.slice(10);if(!safeID(id))fail('ID pekerjaan tidak valid.');const key=base+'jobs/'+id,stored=await getJSON(bucket,key);if(!stored)return json({error:'Pekerjaan tidak ditemukan.'},404);
      const job=stored.data;
      if(job.provider!=='byteplus')return json(publicJob(job));
      if(env.ARK_API_KEY&&job.kind==='video'&&['queued','processing'].includes(job.status)){
        if(!safeID(job.providerID))fail('ID provider tidak valid.',502);
        const response=await fetch(arkBase(env)+'/contents/generations/tasks/'+encodeURIComponent(job.providerID),{headers:{Authorization:'Bearer '+env.ARK_API_KEY},redirect:'manual',signal:AbortSignal.timeout(30000)});
        const out=await providerJSON(response);
        if(!response.ok){const problem=providerFailure(response.status,out);if(problem.code==='FREE_QUOTA_EXHAUSTED'){await markQuota(bucket,base,job.modelID);Object.assign(job,problem,{status:'failed'});}else return json({...publicJob(job),pollError:problem.error});}
        else if(out.status==='succeeded'){
          try{await saveVideo(out,job,bucket,base)}catch(e){job.pollError='Video selesai di BytePlus, tetapi penyimpanan belum berhasil. Perbarui status untuk mencoba unduhan kembali.';}
        }else if(['failed','cancelled','expired'].includes(out.status)){job.status='failed';const problem=providerFailure(422,out);Object.assign(job,problem);if(problem.code==='FREE_QUOTA_EXHAUSTED')await markQuota(bucket,base,job.modelID);}
        else job.status=out.status==='running'?'processing':'queued';
        if(!await putJSON(bucket,key,job,{onlyIf:{etagMatches:stored.etag}}))return json(publicJob((await getJSON(bucket,key)).data));
      }
      return json(publicJob(job));
    }
    return json({error:'Endpoint tidak ditemukan.'},404);
  }catch(e){return json({error:e.status?e.message:'Layanan belum dapat memproses permintaan. Coba lagi.',code:e.code||null},e.status||500);}
}
function decodeName(headers){let name=headers.get('oai-authenticated-user-full-name');if(headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(name)}catch{}}return name;}
