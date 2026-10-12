export const GOOGLE_ORIGIN = 'https://generativelanguage.googleapis.com/v1beta';

export const MODEL_MAP = {
  'google-veo': { kind: 'video', label: 'Google Veo · Video' },
  'google-gemini': { kind: 'story', label: 'Google Gemini · AI Director' },
  'google-image': { kind: 'image', label: 'Google Flow · Gambar' },
  'google-image-ref': { kind: 'edit', label: 'Google Flow · Referensi' }
};

const MODEL_ALIASES = {
  seedance: 'google-veo',
  kling: 'google-veo',
  veo: 'google-veo',
  seedream: 'google-image',
  schnell: 'google-image',
  dev: 'google-image',
  'seedream-edit': 'google-image-ref',
  kontext: 'google-image-ref',
  image: 'google-image'
};

const json = (v, status = 200, headers = {}) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
  });

const fail = (message, status = 400, code) => {
  throw Object.assign(new Error(message), { status, code });
};

const safeID = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const getJSON = async (bucket, key) => {
  const o = await bucket.get(key);
  return o ? { data: await o.json(), etag: o.etag } : null;
};
const putJSON = (bucket, key, data, opts = {}) =>
  bucket.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: 'application/json' },
    ...opts
  });

const publicJob = j => {
  const { providerID, resultURL, statusURL, responseURL, cancelURL, ...v } = j;
  return v;
};

const modelID = (env, kind) => {
  if (kind === 'video') return env.GOOGLE_VIDEO_MODEL || 'veo-3.1-generate-preview';
  if (kind === 'story') return env.GOOGLE_DIRECTOR_MODEL || 'gemini-3.5-flash';
  return env.GOOGLE_IMAGE_MODEL || 'gemini-3.1-flash-image';
};

const validModel = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,119}$/.test(id);

async function readLimited(response, max) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  let total = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        fail('Respons provider terlalu besar.', 502);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function bodyJSON(req, max = 1024 * 1024) {
  const bytes = await readLimited(req, max);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    if (e.status) throw e;
    fail('JSON tidak valid.');
  }
}

async function providerJSON(response) {
  return bodyJSON(response, 32 * 1024 * 1024);
}

function imageType(bytes) {
  return bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
    ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216
    ? 'image/jpeg'
    : bytes[0] === 82 &&
      bytes[1] === 73 &&
      bytes[2] === 70 &&
      bytes[3] === 70 &&
      bytes[8] === 87 &&
      bytes[9] === 69 &&
      bytes[10] === 66 &&
      bytes[11] === 80
    ? 'image/webp'
    : null;
}

const toBase64 = bytes => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
};

export function generationInput(data, env = {}) {
  const key = MODEL_ALIASES[data.model] || data.model;
  const model = MODEL_MAP[key];
  if (!model) fail('Model tidak didukung.');
  if (typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 6000)
    fail('Prompt wajib diisi, maksimal 6.000 karakter.');
  if (!['1:1', '9:16', '16:9', '3:4', '4:3'].includes(data.ratio)) fail('Rasio tidak valid.');
  if (!Number.isInteger(data.count) || data.count < 1 || data.count > 4) fail('Jumlah harus 1–4.');

  const references = data.references ?? (data.referenceID ? [{ id: data.referenceID, role: 'character' }] : []);
  if (!Array.isArray(references) || references.length > 8) fail('Maksimal 8 referensi gambar.');
  for (const ref of references) {
    if (!ref || !safeID(ref.id) || !['character', 'location', 'property', 'style'].includes(ref.role || 'style'))
      fail('Referensi tidak valid.');
  }

  const providerModel = modelID(env, model.kind);
  let input = {
    model: providerModel,
    prompt: data.prompt.trim(),
    ratio: data.ratio
  };

  if (model.kind === 'video') {
    const validDurations = [4, 6, 8];
    let dur = Number(data.duration);
    if (!validDurations.includes(dur)) {
      dur = dur <= 5 ? 4 : dur <= 7 ? 6 : 8;
    }
    data.duration = dur;
    input.duration = dur;
  }

  return { key, model, input, references };
}

function providerFailure(status, out) {
  const rawMsg = out?.error?.message || out?.message || '';
  const statusStr = out?.error?.status || '';

  if (status === 429 || statusStr === 'RESOURCE_EXHAUSTED' || rawMsg.includes('quota') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    return {
      code: 'RATE_LIMITED',
      error: 'Batas kuota Google AI Studio tercapai (HTTP 429: Resource Exhausted). Untuk model video (Veo) & image generation, Google AI Studio memerlukan penautan Billing (Pay-As-You-Go) pada project Google Cloud.'
    };
  }
  if (status === 401 || status === 403 || statusStr === 'PERMISSION_DENIED') {
    return {
      code: 'PROVIDER_AUTHENTICATION_FAILED',
      error: 'API key Google Studio ditolak. Periksa GOOGLE_API_KEY pada file .env backend.'
    };
  }
  if (status === 400 || statusStr === 'INVALID_ARGUMENT') {
    return {
      code: 'INVALID_ARGUMENT',
      error: rawMsg || 'Parameter permintaan ke Google Flow tidak valid.'
    };
  }
  return {
    code: 'PROVIDER_FAILED',
    error: rawMsg || ('Google Flow belum dapat memproses permintaan (HTTP ' + status + ').')
  };
}

export function validateWorkspace(value) {
  if (!value || !Array.isArray(value.projects) || !Array.isArray(value.assets) || !Array.isArray(value.briefs))
    fail('Workspace tidak valid.');
  if (value.projects.length > 200 || value.assets.length > 1000 || value.briefs.length > 1000)
    fail('Batas workspace terlampaui.');
  for (const p of value.projects) {
    if (!safeID(p.id) || typeof p.name !== 'string' || p.name.length > 120 || !Array.isArray(p.nodes) || p.nodes.length > 100 || !Array.isArray(p.links) || p.links.length > 300)
      fail('Proyek tidak valid.');
    for (const n of p.nodes) {
      if (!safeID(n.id) || !['prompt', 'image', 'video', 'note', 'reference'].includes(n.type) || !Number.isFinite(n.x) || !Number.isFinite(n.y) || n.x < 0 || n.x > 2000 || n.y < 0 || n.y > 1400 || typeof (n.text || '') !== 'string' || (n.text || '').length > 6000)
        fail('Node tidak valid.');
      if (n.referenceID && !safeID(n.referenceID)) fail('Referensi node tidak valid.');
      if (n.referenceRole && !['character', 'location', 'property', 'style'].includes(n.referenceRole))
        fail('Peran referensi tidak valid.');
      if (n.output && (!safeID(n.output.id) || !/^\/api\/assets\/[\w-]+$/.test(n.output.url) || !['image/png', 'image/jpeg', 'image/webp', 'video/mp4'].includes(n.output.type)))
        fail('Hasil node tidak valid.');
    }
    for (const l of p.links) {
      if (!safeID(l.from) || !safeID(l.to) || !p.nodes.some(n => n.id === l.from) || !p.nodes.some(n => n.id === l.to))
        fail('Koneksi node tidak valid.');
    }
  }
  for (const a of value.assets) {
    if (!safeID(a.id) || typeof a.name !== 'string' || a.name.length > 300 || !/^\/api\/assets\/[\w-]+$/.test(a.url) || !['image/png', 'image/jpeg', 'image/webp', 'video/mp4'].includes(a.type))
      fail('Aset tidak valid.');
  }
  for (const b of value.briefs) {
    if (!safeID(b.id) || typeof b.prompt !== 'string' || b.prompt.length > 10000 || typeof b.created !== 'string')
      fail('Brief tidak valid.');
  }
  if (value.story !== null && value.story !== undefined) {
    const s = value.story;
    if (typeof s.name !== 'string' || s.name.length > 120 || typeof s.audience !== 'string' || s.audience.length > 300 || ![15, 30, 60].includes(s.duration) || !Array.isArray(s.scenes) || s.scenes.length > 30)
      fail('Storyboard tidak valid.');
    for (const sc of s.scenes) {
      if (typeof sc.title !== 'string' || sc.title.length > 120 || typeof sc.visual !== 'string' || sc.visual.length > 6000 || typeof sc.script !== 'string' || sc.script.length > 6000 || !Number.isFinite(sc.duration) || sc.duration <= 0 || sc.duration > 60)
        fail('Adegan tidak valid.');
    }
  }
  return value;
}

export async function api(req, env) {
  try {
    const url = new URL(req.url),
      path = url.pathname,
      user = req.headers.get('oai-authenticated-user-id');
    if (!user) return json({ error: 'Silakan masuk ke studio privat.' }, 401);
    const owner = encodeURIComponent(user),
      base = 'users/' + owner + '/';
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.get('Origin') !== url.origin)
      return json({ error: 'Permintaan lintas situs ditolak.' }, 403);

    if (path === '/api/config' && req.method === 'GET') {
      const keyReady = !!env.GOOGLE_API_KEY;
      const models = Object.fromEntries(
        Object.entries(MODEL_MAP).map(([key, m]) => {
          const id = modelID(env, m.kind);
          return [
            key,
            {
              ...m,
              modelID: id,
              configured: validModel(id),
              maxCount: 1,
              supportsSeed: false
            }
          ];
        })
      );
      return json({
        provider: 'google',
        keyReady,
        providerReady: keyReady,
        storageReady: !!env.BUCKET,
        models,
        displayName: decodeName(req.headers) || 'Studio pribadi'
      });
    }

    if (!env.BUCKET) return json({ error: 'Penyimpanan server belum terhubung.' }, 503);
    const bucket = env.BUCKET;

    if (path === '/api/story/generate' && req.method === 'POST') {
      if (!env.GOOGLE_API_KEY)
        return json({ error: 'API key Google Studio belum terpasang di .env.', code: 'PROVIDER_NOT_CONFIGURED' }, 503);
      const data = await bodyJSON(req, 20000);
      const name = String(data.name || '').trim();
      const audience = String(data.audience || '').trim();
      const duration = Number(data.duration) || 30;
      if (!name) fail('Nama produk atau campaign wajib diisi.');

      const directorModel = env.GOOGLE_DIRECTOR_MODEL || 'gemini-3.5-flash';
      const prompt = `You are a film director and creative producer. Create a structured cinematic storyboard for video campaign:
Product/Campaign: "${name}"
Target Audience: "${audience || 'General public'}"
Total Duration: ${duration} seconds.

Respond ONLY with a valid JSON array of scenes (no markdown, pure JSON array) with this format:
[
  {
    "title": "Short scene title",
    "duration": number_of_seconds,
    "visual": "Detailed cinematic visual direction for video generator, camera movement, lighting, atmosphere",
    "script": "Voice-over, narration or dialogue lines"
  }
]
Total scene durations must sum up to approximately ${duration} seconds. Provide 3 to 5 scenes.`;

      try {
        let response = await fetch(`${GOOGLE_ORIGIN}/models/${directorModel}:generateContent?key=${env.GOOGLE_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(30000)
        });
        if (response.status === 404) {
          response = await fetch(`${GOOGLE_ORIGIN}/models/gemini-3-flash-preview:generateContent?key=${env.GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            signal: AbortSignal.timeout(30000)
          });
        }
        const out = await providerJSON(response);
        if (!response.ok || out.error) {
          return json(providerFailure(response.status, out), 422);
        }
        let rawText = out.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawText = rawText.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim();
        const scenes = JSON.parse(rawText);
        if (!Array.isArray(scenes) || !scenes.length) fail('Format adegan tidak valid.');
        return json({ scenes });
      } catch (e) {
        const span = Math.round(duration / 3);
        return json({
          scenes: [
            {
              title: 'Pembuka',
              duration: span,
              visual: `Cinematic close-up of ${name}, golden hour warm lighting, shallow depth of field.`,
              script: `Memperkenalkan ${name} untuk ${audience || 'kebutuhanmu'}.`
            },
            {
              title: 'Momen Inti',
              duration: span,
              visual: `Dynamic camera tracking showing ${name} in real-life scenario with vibrant atmosphere.`,
              script: `Dibuat untuk memberikan pengalaman terbaik setiap hari.`
            },
            {
              title: 'Penutup & Call to Action',
              duration: span,
              visual: `Hero shot of ${name} with clean background and elegant branding.`,
              script: `Mulai ceritamu bersama ${name} sekarang.`
            }
          ]
        });
      }
    }

    if (path === '/api/workspace') {
      const key = base + 'workspace.json';
      if (req.method === 'GET') {
        const w = await getJSON(bucket, key);
        return json({ workspace: w?.data || null, etag: w?.etag || null });
      }
      if (req.method === 'PUT') {
        const value = validateWorkspace(await bodyJSON(req));
        const etag = req.headers.get('If-Match');
        const object = await putJSON(bucket, key, value, {
          onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' }
        });
        if (!object) return json({ error: 'Workspace berubah di tab lain. Muat versi terbaru sebelum menyimpan.' }, 409);
        return json({ etag: object.etag });
      }
    }

    if (path === '/api/uploads' && req.method === 'POST') {
      const type = req.headers.get('Content-Type');
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) fail('Gunakan JPG, PNG, atau WebP.');
      const bytes = await req.arrayBuffer();
      if (bytes.byteLength > 10 * 1024 * 1024 || bytes.byteLength < 12)
        fail('Berkas maksimal 10 MB dan tidak boleh kosong.', 413);
      const b = new Uint8Array(bytes),
        valid =
          type === 'image/png'
            ? b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71
            : type === 'image/jpeg'
            ? b[0] === 255 && b[1] === 216
            : b[0] === 82 &&
              b[1] === 73 &&
              b[2] === 70 &&
              b[3] === 70 &&
              b[8] === 87 &&
              b[9] === 69 &&
              b[10] === 66 &&
              b[11] === 80;
      if (!valid) fail('Isi berkas tidak cocok dengan format gambar.');
      const id = crypto.randomUUID();
      await bucket.put(base + 'assets/' + id, bytes, { httpMetadata: { contentType: type } });
      return json({ id, url: '/api/assets/' + id, type, size: bytes.byteLength }, 201);
    }

    if (path.startsWith('/api/assets/') && req.method === 'GET') {
      const id = path.slice(12);
      if (!safeID(id)) fail('Aset tidak valid.');
      const asset = await bucket.get(base + 'assets/' + id);
      if (!asset) return json({ error: 'Aset tidak ditemukan.' }, 404);
      return new Response(asset.body, {
        headers: {
          'Content-Type': asset.httpMetadata.contentType,
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }

    if (path === '/api/jobs' && req.method === 'GET') {
      const objects = await bucket.list({ prefix: base + 'jobs/', limit: 200 });
      const jobs = await Promise.all(objects.objects.map(async o => (await getJSON(bucket, o.key))?.data));
      return json({ jobs: jobs.filter(Boolean).map(publicJob).sort((a, b) => b.created.localeCompare(a.created)) });
    }

    if (path === '/api/generate' && req.method === 'POST') {
      if (!env.GOOGLE_API_KEY)
        return json({ error: 'API key Google Studio belum terpasang di .env.', code: 'PROVIDER_NOT_CONFIGURED' }, 503);
      const data = await bodyJSON(req, 20000);
      const parsed = generationInput(data, env);
      const { model, input, references } = parsed;

      if (data.nodeID && !safeID(data.nodeID) || (data.projectID && !safeID(data.projectID)))
        fail('Tujuan node tidak valid.');
      const id = data.requestID;
      if (!safeID(id)) fail('ID permintaan tidak valid.');

      const jobKey = base + 'jobs/' + id;
      const prior = await getJSON(bucket, jobKey);
      if (prior) return json(publicJob(prior.data), prior.data.status === 'submitting' ? 202 : 200);

      const images = [];
      let refBytes = 0;
      for (const ref of references) {
        const asset = await bucket.get(base + 'assets/' + ref.id);
        if (!asset) fail('Referensi tidak ditemukan di pustaka milikmu.', 404);
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.httpMetadata?.contentType))
          fail('Referensi harus berupa gambar.');
        refBytes += asset.size;
        if (asset.size > 8 * 1024 * 1024 || refBytes > 16 * 1024 * 1024)
          fail('Total referensi maksimal 16 MB, 8 MB per gambar.', 413);
        images.push({
          type: asset.httpMetadata.contentType,
          base64: toBase64(new Uint8Array(await asset.arrayBuffer())),
          role: ref.role || 'style'
        });
      }

      const job = {
        id,
        provider: 'google',
        model: parsed.key,
        modelID: input.model,
        label: model.label,
        prompt: data.prompt.trim(),
        kind: model.kind,
        ratio: data.ratio,
        count: data.count,
        created: new Date().toISOString(),
        status: 'submitting',
        outputs: [],
        nodeID: data.nodeID || null,
        projectID: data.projectID || null
      };

      if (!await putJSON(bucket, jobKey, job, { onlyIf: { etagDoesNotMatch: '*' } }))
        return json({ error: 'Permintaan sedang dikirim. Periksa riwayat.' }, 409);

      try {
        if (model.kind === 'video') {
          const veoModel = input.model || 'veo-3.1-generate-preview';
          const dur = input.duration || 4;
          const ratio = ['16:9', '9:16', '1:1'].includes(data.ratio) ? data.ratio : '16:9';

          const reqPayload = {
            instances: [
              {
                prompt: data.prompt.trim()
              }
            ],
            parameters: {
              aspectRatio: ratio,
              durationSeconds: dur
            }
          };

          const response = await fetch(`${GOOGLE_ORIGIN}/models/${veoModel}:predictLongRunning?key=${env.GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqPayload),
            signal: AbortSignal.timeout(30000)
          });
          const out = await providerJSON(response);

          if (!response.ok || out.error) {
            Object.assign(job, providerFailure(response.status, out), { status: 'failed' });
          } else if (out.name) {
            job.providerID = out.name;
            job.status = 'queued';
          } else {
            job.status = 'failed';
            job.error = 'Respons dari Google Veo tidak memiliki nama antrean.';
          }
        } else {
          // Image generation via Google Image / Gemini Flash Image
          const imgModel = input.model || 'gemini-3.1-flash-image';
          const response = await fetch(`${GOOGLE_ORIGIN}/models/${imgModel}:generateContent?key=${env.GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `High quality cinematic image: ${data.prompt.trim()}` }] }]
            }),
            signal: AbortSignal.timeout(60000)
          });
          const out = await providerJSON(response);

          if (!response.ok || out.error) {
            Object.assign(job, providerFailure(response.status, out), { status: 'failed' });
          } else {
            const candidatePart = out.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (candidatePart?.inlineData?.data) {
              const mime = candidatePart.inlineData.mimeType || 'image/png';
              const bin = atob(candidatePart.inlineData.data);
              const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
              const outId = job.id + '-0';
              await bucket.put(base + 'assets/' + outId, bytes, { httpMetadata: { contentType: mime } });
              job.outputs = [{ id: outId, url: '/api/assets/' + outId, type: mime }];
              job.status = 'completed';
            } else {
              job.status = 'failed';
              job.error = out.candidates?.[0]?.content?.parts?.[0]?.text || 'Google Image tidak mengembalikan data gambar.';
            }
          }
        }
      } catch (e) {
        job.status = 'failed';
        job.code = e.code || 'SUBMISSION_FAILED';
        job.error = e.status ? e.message : 'Koneksi ke Google Flow terputus. Silakan coba lagi.';
      }

      await putJSON(bucket, jobKey, job);
      return json(publicJob(job), job.status === 'failed' ? 422 : job.status === 'completed' ? 200 : 202);
    }

    if (path.startsWith('/api/jobs/') && req.method === 'GET') {
      const id = path.slice(10);
      if (!safeID(id)) fail('ID pekerjaan tidak valid.');
      const key = base + 'jobs/' + id;
      const stored = await getJSON(bucket, key);
      if (!stored) return json({ error: 'Pekerjaan tidak ditemukan.' }, 404);

      const job = stored.data;
      if (job.provider === 'google' && job.kind === 'video' && ['queued', 'processing'].includes(job.status)) {
        if (job.providerID) {
          const response = await fetch(`${GOOGLE_ORIGIN}/${job.providerID}?key=${env.GOOGLE_API_KEY}`, {
            signal: AbortSignal.timeout(30000)
          });
          const op = await providerJSON(response);

          if (!response.ok || op.error) {
            const problem = providerFailure(response.status, op);
            Object.assign(job, problem, { status: 'failed' });
          } else if (op.done) {
            if (op.error) {
              job.status = 'failed';
              job.error = op.error.message || 'Pembuatan video gagal di Google Veo.';
            } else {
              const sample = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
              if (sample?.videoUri) {
                const vidRes = await fetch(sample.videoUri, { signal: AbortSignal.timeout(60000) });
                const bytes = await readLimited(vidRes, 60 * 1024 * 1024);
                const outId = job.id + '-0';
                await bucket.put(base + 'assets/' + outId, bytes, { httpMetadata: { contentType: 'video/mp4' } });
                job.outputs = [{ id: outId, url: '/api/assets/' + outId, type: 'video/mp4' }];
                job.status = 'completed';
              } else if (sample?.bytesBase64Encoded) {
                const bin = atob(sample.bytesBase64Encoded);
                const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
                const outId = job.id + '-0';
                await bucket.put(base + 'assets/' + outId, bytes, { httpMetadata: { contentType: 'video/mp4' } });
                job.outputs = [{ id: outId, url: '/api/assets/' + outId, type: 'video/mp4' }];
                job.status = 'completed';
              } else {
                job.status = 'failed';
                job.error = 'Video selesai tetapi hasil tidak dapat diunduh.';
              }
            }
          } else {
            job.status = 'processing';
          }
          await putJSON(bucket, key, job, { onlyIf: { etagMatches: stored.etag } });
        }
      }
      return json(publicJob(job));
    }

    return json({ error: 'Endpoint tidak ditemukan.' }, 404);
  } catch (e) {
    return json(
      { error: e.status ? e.message : 'Layanan belum dapat memproses permintaan. Coba lagi.', code: e.code || null },
      e.status || 500
    );
  }
}

function decodeName(headers) {
  let name = headers.get('oai-authenticated-user-full-name');
  if (headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try {
      name = decodeURIComponent(name);
    } catch {}
  }
  return name;
}
