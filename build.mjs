import {mkdir,copyFile,cp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url)),dist=join(root,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const file of ['index.html','style.css','fonts.css','app.mjs','model.mjs','routing.mjs'])await copyFile(join(root,file),join(dist,file));
await cp(join(root,'assets'),join(dist,'assets'),{recursive:true});
for(const route of ['home','asset','ai-canvas','explore','elements']){await mkdir(join(dist,route));await copyFile(join(root,'index.html'),join(dist,route,'index.html'));}
console.log('Lakon AI static build ready.');
