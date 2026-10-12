import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
import {api} from '../backend/server.js';
import {DiskBucket} from '../backend/storage.mjs';
import {authenticated} from '../backend/auth.mjs';

export const config = {
  api: {
    bodyParser: false,
  },
};

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  loadEnvFile(resolve(root, '.env'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

const dataDir = process.env.DATA_DIRECTORY || join(tmpdir(), 'lakon-data');
const bucket = new DiskBucket(dataDir);

export default async function handler(req, res) {
  try {
    const env = {
      ...process.env,
      BUCKET: bucket,
    };
    const protectedStudio = !!env.LAKON_PASSWORD && !!env.LAKON_USERNAME;
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const proto = req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');

    let origin = env.APP_ORIGIN;
    if (!origin && req.headers.origin) {
      try {
        const originUrl = new URL(req.headers.origin);
        if (originUrl.host === host) {
          origin = originUrl.origin;
        }
      } catch {}
    }
    if (!origin) {
      origin = `${proto}://${host}`;
    }

    const url = new URL(req.url, origin);
    const path = url.pathname;

    if (protectedStudio && !authenticated(req.headers.authorization, env)) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="LAKON", charset="UTF-8"',
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain;charset=utf-8'
      });
      return res.end('Masuk dengan akun studio pada konfigurasi backend.');
    }

    if (!protectedStudio && path !== '/api/config') {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ error: 'Atur LAKON_USERNAME dan LAKON_PASSWORD sebelum mengaktifkan backend AI.' }));
    }

    if (!protectedStudio && path === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ providerReady: false, storageReady: false, error: 'Backend AI memerlukan konfigurasi autentikasi studio.' }));
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(',') : value);
      }
    }

    headers.set('oai-authenticated-user-id', 'hosting-owner');
    headers.set('oai-authenticated-user-full-name', 'Studio LAKON');
    headers.delete('authorization');

    const method = req.method || 'GET';
    const request = new Request(url, {
      method,
      headers,
      ...(!['GET', 'HEAD'].includes(method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
    });

    const response = await api(request, env);
    const resHeaders = Object.fromEntries(response.headers);
    res.writeHead(response.status, resHeaders);

    if (method === 'HEAD' || !response.body) {
      res.end();
    } else {
      await pipeline(Readable.fromWeb(response.body), res);
    }
  } catch (err) {
    console.error('API Error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Server error occurred.' }));
    } else {
      res.destroy();
    }
  }
}
