export const uid=()=>crypto.randomUUID();
export const clone=value=>structuredClone(value);
// Retire demonstration photos and the explicitly removed portrait from saved drafts.
export function removeDemoPhotos(workspace){
 const removed=new Set(workspace.assets.filter(a=>/^assets\/visual-0[3-8]\.webp$/.test(a.src)||(/^image\//.test(a.type)&&/^pas foto copy(?:\.png)?$/i.test(a.name.trim()))).map(a=>a.id));
 if(!removed.size)return 0;
 workspace.assets=workspace.assets.filter(a=>!removed.has(a.id));
 for(const p of workspace.projects){
  p.refs=p.refs.filter(id=>!removed.has(id));
  p.timeline=p.timeline.filter(c=>!removed.has(c.assetId));
  for(const n of p.nodes)if(removed.has(n.assetId)){
   delete n.assetId;delete n.jobId;delete n.jobRequest;
   n.draft=true;n.status='pending';
  }
 }
 return removed.size;
}
const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
export function validateWorkspace(v){
 if(!v||v.format!=='lakon-canvas-v1'||!Array.isArray(v.projects)||!v.projects.length||v.projects.length>30||!Array.isArray(v.assets)||v.assets.length>100)throw Error('Berkas bukan ruang kerja LAKON yang valid.');
 if(v.sessions!==undefined&&(!Array.isArray(v.sessions)||v.sessions.length>100||v.sessions.some(x=>typeof x.id!=='string'||typeof x.prompt!=='string'||x.prompt.length>6000||!['seedance','seedream','seedream-edit'].includes(x.model)||!['processing','completed','failed'].includes(x.status)||typeof x.created!=='string'||!Number.isFinite(Date.parse(x.created)))))throw Error('Riwayat generasi tidak valid.');
 const ids=new Set();for(const a of v.assets){if(typeof a.id!=='string'||ids.has(a.id)||typeof a.name!=='string'||a.name.length>200||!['image/png','image/jpeg','image/webp','video/mp4','audio/mpeg','audio/wav','audio/ogg'].includes(a.type)||typeof a.src!=='string'||a.src.length>12000000||!(/^(data:(?:image\/(?:png|jpeg|webp)|video\/mp4|audio\/(?:mpeg|wav|ogg));base64,[A-Za-z0-9+/=]+|assets\/[a-zA-Z0-9_.-]+|\/api\/assets\/[a-zA-Z0-9_-]+)$/.test(a.src)))throw Error('Ada aset yang tidak valid.');ids.add(a.id)}
 const projectIds=new Set();for(const p of v.projects){if(typeof p.id!=='string'||projectIds.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||!Array.isArray(p.nodes)||p.nodes.length>120||!Array.isArray(p.timeline)||p.timeline.length>100||!p.view||!finite(p.view.z,.15,3)||!finite(p.view.x,-50000,50000)||!finite(p.view.y,-50000,50000)||typeof p.prompt!=='string'||p.prompt.length>6000||!Array.isArray(p.refs)||p.refs.length>8||p.refs.some(id=>!ids.has(id)))throw Error('Ada proyek yang tidak valid.');projectIds.add(p.id);const nodeIds=new Set();for(const n of p.nodes){if(typeof n.id!=='string'||nodeIds.has(n.id)||!['image','video','audio','note','section'].includes(n.type)||!finite(n.x,-20000,20000)||!finite(n.y,-20000,20000)||!finite(n.w,60,10000)||!finite(n.h,40,10000)||typeof n.name!=='string'||n.name.length>200||typeof(n.text||'')!=='string'||(n.text||'').length>6000||!['character','location','property','style'].includes(n.role||'style')||(['image','video','audio'].includes(n.type)&&!ids.has(n.assetId)&&!(n.draft===true&&['image','video'].includes(n.type)&&['pending','processing','failed'].includes(n.status))))throw Error('Ada objek kanvas yang tidak valid.');if(n.status&&!['ready','processing','failed','pending'].includes(n.status))throw Error('Status node tidak valid.');nodeIds.add(n.id)}for(const c of p.timeline)if(!ids.has(c.assetId)||!finite(c.duration,1,30))throw Error('Durasi storyboard tidak valid.');
  p.links??=[];if(!Array.isArray(p.links)||p.links.length>300)throw Error('Koneksi kanvas tidak valid.');const linkIds=new Set(),seen=[];for(const l of p.links){if(typeof l.id!=='string'||linkIds.has(l.id)||typeof(l.label||'')!=='string'||(l.label||'').length>80)throw Error('Identitas koneksi tidak valid.');linkIds.add(l.id);validateConnection({...p,links:seen},l.from,l.to,l.kind);seen.push(l)}
 }
 if(!projectIds.has(v.activeId))throw Error('Proyek aktif tidak ditemukan.');return v;
}
export function arrange(nodes,mode='grid'){
 if(!nodes.length)return [];const x=Math.min(...nodes.map(n=>n.x)),y=Math.min(...nodes.map(n=>n.y)),width=Math.max(...nodes.map(n=>n.w)),height=Math.max(...nodes.map(n=>n.h)),columns=mode==='horizontal'?nodes.length:mode==='vertical'?1:Math.ceil(Math.sqrt(nodes.length));return nodes.map((n,i)=>({...n,x:x+(i%columns)*(width+28),y:y+Math.floor(i/columns)*(height+45)}));
}
export function fitView(nodes,width,height){if(!nodes.length)return {x:40,y:40,z:1};const minX=Math.min(...nodes.map(n=>n.x)),minY=Math.min(...nodes.map(n=>n.y)),maxX=Math.max(...nodes.map(n=>n.x+n.w)),maxY=Math.max(...nodes.map(n=>n.y+n.h));const z=Math.max(.15,Math.min(1.3,(width-100)/(maxX-minX),(height-200)/(maxY-minY)));return {x:(width-(maxX-minX)*z)/2-minX*z,y:(height-140-(maxY-minY)*z)/2-minY*z,z};}
export function zoomAt(view,z,point){z=Math.max(.15,Math.min(3,z));return {z,x:point.x-(point.x-view.x)/view.z*z,y:point.y-(point.y-view.y)/view.z*z};}
export function emptyProject(name){return {id:uid(),name,nodes:[],links:[],timeline:[],refs:[],prompt:'',view:{x:40,y:40,z:1},model:'seedream',ratio:'16:9',duration:4};}
export function validateConnection(project,from,to,kind){
 const a=project.nodes.find(n=>n.id===from),b=project.nodes.find(n=>n.id===to);if(!a||!b||a===b||a.type==='section'||b.type==='section')throw Error('Hubungkan dua objek yang berbeda.');
 if(!['primary','influence'].includes(kind))throw Error('Jenis koneksi tidak valid.');
 if((project.links||[]).some(l=>l.from===from&&l.to===to))throw Error('Koneksi ini sudah ada.');
 if(kind==='primary'){const queue=[to],seen=new Set();while(queue.length){const id=queue.pop();if(id===from)throw Error('Dependensi utama tidak boleh membentuk lingkaran.');if(seen.has(id))continue;seen.add(id);queue.push(...(project.links||[]).filter(l=>l.kind==='primary'&&l.from===id).map(l=>l.to))}}
 return true;
}
export function dependencyBlockers(project,nodeId){return (project.links||[]).filter(l=>l.to===nodeId&&l.kind==='primary').map(l=>project.nodes.find(n=>n.id===l.from)).filter(n=>!n||['processing','failed','pending'].includes(n.status)||(n.type==='note'?!n.text?.trim():!n.assetId));}
export function sceneOrder(project){const nodes=project.nodes.filter(n=>n.type!=='section'),byId=new Map(nodes.map(n=>[n.id,n])),links=(project.links||[]).filter(l=>l.kind==='primary'),degree=new Map(nodes.map(n=>[n.id,0]));for(const l of links)degree.set(l.to,(degree.get(l.to)||0)+1);const sort=(a,b)=>a.x-b.x||a.y-b.y,queue=nodes.filter(n=>degree.get(n.id)===0).sort(sort),result=[];while(queue.length){const n=queue.shift();result.push(n);for(const l of links.filter(l=>l.from===n.id)){degree.set(l.to,degree.get(l.to)-1);if(degree.get(l.to)===0&&byId.has(l.to)){queue.push(byId.get(l.to));queue.sort(sort)}}}if(result.length!==nodes.length)throw Error('Dependensi utama membentuk lingkaran.');return result.filter(n=>['image','video'].includes(n.type));}
export function generationContext(project,nodeId){const target=project.nodes.find(n=>n.id===nodeId),incoming=(project.links||[]).filter(l=>l.to===nodeId),sources=incoming.map(l=>project.nodes.find(n=>n.id===l.from)).filter(n=>n&&!['processing','failed','pending'].includes(n.status)),texts=[project.prompt,target?.type==='note'?target.text:'',...sources.filter(n=>n.type==='note').map(n=>n.text)].filter(t=>t?.trim()),references=(project.refs||[]).map(id=>({id,role:null}));for(const n of sources.filter(n=>n.type==='image'))if(!references.some(r=>r.id===n.assetId))references.push({id:n.assetId,role:n.role||'style'});return {prompt:[...new Set(texts)].join('\n\n'),references,unsupported:sources.filter(n=>['video','audio'].includes(n.type))};}
export function edgeGeometry(a,b){const x1=a.x+a.w+10,y1=a.y+a.h/2,x2=b.x-10,y2=b.y+b.h/2,bend=Math.max(60,Math.abs(x2-x1)*.46);return {path:`M ${x1} ${y1} C ${x1+bend} ${y1}, ${x2-bend} ${y2}, ${x2} ${y2}`,x:(x1+x2)/2,y:(y1+y2)/2};}
export class History{constructor(){this.past=[];this.future=[]}push(projects){this.past.push(clone(projects));if(this.past.length>30)this.past.shift();this.future=[]}undo(projects){if(!this.past.length)return null;this.future.push(clone(projects));return this.past.pop()}redo(projects){if(!this.future.length)return null;this.past.push(clone(projects));return this.future.pop()}}
