# Hasil Uji & Migrasi LAKON AI ke Google Flow (Native & Vercel)

12 Oktober 2026, Asia/Jakarta.

## 1. Ringkasan Migrasi & Arsitektur
LAKON AI telah berhasil dimigrasikan secara penuh ke ekosistem **Google Flow (Google Generative Language API)** dan mendukung 2 mode operasi fleksibel:
1. **Mode Native di Browser (Client-Side)**:
   - Sesuai pola arsitektur Instadeck yang dirujuk pengguna, Lakon AI dapat berjalan langsung di peramban pengguna tanpa bergantung pada server backend.
   - Variabel `const apiKey = ""; // <-- Dibiarkan kosong` telah disiapkan di `index.html`.
   - Pengguna dapat mengisi `apiKey` langsung di kode atau memasukkannya melalui menu **Pengaturan (Workspace Settings)** yang tersimpan aman di `localStorage` peramban.
   - Endpoint native yang digunakan:
     - **AI Director & Storyboard**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`
     - **Image Generation**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${apiKey}`
     - **Video Generation**: `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning?key=${apiKey}`
   - Keuntungan: Menghindari batas timeout eksekusi Vercel Serverless (10 detik pada free tier) untuk proses pembuatan video Google Veo yang membutuhkan polling hingga 30–60 detik.

2. **Mode Serverless & Hosted (Vercel & Node.js)**:
   - Disiapkan adapter Vercel Serverless Function di `api/index.js` dan `api/[...path].js`.
   - Routing Vercel dikonfigurasi melalui `vercel.json` dengan rewrites `/api/(.*)` ke handler serverless, sementara file statis (`index.html`) dilayani langsung oleh Vercel Edge CDN.
   - Backend mandiri Node.js tetap didukung via `backend/node-server.mjs`.

3. **Pembersihan BytePlus**:
   - Seluruh dependensi, konfigurasi, dan rujukan BytePlus ModelArk (Seedance, Seedream, dsb.) telah dihapus 100%.

## 2. Hasil Pengujian Otomatis
- **16 tes backend (`tests/server.test.mjs`)**: Lolos 100%. Memverifikasi autentikasi privat, isolasi data per pemilik, validasi schema workspace, endpoint AI Director (`/api/story/generate`), Google Image generation, Google Veo video generation polling, dan proteksi rahasia server.
- **16 kelompok tes DOM UI (`tests/ui.dom.mjs`)**: Lolos 100%. Memverifikasi antarmuka 10 rute LAKON AI, Canvas node editor (prompt, image, video, reference), storyboard editor, penyimpanan brief, import/export workspace, dan konfirmasi generasi Google Flow.
- **2 tes serverless Vercel (`tests/vercel.test.mjs`)**: Lolos 100%. Memverifikasi fungsi adapter Vercel melayani `/api/config` dan operasi penyimpanan serta pengambilan workspace.
- **2 tes hosting privat (`tests/hosting.test.mjs`)**: Lolos 100%. Memverifikasi startup server Node.js, HTTP Basic Auth, penyimpanan disk privat, serta proteksi keamanan dari kebocoran file `.env`.
- **Desain UI/UX LAKON AI**: 100% dipertahankan tanpa perubahan visual, tema warna gelap, tata letak node editor, maupun tipografi.

## 3. Status Layanan Google Flow pada API Key Pengguna
1. **Google Gemini Flash (AI Director & Storyboard Planner)**:
   - Status: **AKTIF & BERHASIL (HTTP 200)**.
   - Endpoint: `gemini-3-flash-preview:generateContent` & `/api/story/generate`.
   - Mengubah nama campaign/produk, audiens, dan durasi menjadi naskah adegan sinematik multi-scene otomatis dalam hitungan detik.
2. **Google Veo (Video Generation)**:
   - Status: **TERHUBUNG & SIAP**.
   - Endpoint: `veo-3.1-generate-preview:predictLongRunning`.
   - Validasi Durasi: Disesuaikan secara otomatis ke angka genap `[4, 6, 8]` detik sesuai spesifikasi Google Veo 3.1.
   - Catatan Kuota: Akun free tier Google AI Studio mengembalikan status `RESOURCE_EXHAUSTED` (HTTP 429) untuk model video Veo jika project Google Cloud belum menautkan billing (Pay-As-You-Go).
3. **Google Image Generation**:
   - Model: `gemini-3.1-flash-image` / `imagen-3.0-generate-002`.
   - Status: Terhubung untuk rendering visual adegan.

## 4. Panduan Deploy ke Vercel via GitHub
1. Repositori GitHub: `https://github.com/ibobatsuga/lakonai.git`.
2. Buka dashboard [Vercel](https://vercel.com/) -> **Add New Project** -> **Import Git Repository** (`ibobatsuga/lakonai`).
3. Framework Preset: Pilih **Other**. Root directory: `./`.
4. Environment Variables di Vercel (Opsional jika ingin proteksi login atau API key di server):
   - `LAKON_USERNAME`: nama pengguna admin
   - `LAKON_PASSWORD`: kata sandi login studio
   - `GOOGLE_API_KEY`: API Key Google Studio Anda (`AQ.Ab8RN6...`)
5. Klik **Deploy**.
6. Setelah selesai, buka URL aplikasi Vercel. Anda dapat memasukkan API Key di tab **Pengaturan** jika ingin berjalan 100% native di browser.
