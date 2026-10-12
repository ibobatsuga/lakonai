import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import handler from '../api/index.js';

function createMockReq(url, method = 'GET', headers = {}, body = null) {
  let sent = false;
  const req = new Readable({
    read() {
      if (!sent && body) {
        sent = true;
        this.push(Buffer.isBuffer(body) ? body : Buffer.from(body));
      }
      this.push(null);
    }
  });
  req.url = url;
  req.method = method;
  const authHeader = 'Basic ' + Buffer.from('admin:lakonstudio2026').toString('base64');
  req.headers = {
    host: 'lakonai.vercel.app',
    'x-forwarded-proto': 'https',
    authorization: authHeader,
    ...headers
  };
  return req;
}

function createMockRes() {
  const res = new EventEmitter();
  res.headers = {};
  res.bodyChunks = [];
  res.headersSent = false;

  res.writeHead = (status, headers = {}) => {
    res.statusCode = status;
    res.headers = {...res.headers, ...headers};
    res.headersSent = true;
  };

  res.write = chunk => {
    if (chunk) res.bodyChunks.push(Buffer.from(chunk));
  };

  res.end = chunk => {
    if (chunk) res.bodyChunks.push(Buffer.from(chunk));
    res.body = Buffer.concat(res.bodyChunks).toString('utf8');
    res.emit('finish');
  };

  return res;
}

test('Vercel serverless function serves /api/config', async () => {
  const req = createMockReq('/api/config', 'GET');
  const res = createMockRes();

  await new Promise(resolve => {
    res.on('finish', resolve);
    handler(req, res);
  });

  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.provider, 'google');
  assert.equal(json.providerReady, true);
  assert.ok(json.models['google-veo']);
  assert.ok(json.models['google-gemini']);
  assert.ok(json.models['google-image']);
});

test('Vercel serverless function saves and retrieves workspace', async () => {
  const initReq = createMockReq('/api/workspace', 'GET');
  const initRes = createMockRes();
  await new Promise(resolve => {
    initRes.on('finish', resolve);
    handler(initReq, initRes);
  });
  const initJson = JSON.parse(initRes.body);
  const existingEtag = initJson.etag;

  const workspace = {projects: [{id: 'v1', name: 'Vercel Project', nodes: [], links: []}], assets: [], briefs: []};
  const putReq = createMockReq('/api/workspace', 'PUT', {
    origin: 'https://lakonai.vercel.app',
    'content-type': 'application/json',
    ...(existingEtag ? {'if-match': existingEtag} : {})
  }, JSON.stringify(workspace));
  const putRes = createMockRes();

  await new Promise(resolve => {
    putRes.on('finish', resolve);
    handler(putReq, putRes);
  });

  assert.equal(putRes.statusCode, 200);
  const putJson = JSON.parse(putRes.body);
  assert.ok(putJson.etag);

  // Retrieve workspace
  const getReq = createMockReq('/api/workspace', 'GET');
  const getRes = createMockRes();

  await new Promise(resolve => {
    getRes.on('finish', resolve);
    handler(getReq, getRes);
  });

  assert.equal(getRes.statusCode, 200);
  const getJson = JSON.parse(getRes.body);
  assert.equal(getJson.workspace.projects[0].name, 'Vercel Project');
});
