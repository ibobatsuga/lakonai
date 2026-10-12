// DOM interaction smoke checks. These do not measure browser layout or rendering.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
const {parseHTML}=await import(process.env.DOM_TEST_MODULE||'linkedom');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const {window,document}=parseHTML(html);
window.scrollTo=()=>{};
let hash='#/home';const storage=new Map(),location={get hash(){return hash},set hash(value){hash=value.startsWith('#')?value:'#'+value}};
const sandbox={document,window,location,crypto:webcrypto,console,Blob,URL,structuredClone,
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 setTimeout:()=>1,clearTimeout:()=>{},fetch:async(path)=>({ok:true,json:async()=>path.endsWith('/config')?{providerReady:false,storageReady:false,displayName:'Test Studio'}:{jobs:[]}})};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(script+`\nglobalThis.ui={navigate,validateImport,state:()=>workspace,setProvider:()=>config.providerReady=true,generate,config:()=>config,scene:sceneReferences,character:()=>characterReference};`,sandbox);
await new Promise(r=>setImmediate(r));
const $=s=>document.querySelector(s),click=async s=>{const el=$(s);assert.ok(el,'Missing control: '+s);el.dispatchEvent(new window.Event('click',{bubbles:true}));await new Promise(r=>setImmediate(r));};
const route=r=>{location.hash='#/'+r;sandbox.ui.navigate()};
let checks=0;const passed=label=>{checks++;console.log('PASS '+label)};
for(const r of ['home','image','video','cinema','character','canvas','story','assets','jobs','settings']){route(r);assert.ok($('#content').textContent.trim());assert.equal(document.querySelectorAll('.nav a.active').length,1)}passed('10 routes render and navigation state follows route');
route('image');await click('[data-action="save-brief"]');assert.equal(sandbox.ui.state().briefs.length,0);assert.match($('#toast').textContent,/Tulis arahan/);passed('blank brief rejected');
$('#prompt').value='Cup in warm light';$('#prompt').dispatchEvent(new window.Event('input',{bubbles:true}));await click('[data-action="save-brief"]');assert.equal(sandbox.ui.state().briefs[0].prompt,'Cup in warm light');assert.ok(storage.get('ruangkarya-workspace-v1'));passed('brief saved with local durability');
route('jobs');await click('[data-view-job]');assert.match($('#modal').textContent,/Cup in warm light/);await click('#reuse-brief');sandbox.ui.navigate();assert.equal($('#prompt').value,'Cup in warm light');passed('history detail and brief reuse');
assert.ok($('[data-action="generate"]').disabled);passed('generation disabled when server has no key');
route('canvas');await click('[data-action="new-project"]');$('#new-project-name').value='Coffee campaign';await click('#create-project');assert.equal(sandbox.ui.state().projects[0].name,'Coffee campaign');assert.ok($('#canvas-board'));passed('create project via dialog');
await click('[data-template-node="prompt"]');await click('[data-template-node="image"]');let p=sandbox.ui.state().projects[0];assert.equal(p.nodes.length,2);await click('[data-connect-from="'+p.nodes[0].id+'"]');await click('[data-connect-to="'+p.nodes[1].id+'"]');assert.equal(p.links.length,1);assert.ok($('#canvas-links path'));passed('add and connect Canvas nodes');
await click('[data-action="canvas-undo"]');assert.equal(sandbox.ui.state().projects[0].links.length,0);passed('undo restores project state');
p=sandbox.ui.state().projects[0];await click('[data-copy-node="'+p.nodes[0].id+'"]');assert.equal(sandbox.ui.state().projects[0].nodes.length,3);await click('[data-delete-node="'+p.nodes[1].id+'"]');assert.equal(sandbox.ui.state().projects[0].nodes.length,2);passed('duplicate and delete Canvas nodes');
sandbox.ui.setProvider();route('canvas');await click('[data-template-node="image"]');p=sandbox.ui.state().projects[0];const generator=p.nodes.find(n=>n.type==='image');await click('[data-generate-node="'+generator.id+'"]');assert.match($('#toast').textContent,/Prompt belum diisi/);assert.ok(!$('#confirm-generation'));passed('empty Canvas prompt cannot fall back to studio prompt');
sandbox.ui.state().assets.push({id:'ref1',url:'/api/assets/ref1',type:'image/png',name:'Reference',folder:'Gambar'});await click('[data-node-reference="'+generator.id+'"]');await click('[data-pick-asset="ref1"]');assert.equal(generator.referenceID,'ref1');passed('Canvas reference selected on the correct node');
route('story');$('#story-name').value='Sunday Coffee';$('#story-audience').value='Coffee lovers';await click('[data-action="build-story"]');assert.equal(sandbox.ui.state().story.scenes.length,3);$('#scene-script-0').value='Try a slower morning.';$('#scene-script-0').dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(sandbox.ui.state().story.scenes[0].script,'Try a slower morning.');passed('manual storyboard and scene editing');
await click('[data-action="build-story"]');assert.ok($('#confirm-rebuild-story'));await click('[data-action="close-modal"]');await click('[data-action="story-to-canvas"]');sandbox.ui.navigate();assert.equal(sandbox.ui.state().projects[0].nodes.length,6);assert.equal(sandbox.ui.state().projects[0].links.length,3);passed('story overwrite confirmation and Canvas conversion');
assert.throws(()=>sandbox.ui.validateImport({projects:[],assets:[],briefs:[],story:{scenes:'bad'}}));const valid=JSON.parse(JSON.stringify(sandbox.ui.state()));sandbox.ui.validateImport(valid);valid.projects[0].nodes[0].id='\" onclick=alert(1)';assert.throws(()=>sandbox.ui.validateImport(valid));passed('backup schema rejects corrupted story and unsafe node IDs');
console.log(`${checks} DOM groups passed; layout, pointer capture, mobile and browser accessibility remain unverified.`);

route('image');sandbox.ui.setProvider();sandbox.ui.scene.location={id:'location-ref',url:'/api/assets/location-ref',type:'image/png',name:'Temple',local:false};sandbox.ui.state().assets.push(sandbox.ui.scene.location);const requests=[];sandbox.fetch=async(path,opts={})=>{requests.push({path,opts});if(path.endsWith('/generate'))return {ok:true,json:async()=>({id:'made',status:'completed',outputs:[{id:'made-0',url:'/api/assets/made-0',type:'image/png'}]})};return {ok:true,json:async()=>({jobs:[]})}};await sandbox.ui.generate({prompt:'Character in temple',model:'seedream'});assert.equal(requests.length,0);assert.ok(document.querySelector('#confirm-generation'));await click('#confirm-generation');const post=requests.find(r=>r.path.endsWith('/generate'));assert.ok(post);const payload=JSON.parse(post.opts.body);assert.ok(payload.references.some(r=>r.id==='location-ref'&&r.role==='location'));assert.ok(payload.references.some(r=>r.id==='ref1'&&r.role==='character'));assert.match(payload.prompt,/Reference mapping/);assert.equal(document.querySelector('.stage-result').getAttribute('src'),'/api/assets/made-0');passed('generation requires confirmation and submits location reference to hosted backend');

Object.assign(sandbox.ui.config(),{models:{seedream:{maxCount:1,supportsSeed:false},"seedream-edit":{maxCount:1,supportsSeed:false}}});route("image");assert.equal(document.querySelectorAll("#count option").length,1);assert.ok(document.querySelector("#seed").disabled);route("video");assert.ok(![...document.querySelectorAll("#duration option")].some(o=>o.textContent==="3"));passed("configured Flash controls permit one image and valid video duration");
