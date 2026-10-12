import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {loadEnvFile} from 'node:process';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {api} from './server.js';
import {DiskBucket} from './storage.mjs';
import {authenticated} from './auth.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
// Load bundled server settings automatically; hosting runtime variables take priority.
const supplied={...process.env};try{loadEnvFile(resolve(root,'.env'));Object.assign(process.env,supplied)}catch(e){if(e.code!=='ENOENT')throw e}
const env={...process.env,BUCKET:new DiskBucket(resolve(root,process.env.DATA_DIRECTORY||'.data'))};
if(!env.LAKON_USERNAME||!env.LAKON_PASSWORD)throw Error('LAKON_USERNAME dan LAKON_PASSWORD wajib diisi di .env.');
const html=await readFile(resolve(root,'index.html'));
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'"};
const server=http.createServer(async(incoming,outgoing)=>{
 try{
  if(!authenticated(incoming.headers.authorization,env)){outgoing.writeHead(401,{...security,'WWW-Authenticate':'Basic realm="LAKON", charset="UTF-8"'});outgoing.end('Masuk ke LAKON dengan akun dalam .env.');return}
  const origin=env.APP_ORIGIN||'http://'+incoming.headers.host,url=new URL(incoming.url,origin);
  if(url.origin!==new URL(origin).origin){outgoing.writeHead(400,security);outgoing.end();return}
  if(url.pathname.startsWith('/api/')){
   const headers=new Headers();for(const [key,value] of Object.entries(incoming.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
   // Client-supplied identity is always replaced after server authentication.
   headers.set('oai-authenticated-user-id','hosting-owner');headers.set('oai-authenticated-user-full-name','Studio LAKON');headers.delete('authorization');
   const method=incoming.method||'GET';const request=new Request(url,{method,headers,...(!['GET','HEAD'].includes(method)?{body:Readable.toWeb(incoming),duplex:'half'}:{})});
   const response=await api(request,env);outgoing.writeHead(response.status,{...security,...Object.fromEntries(response.headers)});if(method==='HEAD'||!response.body)outgoing.end();else await pipeline(Readable.fromWeb(response.body),outgoing);return
  }
  if((url.pathname==='/'||url.pathname==='/index.html')&&['GET','HEAD'].includes(incoming.method)){outgoing.writeHead(200,{...security,'Content-Type':'text/html;charset=utf-8'});outgoing.end(incoming.method==='HEAD'?undefined:html);return}
  outgoing.writeHead(404,security);outgoing.end('Tidak ditemukan.');
 }catch{if(!outgoing.headersSent){outgoing.writeHead(500,security);outgoing.end('Server belum dapat memproses permintaan.')}else outgoing.destroy()}
});
server.listen(Number(env.PORT||3000),env.HOST||'127.0.0.1',()=>console.log('LAKON berjalan pada port '+(env.PORT||3000)+'.'));
