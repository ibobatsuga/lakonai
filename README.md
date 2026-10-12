# Lakon AI

Lakon AI memiliki halaman Create (Generate / Canvas), studio canvas dengan toolbar floating, serta Assets dan Elements. Desain memakai logo LAKON milik pengguna, dark/light theme dan aksen orange. Workspace baru dimulai polos, tanpa contoh gambar atau hasil generasi dummy. Draft lama tetap dapat dibuka.

## Menjalankan
Node.js 22+; jalankan `npm start`, lalu buka http://localhost:3000. Tidak perlu npm install untuk menjalankan editor. Upload PNG/JPG/WebP ke pustaka, pilih frame, atur posisi/ukuran, tambahkan referensi, simpan brief, dan susun storyboard. Draft disimpan di IndexedDB pada perangkat; ekspor JSON untuk cadangan/pindah perangkat.

## Generasi BytePlus
Salin `.env.example` ke `.env`, isi ARK_API_KEY dan LAKON_USERNAME/LAKON_PASSWORD untuk melindungi backend. Konfigurasi ModelArk dan Free Tokens Only harus aktif. Backend Node memakai /api endpoint milik LAKON dan menyimpan hasil privat pada .data. Pada Site static, editor berfungsi tetapi generasi AI belum terhubung. Tidak ada hasil generasi palsu. Key yang sebelumnya diberikan pengguna ditolak provider; gunakan key ModelArk aktif.

Backend mendukung Seedream dan Seedance dengan referensi karakter, lokasi, properti dan gaya. Nama referensi dimasukkan ke brief melalui pemetaan peran. Tidak memakai endpoint, aset, logo atau kode milik platform referensi.

## Batas versi
Asisten adalah editor brief lokal, bukan model percakapan. Storyboard memutar urutan frame di browser; tidak mengekspor video yang dirender. Belum ada kolaborasi realtime. Workspace lokal tidak otomatis tersinkron antartab/perangkat. Batas 100 aset, 120 objek per canvas, 30 proyek, 8 referensi, 8 MB tiap unggahan.

## Validasi
`npm install` lalu `npm test` untuk uji data dan interaksi DOM. Pengujian DOM tidak mengukur layout atau akselerasi grafis. Sumber referensi dan matriks fitur ada di replica/.

## Connector

Klik atau tarik titik output kanan node ke input kiri. Pilih Solid atau Dashed melalui menu Connector (C mengaktifkan alat penghubung). Semua garis memakai orange dan mengikuti node saat dipindah atau diubah ukurannya. Klik garis/label untuk mengedit jenis, label, atau menghapus. Undo/redo dan workspace JSON menyertakan koneksi.

Solid (primary) adalah dependensi wajib: sumber yang sedang memproses, belum siap, atau gagal mengunci generasi tujuan. Target dijalankan manual setelah sumber siap; tidak ada antrean generasi otomatis. Backend standalone juga memeriksa pekerjaan terbaru sumber dalam proyek milik pengguna sebelum mengirim permintaan. Solid tidak boleh membentuk siklus. Urutan storyboard dapat dibuat dari dependensi solid.

Dashed (influence) membawa prompt/catatan atau referensi gambar yang siap secara opsional tanpa mengunci target. Arahan catatan dan gambar terhubung dikirim bersama prompt setelah konfirmasi. Semua jenis node bisa dihubungkan untuk perencanaan; input video, Camera Path, Motion Brush, dan kontrol bobot IP-Adapter belum didukung adapter generasi saat ini. Editor menolak input video generasi secara jelas, bukan mengabaikannya. Tidak ada renderer video/storyboard baru dalam fitur connector ini.

Situs static tetap membutuhkan backend BytePlus dan key valid untuk generasi nyata. Pemeriksaan generasi pada test connector memakai respons mock, bukan API live.

## Halaman & Navigasi

- `/home?createTab=chat`: Generate dengan AI Agent / AI Video / AI Image / AI Audio / AI Avatar. Image dan Video memakai adapter generasi yang ada. AI Agent menyimpan brief lokal; generasi percakapan, audio, dan avatar belum terhubung.
- `/home?createTab=canvas&type=video`: New canvas, template tanpa foto, dan command bar. `/cinematic`, `/product`, `/story` menyediakan arahan lokal, bukan panggilan model AI.
- `/ai-canvas?enter_from=create_new&from_page=canvas_homepage&document=ID`: toolbar floating, node kosong Image/Video, Text, Audio upload, Timeline, referensi, upload, Chats (composer floating), serta History sesi. 3D Director Console belum tersedia.
- `/asset`: Generations / Canvases, Images / Videos / Audio / Docs, filter sumber/tanggal, sort, Grid/List dan grup tanggal. Docs saat ini hanya tab kosong; belum ada impor dokumen.
- `/explore`, `/elements`: galeri komunitas kosong dan pustaka referensi milik pengguna.

Navigasi URL mendukung tombol Back/Forward. ID canvas tersimpan lokal pada perangkat; tautan bukan sarana berbagi lintas akun/perangkat. Unggah gambar, MP4, MP3, WAV, OGG maksimal 8 MB per berkas. Audio dapat diputar pada node, bukan dihasilkan AI. Sidebar dapat disembunyikan/dibuka; logo memakai lebar 75% sidebar. Riwayat prompt baru disimpan lokal.

Saldo/estimasi kredit ditampilkan sebagai `—` ketika belum terhubung. Upgrade tidak melakukan transaksi. Profile menampilkan preferensi workspace lokal, bukan autentikasi akun multiuser. Hasil asli dan unggahan yang tersedia mengisi Assets; tidak ada gambar contoh baru atau feed komunitas palsu.

## Penyempurnaan Visual
Logo sidebar dikurangi menjadi 75% ukuran sebelumnya (56,25% lebar sidebar). Sidebar collapsed tetap menjadi rail ikon 72px dengan tooltip dan label aksesibel; mode ini tersimpan pada perangkat. Poppins normal 400/500/600/700 dan italic 500/600 dibundel lokal, dengan lisensi OFL di assets. Panel memakai transparansi sekitar 82–84%, backdrop blur 18px, border halus, serta fallback solid untuk browser tanpa backdrop-filter. Judul/menu menggunakan Title Case; deskripsi/prompt menggunakan sentence case. Teks prompt, judul proyek dan nama berkas yang ditulis pengguna dipertahankan.

Light theme memakai kebalikan palet latar/panel/teks dark theme; media tetap dalam warna aslinya dan orange tetap menjadi aksen. Variabel glass dihitung pada body bertema agar tidak mewarisi fill dark yang sudah dihitung pada root. Sambungan tab/prompt dan garis panel menggunakan border6% serta radius28px. Seluruh ikon toolbar kanan atas memakai SVG22px, viewBox24, stroke1.7 dan tombol36px (20/30px pada layar kecil).

Referensi visual terbaru diterapkan sebagai palet hitam netral/charcoal, glow orange tipis dan panel dengan kedalaman lembut. Poppins tetap untuk teks utama. Hanya frasa “Imajinasimu” pada judul Buat memakai Playfair Display 500 Italic yang dibundel lokal beserta OFL; ini pendekatan bentuk serif italic tebal pada contoh, bukan klaim identifikasi font asli.

Composer sekarang memakai satu wrapper dan satu outline luar: bar tab AI dan area prompt menempel tanpa sudut melengkung di sambungan. Radius hanya pada sudut luar wrapper. Reference memakai kotak tegak simetris dengan ikon plus SVG, label terpusat dan border lembut.

Light mode mempertahankan putih yang disetujui (#efefec / #e5e5df / #dcdcd5). Aksen utama kedua tema memakai orange #f28a44, bukan cokelat. Tombol orange memakai teks gelap; garis connector/fokus memakai orange jenuh #c24c00 di mode terang. Label kecil memakai teks netral agar terbaca.

Foto contoh visual-03 sampai visual-08 dihapus dari paket aplikasi. Saat draft lama dimuat atau diimpor, entri foto contoh dibersihkan dari Assets, referensi dan timeline. Node gambarnya menjadi draft kosong dengan posisi serta connector tetap tersimpan. Foto unggahan/hasil generasi pengguna tetap tersedia; menu dan fitur Assets dipertahankan.

Label yang disepakati: Create → Kreasi, Explore → Jelajah, Assets → Aset, Elements → Elemen, Generate → Buat, Canvas/Canvases → Kanvas, Past Creations → Karya. Label lain tetap seperti sebelumnya.

Judul Buat menjadi “Wujudkan Imajinasimu Tanpa Batas.” Poppins 300 dipakai untuk bagian sans serif; Imajinasimu memakai Playfair Display 500 Italic. Kedua weight dibundel lokal dengan lisensi font yang sudah tersedia.

Skala UI desktop (lebar >760px) menjadi 80%: ukuran sidebar/logo, teks, panel, ikon, padding, gap, radius dan bayangan mengecil proporsional, dengan layout tetap memenuhi viewport. Aturan breakpoint serta tampilan mobile tetap memakai ukuran semula. Koordinat pointer dan ukuran media di kanvas tidak diubah; skala UI tidak mengubah zoom dokumen.

Pas Foto copy.png dibersihkan berdasarkan nama dari pustaka bersama ketika draft dimuat atau diimpor. Karena Aset dan Elemen memakai pustaka yang sama, foto hilang dari kedua halaman dan pemilih referensi. Node yang memakai foto menjadi draft kosong; foto lain tidak ikut dihapus.
