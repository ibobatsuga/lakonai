# LAKON AI

Frontend LAKON dan backend BytePlus untuk hosting Node.js. File `.env` disertakan sesuai instruksi pemilik, berisi API key BytePlus dan akun login studio. Variabel runtime hosting tetap dapat menggantikan konfigurasi tersebut.

## Langsung jalankan

Memerlukan hosting dengan **Node.js 22 atau lebih baru**. Backend tidak memerlukan instalasi npm untuk berjalan.

1. Clone repository ke direktori aplikasi privat, di luar folder file publik statis. File `.env` sudah disertakan. Perbarui `ARK_API_KEY` dengan key ModelArk yang aktif jika provider menolak autentikasi.
2. Jalankan `npm start`, atau `sh start.sh`. Di Windows, jalankan `start.bat`.
3. Buka `http://localhost:3000`. Username dan password studio ada pada `LAKON_USERNAME` / `LAKON_PASSWORD` di `.env`.

Untuk panel hosting Node.js, pilih startup file `backend/node-server.mjs`. Backend membaca `.env` otomatis. Variabel runtime pada hosting mengalahkan nilai di `.env`.

Untuk domain melalui HTTPS/reverse proxy, isi `APP_ORIGIN=https://domain-kamu.com` pada konfigurasi backend dan arahkan domain ke aplikasi Node.js. `PORT` mengikuti port yang disediakan hosting. `HOST=127.0.0.1` cocok untuk reverse proxy pada mesin yang sama; gunakan nilai sesuai pengaturan hosting jika aplikasi berjalan di container.

Hosting yang hanya menyediakan upload HTML/PHP atau GitHub Pages tidak menjalankan backend Node.js ini. `index.html` yang dibuka langsung tetap menampilkan desain, tetapi generasi memerlukan server yang berjalan.

## Isi paket

- `index.html`: antarmuka LAKON lengkap; logo dan galeri tetap tertanam agar tampilan tidak kehilangan aset.
- `assets/`: salinan seluruh gambar tertanam, termasuk logo dan gambar kartu, beserta manifest.
- `backend/server.js`: API BytePlus, validasi referensi, riwayat dan hasil generasi.
- `backend/node-server.mjs`: server hosting dengan login dan penyimpanan file privat.
- `backend/storage.mjs`: penyimpanan privat pada `.data/`, dengan pemeriksaan versi dan penulisan atomik.
- `npm run build`: menghasilkan alternatif Cloudflare Worker di `backend/index.js` dan `dist/server/index.js`; memerlukan R2 `BUCKET` dan identitas Sites. Untuk hosting Node.js, gunakan startup file Node di atas.
- `.env`: konfigurasi backend dan login studio, disertakan atas permintaan pemilik. File ini hanya dibaca server dan ditolak jika diakses melalui HTTP.
- `.env.example`: contoh konfigurasi tanpa secret.
- `tests/`: pengujian backend, server hosting, dan interaksi antarmuka.

## BytePlus

Model gambar: `dola-seedream-5-0-flash-260915` (satu gambar per permintaan). Model video: `dreamina-seedance-2-5-260628` (UI membatasi durasi 4–15 detik, default 480p). Referensi karakter, lokasi dan properti didukung. Hasil disimpan privat pada `.data/` dan dapat dibuka melalui endpoint milik pengguna.

`ARK_FREE_ONLY_CONFIRMED=true` merekam konfirmasi pemilik; nilai contoh default adalah `false`. Free Tokens Only tetap harus aktif di akun BytePlus. Saat `SetLimitExceeded`, backend menghentikan generasi; tidak ada penggantian model atau fallback berbayar otomatis.

Server memerlukan akses HTTPS keluar menuju API resmi BytePlus Singapore dan host media BytePlus. API key yang terpasang tidak menjamin aktivasi model atau tersedianya kuota gratis pada akun; hasil uji nyata dicatat di `HASIL-UJI.md`.

## Pengujian

`npm test` menjalankan pengujian API dan server hosting. `npm run test:ui` memerlukan `npm install` untuk dependensi pengujian DOM. Dependensi ini tidak diperlukan oleh backend saat menjalankan aplikasi.

Jangan jalankan beberapa proses Node secara bersamaan pada direktori `.data` yang sama; adapter penyimpanan ini ditujukan untuk satu proses aplikasi. Gunakan penyimpanan terpisah yang mendukung transaksi jika nantinya melakukan scaling.
