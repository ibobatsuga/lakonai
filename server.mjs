import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {loadEnvFile} from 'node:process';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {api} from './backend/server.js';
import {authenticated} from './backend/auth.mjs';
import {DiskBucket} from './backend/storage.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)),supplied={...process.env};try{loadEnvFile(resolve(root,'.env'));Object.assign(process.env,supplied)}catch(e){if(e.code!=='ENOENT')throw e}
const env={...process.env,BUCKET:new DiskBucket(resolve(root,process.env.DATA_DIRECTORY||'.data'))},protectedStudio=!!env.LAKON_PASSWORD&&!!env.LAKON_USERNAME;
const types={'.html':'text/html;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'};
http.createServer(async(req,res)=>{try{
 if(protectedStudio&&!authenticated(req.headers.authorization,env)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="LAKON", charset="UTF-8"','Cache-Control':'no-store'});return res.end('Masuk dengan akun studio pada konfigurasi backend.')}
 const origin=env.APP_ORIGIN||'http://'+req.headers.host,url=new URL(req.url,origin),path=url.pathname;
 if(path.startsWith('/api/')){
  if(!protectedStudio){res.writeHead(path==='/api/config'?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(path==='/api/config'?{providerReady:false,storageReady:false,error:'Backend AI memerlukan konfigurasi autentikasi studio.'}:{error:'Atur LAKON_USERNAME dan LAKON_PASSWORD sebelum mengaktifkan backend AI.'}))}
  const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);headers.set('oai-authenticated-user-id','hosting-owner');headers.delete('authorization');const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})}),out=await api(request,env);res.writeHead(out.status,Object.fromEntries(out.headers));if(!out.body)return res.end();await pipeline(Readable.fromWeb(out.body),res);return
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
 const file=['/','/home','/home/','/asset','/asset/','/ai-canvas','/ai-canvas/','/explore','/explore/','/elements','/elements/'].includes(path)?'index.html':path.slice(1);if(!['index.html','app.mjs','model.mjs','routing.mjs','style.css','fonts.css'].includes(file)&&!/^assets\/[a-zA-Z0-9_.-]+\.(png|webp|ttf)$/.test(file)){res.writeHead(404);return res.end('Tidak ditemukan.')}
 const bytes=await readFile(resolve(root,file)),ext=file.slice(file.lastIndexOf('.'));res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
}catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500);res.end(error.code==='ENOENT'?'Tidak ditemukan.':'Server belum dapat memproses permintaan.')}}).listen(Number(env.PORT||3000),env.HOST||'127.0.0.1',()=>console.log('Lakon AI berjalan pada port '+(env.PORT||3000)+'.'));
