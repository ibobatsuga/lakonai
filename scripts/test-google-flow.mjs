#!/usr/bin/env node
import {loadEnvFile} from 'node:process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  loadEnvFile(resolve(root, '.env'));
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error('❌ File .env tidak ditemukan di direktori root.');
    process.exit(1);
  }
  throw e;
}

const apiKey = process.env.GOOGLE_API_KEY;
const directorModel = process.env.GOOGLE_DIRECTOR_MODEL || 'gemini-3.5-flash';
const videoModel = process.env.GOOGLE_VIDEO_MODEL || 'veo-3.1-generate-preview';
const origin = 'https://generativelanguage.googleapis.com/v1beta';

console.log('=== PENGUJIAN KONEKTIVITAS GOOGLE FLOW (LAKON AI) ===');
console.log(`Endpoint:        ${origin}`);
console.log(`Director Model:  ${directorModel}`);
console.log(`Video Model:     ${videoModel}`);
console.log(`API Key:         ${apiKey ? apiKey.slice(0, 6) + '...' + apiKey.slice(-4) : '(KOSONG)'}`);
console.log('----------------------------------------------------');

if (!apiKey) {
  console.error('❌ GOOGLE_API_KEY belum diisi pada .env.');
  console.log('Dapatkan API Key di Google AI Studio: https://aistudio.google.com/');
  process.exit(1);
}

async function run() {
  console.log(`\n[1/2] Menguji AI Storyboard Director (${directorModel})...`);
  try {
    const res = await fetch(`${origin}/models/${directorModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Halo Google Flow, jawab satu kata: SIAP' }] }]
      })
    });
    const data = await res.json();
    if (res.ok && data.candidates) {
      console.log('✅ Google Gemini Director AKTIF & SIAP:', data.candidates[0].content.parts[0].text.trim());
    } else {
      console.log('⚠️ Status Gemini:', res.status, data.error?.message || JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Gagal menghubungi Gemini:', err.message);
  }

  console.log(`\n[2/2] Menguji Endpoint Google Veo Video (${videoModel})...`);
  try {
    const res = await fetch(`${origin}/models/${videoModel}:predictLongRunning?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: 'A cinematic morning light' }],
        parameters: { aspectRatio: '16:9', durationSeconds: 4 }
      })
    });
    const data = await res.json();
    if (res.ok) {
      console.log('✅ Google Veo Video endpoint TERHUBUNG:', data.name || 'OK');
    } else if (res.status === 429) {
      console.log('ℹ️ Google Veo status 429: Kuota video preview Google AI Studio membutuhkan penautan billing di project Google Cloud.');
    } else {
      console.log(`⚠️ Status Veo (${res.status}):`, data.error?.message || JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Gagal menghubungi Veo:', err.message);
  }

  console.log('\n====================================================');
  console.log('Pengujian Google Flow selesai.');
}

run();
