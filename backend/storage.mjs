import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
// Private object storage adapter. Never served as a static directory.
export class DiskBucket {
 constructor(directory){this.directory=resolve(directory);this.queue=Promise.resolve()}
 filename(key){return join(this.directory,Buffer.from(key).toString('base64url')+'.json')}
 async raw(key){try{return JSON.parse(await readFile(this.filename(key),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
 async get(key){const item=await this.raw(key);if(!item)return null;const bytes=Buffer.from(item.base64,'base64');return {key,etag:item.etag,size:bytes.length,httpMetadata:item.httpMetadata,body:bytes,json:async()=>JSON.parse(bytes.toString('utf8')),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}
 put(key,value,options={}){const work=this.queue.then(async()=>{const previous=await this.raw(key),condition=options.onlyIf;if(condition?.etagMatches&&previous?.etag!==condition.etagMatches)return null;if(condition?.etagDoesNotMatch==='*'&&previous)return null;const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(value);const item={key,etag:randomUUID(),httpMetadata:options.httpMetadata||{},base64:bytes.toString('base64')};await mkdir(this.directory,{recursive:true,mode:0o700});const temp=this.filename(key)+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(item),{mode:0o600});await rename(temp,this.filename(key));return {etag:item.etag}});this.queue=work.catch(()=>{});return work}
 async list({prefix,limit=1000,cursor}={}){await mkdir(this.directory,{recursive:true,mode:0o700});const keys=(await readdir(this.directory)).filter(n=>n.endsWith('.json')).map(n=>Buffer.from(n.slice(0,-5),'base64url').toString()).filter(k=>k.startsWith(prefix||'')).sort();const start=cursor?keys.indexOf(cursor)+1:0,selected=keys.slice(start,start+limit),truncated=start+limit<keys.length;return {objects:selected.map(key=>({key})),truncated,cursor:truncated?selected.at(-1):undefined}}
 async delete(key){const {unlink}=await import('node:fs/promises');try{await unlink(this.filename(key))}catch(e){if(e.code!=='ENOENT')throw e}}
}
