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
  req.headers = {
    host: 'lakonai.vercel.app',
    'x-forwarded-proto': 'https',
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

test('Vercel serverless function serves /api/config when unconfigured', async () => {
  const req = createMockReq('/api/config', 'GET');
  const res = createMockRes();

  await new Promise(resolve => {
    res.on('finish', resolve);
    handler(req, res);
  });

  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.providerReady, false);
});
