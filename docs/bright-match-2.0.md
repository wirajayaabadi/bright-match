# Bright Match 2.0: penilaian, arah, dan serah terima

Dokumen kerja untuk pengembang. Disusun 16 November 2026 dari pemeriksaan kode dan basis data yang berjalan,
mengikuti `../master-prompt.txt`. Angka di sini diukur dari data yang dimuat (Brightspace per 14 November 2026,
file NFR Master Lahan per 2 November 2026), bukan perkiraan.

Isi: (1) keadaan sekarang, (2) arsitektur sasaran, (3) celah fitur, (4) backlog berprioritas, (5) perubahan
basis data, (6) rencana UI/UX, (7) urutan pengerjaan, lalu serah terima irisan pertama.

## 1. Keadaan sekarang

**Tumpukan.** Next.js 16.4 (App Router, Cache Components, Partial Prerendering), React 19, TypeScript, Tailwind 4,
Supabase (Postgres + Auth lewat `@supabase/ssr`), Leaflet, Cloudflare R2 untuk foto. Monolit modular: satu aplikasi,
logika bisnis di fungsi basis data (RPC), satu panggilan per halaman. Tumpukan ini sesuai rekomendasi master prompt
dan dipertahankan.

**Modul yang benar-benar berfungsi** (diperiksa alurnya, bukan hanya halamannya):

| Modul | Rute | Catatan |
| --- | --- | --- |
| Peta peluang | `/peluang` | Lahan kosong dan potensi sewa per provinsi dan kota. |
| Profil lokasi | `/lokasi`, `/lokasi/[id]` | Lahan, tenant, foto, peta 1 km, tipe lokasi, bauran usaha. |
| Profil tenant | `/tenant`, `/tenant/[id]` | Diturunkan dari kontrak; foto lahan yang disewa. |
| Mesin kecocokan | `/kecocokan/...` | Syarat wajib lalu skor 0 sampai 100 dengan alasan (versi 2, enam komponen). |
| Playbook | `/playbook` | Enam jenis usaha; naratif dari survei 73 responden. |
| Kartu penawaran | `/penawaran/[id]` | Indonesia dan Inggris, cetak ke PDF. |
| Pipeline | `/pipeline/...` | Calon tenant, peluang, 14 persyaratan tiga pihak, riwayat. |
| Formulir publik | `/daftar` | Tanpa login; rem 30 pendaftaran per jam. |

**Temuan keamanan** (sebelum irisan pertama; semuanya sudah ditutup, lihat bagian serah terima):

1. Semua pengguna yang masuk boleh membaca dan mengubah semuanya. Tidak ada organisasi maupun peran.
2. Empat tabel alur komersial bisa ditulis langsung lewat API dengan kunci publik. Aturan "kontrak butuh 14
   persyaratan" hanya ada di fungsi, jadi bisa dilewati dengan `update peluang set tahap = 'kontrak'`.
3. Nama pelaku (`p_oleh`) dikirim klien, jadi bisa dipalsukan.
4. Riwayat peluang bisa diubah dan dihapus. Tidak ada jejak audit.
5. Tahap bisa dilompati ke mana saja.
6. Bila pendaftaran mandiri Supabase tidak dimatikan, siapa pun yang mendaftar bisa membaca nilai kontrak.

**Temuan integritas data** (dari data yang dimuat):

| Temuan | Jumlah | Tingkat |
| --- | --- | --- |
| Kode lahan dipakai ganda, ada lahan kosong di kelompoknya | 209 kode | Kritis |
| Kosong di Brightspace, kontrak masih berjalan di file master | 357 lahan | Kritis |
| Kode lahan dipakai ganda, semua tersewa | 537 kode | Sedang |
| Tersewa di Brightspace, kontrak tidak ada di file master | 411 lahan | Sedang |
| Luas lahan kosong nol atau kosong | 163 lahan | Sedang |
| Harga lahan kosong di luar rentang wajar | 51 lahan | Sedang |
| SPBU tanpa koordinat | 32 SPBU | Sedang |
| Lahan muncul dua kali | 4 lahan | Sedang |
| Tersewa, kontrak sudah lewat tanggal | 7.253 lahan | Rendah |
| SPBU tanpa nama kota | 3 SPBU | Rendah |

Akibatnya **655 dari 5.916 lahan kosong (11%) belum layak ditawarkan resmi**. Akar masalah terbesar: kontrak di
file master ditautkan lewat kode lahan, sedangkan 746 kode dipakai oleh 2.423 lahan. Satu kontrak lalu menempel ke
semua lahan berkode sama. Itu sebabnya logo outlet sering tidak cocok dengan nama tenant.

Kasus uji di master prompt (SPBU 3415138, lahan 3415138-IN-006) adalah contoh nyata: kode itu dipakai 10 lahan
(9 tersewa, 1 kosong 32 m², 6.600 W, Rp 67,6 juta per tahun), dan lahan kosongnya membawa kontrak PT Bank Panin
sampai 28 Desember 2028. Di basis data sudah ada peluang PT Smart Energy Systems untuk lahan itu di tahap kontrak,
dibuat sebelum aturan baru. Peluang itu tidak diubah; halamannya kini menampilkan peringatan.

**Utang teknis.** Belum ada uji otomatis sebelum irisan ini. Skor kecocokan dihitung saat halaman dibuka dan hanya
angkanya yang disimpan di peluang (tanpa versi model dan potret data). Tanggal sumber data ditulis tangan. Rangka
pemuatan belum mengikuti bentuk halaman. Menu di ponsel berupa deretan gulir, bukan menu.

## 2. Arsitektur sasaran

Satu aplikasi, tiga ruang kerja, satu basis data. Tidak ada layanan mikro.

```
Peramban
  └─ Next.js (Vercel)
       ├─ proxy.ts            sesi + arah ruang kerja dari klaim token (hanya navigasi)
       ├─ (app)/...           Command Center NFR        desktop-first
       ├─ (tenant)/...        Portal Investasi Tenant   responsif         fase 4
       ├─ (dealer)/...        Portal Aset Dealer        mobile-first      fase 4
       ├─ aksi*.ts            server action: satu aksi = satu fungsi basis data
       └─ foto/[...kunci]     foto dari R2
Supabase Postgres
  ├─ RLS per organisasi dan peran            penjaga data yang sebenarnya
  ├─ fungsi SECURITY DEFINER untuk penulisan  aturan tahap, persetujuan, audit
  ├─ audit_peristiwa                          hanya bertambah
  └─ tabel data sumber (spbu, lahan)          dimuat ulang; keputusan manusia disimpan terpisah
```

Prinsip yang dipegang:

- **Aturan di basis data.** Klien tidak dipercaya. Tabel alur komersial hanya bisa ditulis lewat fungsi yang
  memeriksa peran, dan pelaku selalu diambil dari sesi.
- **Data sumber tidak ditimpa.** Brightspace dan file master dimuat apa adanya. Koreksi manusia hidup di tabel
  keputusan (`masalah_data`, kelak `status_lahan`) yang tidak ikut terhapus saat data dimuat ulang.
- **Tiga status lahan terpisah** (ketersediaan fisik, verifikasi data, kesiapan), tidak digabung jadi satu.
- **Skor kecocokan bukan peluang berhasil.** Keyakinan data ditampilkan sebagai indikator tersendiri.
- **Supabase Free.** Satu klien per permintaan, pooler sesi untuk skrip, pekerjaan berat (lingkungan, deteksi,
  foto) di luar permintaan halaman.

## 3. Celah fitur terhadap cetak biru

| Area cetak biru | Sekarang | Celah |
| --- | --- | --- |
| Pusat validasi data | **Ada** (irisan 1): deteksi, tinjau, putuskan, riwayat | Impor berkas dengan pemetaan kolom; penugasan ke orang lain; tanggal sumber otomatis |
| Validasi lahan (3 status) | **Ada** (irisan 2): status ruang, data, dan kesiapan terpisah; inspeksi lokasi dengan foto; tinjauan orang lain | Inspeksi oleh dealer dari portalnya; penolakan data; pengingat inspeksi ulang |
| Model wewenang (COCO/DODO) | **Ada** (irisan 5): wewenang per SPBU, diisi lalu dipastikan orang lain; syarat terbit penawaran | Datanya masih kosong: harus diisi per SPBU. Wewenang per ruang (bila berbeda dari SPBU-nya); unggah dokumen |
| Alur 12 tahap + hasil alternatif | **Ada** (irisan 3): 12 tahap, 5 hasil akhir, syarat masuk per tahap, pemilik, tindakan berikut, tenggat | Dokumen per peluang sudah ada (irisan 11), tetapi belum ada daftar dokumen wajib per tahap; pengingat tenggat |
| Mesin persetujuan | **Ada** (irisan 3): 4 pihak, terikat versi, gugur bila versi diganti | Keputusan langsung oleh tenant, dealer, dan HSSE dari akunnya sendiri (sekarang dicatat NFR atas nama) |
| Versi penawaran | **Ada** (irisan 3): syarat komersial per versi, penerima sewa wajib dipastikan | Kartu penawaran cetak belum membaca versi; lampiran dokumen |
| Portal tenant | **Ada sebagian** (irisan 4): kotak penawaran, rincian penawaran, berminat/minta survei/tanya/tolak, persetujuan oleh admin tenant; studio kelayakan (irisan 7); banding sampai tiga lokasi (irisan 8); jadwal survei (irisan 9); dokumen (irisan 11); penjelajah lokasi (irisan 12) | Saringan tarif dan fasilitas di penjelajah, outlet saya |
| Portal dealer | **Ada sebagian** (irisan 5): SPBU dan ruang usaha, konfirmasi ketersediaan, inspeksi dengan foto, kartu keputusan sesuai wewenang; jadwal survei (irisan 10) | Rekomendasi jenis usaha, manfaat komersial terhitung, kemitraan aktif dan masalah operasional |
| Studio kelayakan | **Ada** (irisan 7): empat model rumus (ritel, EV, ATM, umum), tiga skenario terhitung, titik impas, balik modal, NPV, IRR, simpan versi bernama, 14 uji rumus | Banding dua versi tersimpan berdampingan, ekspor, kenaikan sewa atau biaya per tahun |
| Pemantauan kinerja | Tidak ada | Butuh data aktual yang sah; tanpa itu tidak ditampilkan |
| Dasbor eksekutif | **Ada** (irisan 6): lima angka, corong tujuh langkah, empat nilai uang yang dipisah, daftar perlu perhatian | Nilai terealisasi (belum ada sumber data pembayaran); tren antar waktu |
| Mesin kecocokan 3 lapis | Lapis 1 dan 2 ada; **potret skor per peluang dan indikator keyakinan data ada** (irisan 4) | Lapis 3 (keputusan manusia atas rekomendasi); evaluasi skor terhadap hasil nyata |
| Peran dan organisasi | **Ada**: 8 peran, RLS NFR, kelola organisasi dan anggota dari `/organisasi`, cakupan per peluang untuk tenant | Cakupan per SPBU untuk dealer; membuat akun dari aplikasi (sekarang di dasbor Supabase) |
| Jejak audit | **Ada** (irisan 1) | Halaman laporan dan riwayat audit |
| Analitik produk | Tidak ada | Sebagian peristiwa sudah tercatat di audit; KPI produk belum |
| Uji otomatis | **Ada** untuk basis data | Uji rumus keuangan, uji ujung ke ujung tiga perjalanan |

## 4. Backlog berprioritas

**P0, kepercayaan data dan alur komersial**

1. ~~Organisasi, peran, RLS, jejak audit.~~ Selesai.
2. ~~Pusat validasi data: deteksi, antrean, keputusan, penahanan penawaran.~~ Selesai.
3. ~~Tahap peluang dijaga di basis data.~~ Selesai.
4. ~~Tiga status lahan dan pemeriksaan kesiapan (daftar periksa ponsel, foto bukti).~~ Selesai.
5. ~~Model wewenang: tabel hak atas lahan; isi dimulai dari data yang bisa didapat (COCO/DODO belum ada di sumber).~~ Selesai (per SPBU).
6. ~~Alur 12 tahap dengan hasil alternatif, pemilik, tindakan berikut, dan tenggat.~~ Selesai.
7. ~~Penawaran berversi dan mesin persetujuan yang terikat versi.~~ Selesai.
8. ~~Potret skor: versi model, data, dan alasan disimpan saat peluang dibuat.~~ Selesai.

**P1, pengalaman tenant dan dealer**

9. ~~Portal tenant: kotak penawaran, rincian penawaran, tiga tindakan.~~ Selesai (tahap pertama).
10. ~~Portal dealer: aset, kesiapan, kartu keputusan.~~ Selesai (tahap pertama).
11. Banding tiga lokasi.

**P2, kelayakan dan kinerja**

12. Studio kelayakan dengan uji rumus. **Selesai (irisan 7).**
13. Pemantauan kinerja (hanya bila data aktual tersedia) dan evaluasi rekomendasi.

**Lintas fase.** Dasbor eksekutif, impor berkas, halaman audit, analitik produk, uji ujung ke ujung, rangka
pemuatan yang mengikuti bentuk halaman, menu ponsel.

## 5. Perubahan basis data

Penamaan tabel tetap bahasa Indonesia agar konsisten dengan skema yang ada. Padanan dengan entitas cetak biru:

| Cetak biru | Tabel | Status |
| --- | --- | --- |
| organizations, organization_memberships | `organisasi`, `keanggotaan` | Ada |
| users | `auth.users` (Supabase) | Ada |
| stations, spaces | `spbu`, `lahan` | Ada (data sumber) |
| data_sources | `sumber_data` | Ada |
| data_quality_issues | `masalah_data` | Ada |
| audit_events | `audit_peristiwa` | Ada |
| opportunities, opportunity_events, requirements | `peluang`, `peluang_riwayat`, `peluang_syarat` | Ada, dikeraskan |
| tenants, tenant_requirements | `v_tenant_profil` (turunan), `calon_tenant` | Ada sebagian |
| tenancies | kolom kontrak di `lahan` | Perlu tabel sendiri berbasis waktu |
| space_rights | `hak_spbu` (per SPBU) | Ada |
| import_batches | `muatan_data` | Fase 2 |
| site_inspections | `inspeksi_lahan`, `inspeksi_foto` | Ada |
| (status per ruang) | `status_lahan`, view `v_status_lahan` | Ada |
| match_results | `hasil_kecocokan` | Ada |
| (tanggapan tenant) | `tanggapan_tenant` | Ada |
| offers, commercial_terms | `penawaran_versi` (syarat komersial disimpan di versinya) | Ada |
| approvals | `persetujuan` | Ada |
| contracts | `kontrak_peluang` (tanda tangan dan mulai beroperasi) | Ada |
| feasibility_scenarios | `skenario_kelayakan` | Fase 5 |
| performance_actuals | `kinerja_aktual` | Fase 6 |

Aturan migrasi: berkas baru di `supabase/migrations`, satu transaksi per berkas, tidak menghapus tabel atau baris
lama. Tabel keputusan tidak memakai foreign key ke `spbu` dan `lahan`, karena `db:seed` mengosongkan keduanya.

## 6. Rencana UI/UX

Profil ada di `.ux-profile.md`: acuan Stripe, WCAG AA, nada hangat dan membantu, ikon Lucide, enam pola terlarang.
Aturannya ada di `AGENTS.md`: sebut pola halaman sebelum menulis markup, buktikan di 375 dan 1280 piksel, jalankan
audit UX sebelum selesai.

- **Kerangka sadar peran.** Sudah: menu dan arah halaman mengikuti ruang kerja. Berikutnya: grup rute dan tata
  letak sendiri untuk tenant (responsif) dan dealer (ponsel dulu).
- **Palet.** Master prompt mengusulkan navy `#102940`, biru `#087DA8`, teal `#16A6A0`. Aplikasi sekarang memakai
  warna logo Pertamina. Belum diganti: perubahan token memengaruhi semua halaman dan sebaiknya diputuskan sekali,
  bersama tipografi (Plus Jakarta Sans untuk judul, Inter untuk isi).
- **Komponen.** Sudah ada: kepala halaman, kartu angka, tabel berbingkai, lencana, galeri foto, peringatan data,
  dialog keputusan, kendali tahap. Yang perlu dibuat: indikator keyakinan data, kartu keputusan persetujuan,
  garis waktu audit, grafik banding skenario.
- **Bahasa.** Istilah teknis diganti bahasa bisnis ("Melengkapi jenis usaha yang sudah ada").
- **Yang belum memenuhi profil.** Daftar lama (`/lokasi`, `/kecocokan`, `/tenant`) masih memakai deretan pilihan
  saringan, bukan satu kendali saringan. Rangka pemuatan generik. Menu ponsel berupa deretan gulir.

## 7. Urutan pengerjaan

| Fase | Isi | Keadaan |
| --- | --- | --- |
| 0 | Audit repositori dan dokumen ini | Selesai |
| 1 | Fondasi: peran, RLS, audit, kerangka sadar peran | Selesai, kecuali kelola anggota dari antarmuka |
| 2 | Kepercayaan data: pusat validasi, status lahan, inspeksi | Sebagian. Sisa: wewenang (COCO/DODO), keyakinan data, impor berkas |
| 3 | Alur komersial | Selesai untuk ruang kerja NFR, termasuk potret skor, jadwal survei, dan dokumen. Sisa: daftar dokumen wajib per tahap |
| 4 | Portal tenant dan dealer | Tahap pertama keduanya selesai |
| 5 | Studio kelayakan | Selesai untuk tenant, termasuk banding antar lokasi. Sisa: banding antar versi skenario |
| 6 | Pemantauan kinerja | Belum; bergantung pada data aktual |

## Serah terima irisan pertama (16 November 2026)

**Masalah pengguna.** Tim NFR tidak tahu lahan kosong mana yang datanya bisa dipercaya, dan alur peluang bisa
dilewati lewat API.

**Yang dibangun**

- `supabase/migrations/20261120000000_fondasi.sql`: organisasi dan 8 peran, RLS untuk 11 tabel lama, jejak audit
  yang tidak bisa diubah, pusat validasi data, dan enam fungsi alur yang kini memeriksa peran.
- `supabase/migrations/20261121000000_ruang_kerja.sql`: ruang kerja pengguna ikut di token masuk.
- `/validasi` dan `/validasi/[id]`: antrean temuan, bukti dari kedua sumber berdampingan dengan foto, dampak,
  langkah yang disarankan, keputusan beralasan, riwayat, peluang terkait.
- Peringatan di halaman lahan, kartu penawaran (ikut tercetak sebagai "draf internal"), dan peluang.
- Kendali tahap hanya menawarkan perpindahan yang sah, dengan kolom alasan.
- `/ruang-kerja` untuk akun tenant dan dealer; menu dan arah halaman mengikuti peran.

**Aturan yang kini dijaga basis data**

- Hanya anggota NFR yang membaca data. Auditor membaca saja.
- Peluang maju satu tahap; mundur, batal, dan buka kembali wajib beralasan.
- Tahap penawaran ke atas ditolak selama lahannya punya temuan kritis yang belum diputuskan.
- Tahap kontrak ditolak selama 14 persyaratan belum lengkap.
- Keputusan temuan wajib beralasan; bukti saat itu ikut tersimpan di jejak audit.
- Deteksi ulang tidak menimpa keputusan. Temuan dibuka kembali bila buktinya berubah.

**Cara memakai**

```bash
npm run db:schema     # pasang migrasi baru
npm run db:validasi   # cari ulang temuan (otomatis di akhir db:seed)
npm run db:test       # uji aturan akses dan alur; tidak meninggalkan data
```

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: 52 pernyataan lulus, mencakup isolasi tenant dan pengguna tanpa organisasi, auditor hanya
  membaca, penulisan langsung ke empat tabel ditolak, pelaku dari sesi, aturan tahap, penahanan penawaran, dan
  deteksi ulang. Uji yang sengaja dirusak terbukti gagal.
- `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Tampilan diperiksa dengan login sungguhan sebagai tiga akun uji, di 1280 dan 375 piksel, tanpa gulir mendatar.

**Akun uji.** Tiga akun bertanda `akun_uji`: analis NFR, admin tenant (organisasi uji), admin dealer (organisasi
uji). Email dan kata sandi ada di `.env.local` (`UJI_EMAIL_*`, `UJI_SANDI`). Hapus sebelum dipakai sungguhan:
hapus pengguna di Authentication dan dua organisasi bertanda `demo`.

**Keterbatasan yang perlu diketahui**

- Tiga pengguna lama otomatis menjadi admin NFR. Pengguna baru tidak melihat apa pun sampai diberi keanggotaan,
  dan itu masih harus lewat SQL (`insert into keanggotaan ...`).
- Klaim ruang kerja di token baru berubah setelah token diperbarui (paling lama satu jam) atau masuk ulang.
- Penugasan temuan baru bisa ke diri sendiri. Impor berkas belum ada: data masih dimuat lewat `db:seed`.
- Tanggal sumber di `sumber_data` ditulis di migrasi. Perbarui saat data dimuat ulang.
- Skor di peluang masih dikirim klien (dibatasi 0 sampai 100). Potret skor di sisi server ada di backlog nomor 8.
- 7.253 temuan "kontrak lewat tanggal" bertingkat rendah dan tidak menahan apa pun, tetapi membuat antrean panjang.
  Antrean diurutkan dari yang kritis.
- Uji ujung ke ujung otomatis belum ada. Tiga perjalanan emas di master prompt belum bisa diuji penuh karena
  portal tenant dan dealer belum dibangun.

**Tugas berikutnya yang disarankan.** Backlog nomor 4 (tiga status lahan dan pemeriksaan kesiapan), lalu nomor 6
dan 7 (alur 12 tahap, penawaran berversi, persetujuan). Portal tenant bergantung pada nomor 7.

## Serah terima irisan kedua (17 November 2026)

**Masalah pengguna.** Status "kosong" di Brightspace bukan jaminan lahan bisa ditawarkan: bisa sedang dipakai
sementara, ukurannya bisa salah, dan belum tentu siap dipakai. Sebelumnya tidak ada tempat mencatat hasil
pemeriksaan lapangan, dan tidak ada yang menahan penawaran atas lahan yang belum pernah diperiksa.

**Yang dibangun**

- `supabase/migrations/20261122000000_status_lahan.sql`: tabel `status_lahan`, `inspeksi_lahan`, `inspeksi_foto`,
  view `v_status_lahan`, dan fungsi penahanan, inspeksi, tinjauan, serta `lahan_boleh_ditawarkan`.
- **Tiga status terpisah** di kartu lahan dan halaman peluang:
  - Ketersediaan: tersedia, ditahan, tidak tersedia, terisi.
  - Verifikasi data: belum diverifikasi, terverifikasi, disengketakan, ditolak.
  - Kesiapan: belum diketahui, perlu inspeksi, siap, belum siap.
- **Inspeksi lokasi** (`/inspeksi/[id]`): daftar periksa satu kolom untuk ponsel, delapan butir wajib, pembanding
  nilai Brightspace di bawah tiap kolom, unggah foto yang dikecilkan di peramban, simpan draf, ajukan.
- **Tinjauan.** Admin atau penyetuju NFR, dan bukan pemeriksanya sendiri, menerima atau mengembalikan inspeksi.
  Baru setelah diterima lahan menjadi terverifikasi.
- **Kesiapan lahan** (`/inspeksi`): antrean inspeksi, yang menunggu tinjauan di urutan teratas, dan persentase
  lahan kosong yang sudah terverifikasi.
- Foto bukti disimpan di R2 (`inspeksi/<inspeksi>/<foto>.jpg`) dan hanya bisa dibuka anggota NFR yang masuk.

**Aturan baru yang dijaga basis data**

- Tahap penawaran ke atas mensyaratkan lahan **tersedia dan terverifikasi**. Sebelumnya cukup tanpa temuan kritis.
  Akibatnya, sampai inspeksi pertama diterima, belum ada lahan yang bisa masuk tahap penawaran. Ini disengaja dan
  mengikuti master prompt ("require verification before formal offer issuance").
- Inspeksi tidak bisa diajukan selama butir wajib belum lengkap atau fotonya kurang dari dua.
- Inspeksi di lahan dengan temuan kritis tidak bisa diterima sebelum temuannya diputuskan.
- **Verifikasi gugur sendiri** bila status, luas, daya, harga, periode, atau posisi lahan berubah di sumber.
- Menahan lahan wajib beralasan, dan hanya untuk lahan yang kosong menurut Brightspace.
- Tiga tabel baru tidak bisa ditulis langsung; semua lewat fungsi yang memeriksa peran.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: dua berkas uji lulus. Berkas baru `supabase/tests/status_lahan.sql` memeriksa tiga status
  awal, isolasi tenant, penahanan, penyaringan isi draf, butir wajib, larangan meninjau inspeksi sendiri, peran
  peninjau, penerimaan, syarat verifikasi untuk penawaran, dan gugurnya verifikasi saat sumber berubah.
- Alur diuji di peramban sebagai analis uji, di 375 dan 1280 piksel: kartu lahan, memulai inspeksi, pengajuan
  yang belum lengkap, pengisian, unggah dua foto, simpan draf, tampilan baca, daftar. Data uji dihapus sesudahnya.
- Uji peramban menemukan dua galat yang lolos dari uji basis data, keduanya sudah diperbaiki: rincian inspeksi
  menimpa kolom `status`, dan unggahan ke R2 ditolak karena tanpa `Content-Length`.

**Keterbatasan yang perlu diketahui**

- **Dialog tinjauan belum dilihat di peramban.** Akun uji yang ada hanya analis; pembuatan akun uji keempat
  (penyetuju) tidak dilakukan karena hanya tiga akun yang disetujui. Logikanya tercakup uji basis data.
- **Token R2 di server harus berizin tulis** (Object Read & Write), karena foto inspeksi diunggah lewat aplikasi.
  Saran sebelumnya untuk memakai token baca saja di Vercel tidak berlaku lagi.
- Temuan yang bergantung pada tanggal (kontrak lewat) berubah setiap hari. Jalankan `npm run db:validasi` secara
  berkala, atau jadwalkan.
- Foto HEIC yang tidak bisa dibaca peramban ditolak dengan pesan; belum ada konversi di server.
- Status data "ditolak" sudah ada di skema, tetapi belum ada tindakannya di antarmuka.
- Formulir tidak menyimpan otomatis. Isian hilang bila halaman ditutup sebelum "Simpan draf".
- **Next.js 16.4.4 punya celah keamanan tingkat sedang** (GHSA-mfr8-8qww-v76h: kebocoran informasi antar root
  params bila fungsi `use cache` dipanggil lewat `unstable_cache()`). Aplikasi ini tidak memakai `unstable_cache`,
  tetapi sebaiknya naik ke 16.4.6.

**Tugas berikutnya yang disarankan.** Backlog nomor 6 dan 7: alur 12 tahap dengan hasil alternatif, pemilik, dan
tenggat; penawaran berversi; persetujuan yang terikat versi. Setelah itu portal tenant.

## Serah terima irisan ketiga (17 November 2026)

**Masalah pengguna.** Enam tahap lama tidak membedakan "lahan terverifikasi", "minat dikonfirmasi", "semua pihak
setuju", "kontrak ditandatangani", dan "outlet beroperasi". Syarat komersial tidak tersimpan, jadi tidak jelas apa
yang sebenarnya disetujui, dan tidak ada pemilik maupun tenggat.

**Yang dibangun**

- `supabase/migrations/20261123000000_alur_komersial.sql`: 12 tahap dan 5 hasil akhir, kolom tindak lanjut,
  tabel `penawaran_versi`, `persetujuan`, `kontrak_peluang`, serta fungsi syarat masuk tahap, tindak lanjut,
  penawaran, persetujuan, tanda tangan, dan aktivasi.
- **Dua belas tahap:** dibuat, data terverifikasi, terpilih, dihubungi, minat dikonfirmasi, survei lokasi,
  penawaran, negosiasi, persetujuan, tanda tangan kontrak, persiapan dan aktivasi, pemantauan kinerja.
  Tahap lama tetap sah, jadi tiga peluang yang ada tidak diubah.
- **Hasil akhir:** tenant menolak, ditarik, ditolak, kalah, dibatalkan. Wajib beralasan dan bisa dibuka kembali.
- **Halaman peluang bertab** (`/pipeline/[id]`): Tahap, Penawaran, Persetujuan, Persyaratan, Riwayat.
  Tab Tahap menampilkan syarat masuk tahap berikutnya, mana yang terpenuhi dan mana yang belum.
- **Tindak lanjut:** pemilik (anggota NFR), tindakan berikut, tenggat. Daftar peluang menaruh yang tenggatnya
  lewat di urutan teratas.
- **Penawaran berversi:** sewa per tahun, lama sewa, masa bebas sewa, skema, bagi hasil, deposit, rencana mulai,
  penerima sewa. Menerbitkan versi baru menggantikan versi lama.
- **Persetujuan empat pihak** (NFR, pemilik SPBU, calon tenant, HSSE) atas versi yang berlaku: setuju, minta
  revisi, atau tolak.
- **Kontrak:** tanggal dan nomor tanda tangan, lalu tanggal mulai beroperasi, dicatat terpisah.

**Aturan baru yang dijaga basis data**

| Untuk masuk tahap | Syaratnya |
| --- | --- |
| Data terverifikasi, penawaran, negosiasi, persetujuan, kontrak | Lahan tersedia dan terverifikasi |
| Terpilih | Peluang punya pemilik |
| Minat dikonfirmasi | Catatan: siapa yang menyatakan minat dan lewat apa |
| Penawaran, negosiasi, persetujuan, kontrak | Ada versi penawaran yang diterbitkan |
| Tanda tangan kontrak | Keempat pihak menyetujui versi yang berlaku, dan 14 persyaratan terpenuhi |
| Persiapan dan aktivasi | Tanda tangan kontrak sudah dicatat |
| Pemantauan kinerja | Tanggal mulai beroperasi sudah dicatat |

- Penawaran tidak bisa diterbitkan sebelum **penerima sewa dipastikan**. Penerima sewa tidak pernah diandaikan.
- Versi yang sudah terbit tidak bisa diubah. Versi baru **menggugurkan semua persetujuan versi lama**; keputusan
  lama tetap tersimpan sebagai riwayat.
- Persetujuan NFR hanya dari admin atau penyetuju NFR, dan bukan penyusun versi itu. Analis tidak memegangnya.
- Persetujuan pihak di luar NFR dicatat tim NFR **atas nama**, wajib dengan keterangan siapa yang memutuskan dan
  rujukan bukti, dan ditandai demikian.
- Persetujuan yang sudah diputuskan tidak bisa diubah. Perubahan berarti versi baru.
- Tanda tangan kontrak dicatat admin atau penyetuju NFR, dan terikat pada versi yang berlaku.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: tiga berkas uji lulus. Berkas baru `supabase/tests/alur_komersial.sql` menjalankan satu
  peluang dari dibuat sampai pemantauan, termasuk versi 2 yang menggugurkan persetujuan versi 1, hasil akhir,
  buka kembali, dan isolasi tenant.
- `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Tampilan diperiksa di peramban di 1280 dan 375 piksel dengan satu peluang uji yang disisipkan langsung lewat SQL
  lalu dihapus, supaya jejak audit tidak tercemar. Penolakan server (bukti kosong) terlihat benar di dialog.

**Keterbatasan yang perlu diketahui**

- **Perpindahan tahap dan penyimpanan lewat tombol belum dijalankan di peramban**, karena setiap keberhasilan
  menulis jejak audit yang tidak bisa dihapus. Logikanya tercakup uji basis data; yang belum terbukti adalah
  sambungan tombol ke aksi untuk jalur berhasil. Jalur ditolak sudah terlihat bekerja.
- **Peluang PT Smart Energy Systems (tahap kontrak) dibuat sebelum aturan ini**, tanpa versi penawaran dan
  persetujuan. Peluang itu tidak bisa maju ke aktivasi. Untuk melanjutkannya, mundurkan ke tahap persetujuan,
  susun dan terbitkan versi penawaran, lalu minta persetujuannya.
- **Karena belum ada lahan yang terverifikasi, belum ada peluang yang bisa melewati tahap pertama.** Inspeksi
  lokasi yang diterima adalah pintu masuknya.
- Kartu penawaran cetak (`/penawaran/[id]`) masih menampilkan tarif Brightspace, belum membaca versi penawaran.
- Dokumen wajib per tahap belum ada unggahannya; 14 persyaratan masih berupa daftar centang.
- Skor di peluang masih dikirim klien. Potret skor di sisi server ada di backlog nomor 8.
- Tidak ada pengingat tenggat; hanya penanda "sudah lewat".
- **Server `next dev` yang sudah lama berjalan bisa menyajikan modul basi** setelah banyak berkas berubah
  (galat "tahapBerakhir is not a function"). Matikan lalu jalankan lagi `npm run dev`.

**Tugas berikutnya yang disarankan.** Portal tenant (backlog nomor 9): kotak penawaran yang membaca versi yang
berlaku, dan tiga tindakan (berminat, minta survei, menolak) yang menggantikan pencatatan atas nama. Sebelum itu,
backlog nomor 8 (potret skor) kecil dan menutup satu celah kepercayaan.

## Serah terima irisan keempat (17 November 2026)

Dua bagian: potret skor dengan keyakinan data, dan tahap pertama portal tenant.

### Bagian A: potret skor dan keyakinan data

**Masalah pengguna.** Skor di peluang dikirim klien dan hanya angkanya yang tersimpan. Setelah data dimuat ulang,
tidak ada yang bisa menjelaskan mengapa sebuah peluang dulu bernilai 87.

**Yang dibangun**

- `supabase/migrations/20261124000000_potret_skor.sql`: tabel `hasil_kecocokan`, fungsi `keyakinan_data`,
  `peluang_potret_ulang`, `peluang_kecocokan`, dan `peluang_buat` yang kini menghitung skornya sendiri.
- **Skor dihitung server** saat peluang dibuat. Nilai yang dikirim klien diabaikan.
- **Potret** menyimpan versi model, baris lengkap hasil kecocokan (poin enam komponen dan angka di balik
  penjelasannya), keyakinan data saat itu, dan tanggal tiap sumber data. Hitung ulang menambah potret baru;
  potret lama tidak ditimpa.
- **Keyakinan data** (tinggi, sedang, rendah) dari tujuh butir: terverifikasi, tanpa temuan terbuka, luas, daya,
  tarif, lingkungan SPBU, dan foto. Ditampilkan terpisah dari skor di kartu lahan dan halaman peluang.
- Komponen skor "Pelengkap bauran" diganti nama menjadi "Melengkapi jenis usaha yang ada".

**Keterbatasan.** Tiga peluang lama belum punya potret; tombol "Hitung ulang skor" membuatnya dari data saat ini.
Bobot enam komponen masih usulan. Belum ada evaluasi skor terhadap hasil nyata karena belum ada peluang yang
sampai kontrak lewat alur baru.

### Bagian B: portal tenant, tahap pertama

**Masalah pengguna.** Tenant tidak bisa melihat penawarannya sendiri, dan keputusannya dicatat staf NFR atas nama.

**Yang dibangun**

- `supabase/migrations/20261125000000_portal_tenant.sql`: kolom berbagi di `peluang`, tabel `tanggapan_tenant`,
  fungsi kelola organisasi, `peluang_bagikan`, dan lima fungsi khusus portal tenant.
- **Organisasi dan anggota** (`/organisasi`, pola Settings): admin NFR membuat organisasi tenant atau dealer,
  menghubungkan akun yang sudah ada lewat email, mengganti peran, dan mengeluarkan anggota.
- **Bagikan penawaran** (tab Penawaran di halaman peluang): ke satu organisasi tenant, hanya setelah satu versi
  terbit. Bisa dihentikan. Tanggapan tenant muncul di tab yang sama.
- **Kotak penawaran** (`/ruang-kerja` untuk tenant, pola Inbox): penawaran untuk organisasinya, dengan foto,
  lokasi, luas, sewa, dan status. Yang menunggu persetujuan diberi penanda.
- **Rincian penawaran** (`/ruang-kerja/penawaran/[id]`, pola Detail). Layar pertama menjawab lima hal:
  di mana lokasinya, mengapa cocok, berapa biayanya, apa yang perlu dipertimbangkan, dan apa langkah berikutnya.
  Rincian ruang, lingkungan, dan mutu data dibuka bila diperlukan.
- **Tindakan tenant:** nyatakan berminat, minta survei lokasi, ajukan pertanyaan, atau tolak dengan alasan.
- **Keputusan admin tenant** atas versi yang berlaku, saat peluang di tahap persetujuan: setuju, minta revisi,
  atau tolak. Tercatat langsung atas nama organisasinya, bukan lagi "atas nama" oleh NFR.

**Aturan yang dijaga basis data**

- Tenant hanya melihat penawaran yang **dibagikan ke organisasinya dan sudah punya versi terbit**. Draf tidak
  pernah terlihat. Tabel NFR tetap tertutup bagi tenant; datanya lewat fungsi yang memilih kolom aman.
- Yang **tidak** dikirim ke tenant: nama tenant lain, nilai kontrak pihak lain, catatan internal peluang, pemilik
  peluang, identitas staf NFR penyusun penawaran, dan persetujuan pihak lain.
- Menyatakan minat **tidak mengikat** dan tidak memindahkan tahap. Tim NFR yang menindaklanjuti.
- Menolak dan bertanya wajib berisi pesan. Penawaran yang sudah berakhir tidak bisa ditanggapi.
- Keputusan organisasi hanya oleh **admin tenant**, hanya di tahap persetujuan, hanya sekali per versi.
  NFR tidak bisa menimpa keputusan yang sudah diambil tenant.
- Organisasi dan anggota hanya diatur **admin NFR**. Admin tidak bisa mengubah perannya sendiri atau
  mengeluarkan dirinya, supaya tidak ada organisasi yang terkunci.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: lima berkas uji lulus. Dua yang baru: `potret_skor.sql` dan `portal_tenant.sql` (isolasi
  antar dua organisasi tenant, perwakilan lawan admin, kolom yang tidak boleh bocor, berhenti berbagi).
- `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Tampilan diperiksa di peramban sebagai akun tenant uji dan analis NFR uji, di 1280 dan 375 piksel, dengan satu
  peluang uji yang disisipkan lewat SQL lalu dihapus. Catatan internal terbukti tidak tampil di sisi tenant, dan
  akun tenant yang membuka `/pipeline` diarahkan kembali ke ruang kerjanya.

**Keterbatasan yang perlu diketahui**

- **Formulir admin di `/organisasi` belum dilihat di peramban**, karena akun uji NFR yang ada berperan analis.
  Aturannya tercakup uji basis data.
- Jalur berhasil tombol tenant (berminat, simpan keputusan) tidak dijalankan di peramban agar jejak audit bersih.
  Jalur ditolak terlihat benar.
- **Akun tetap dibuat di dasbor Supabase.** Aplikasi hanya menghubungkan akun yang sudah ada ke organisasi.
- Satu peluang hanya bisa dibagikan ke satu organisasi tenant.
- Belum ada pemberitahuan: tenant harus membuka portal untuk melihat penawaran baru, dan staf NFR harus membuka
  peluang untuk melihat tanggapan.
- Belum ada penjelajah lokasi, banding tiga lokasi, studio kelayakan, penjadwalan survei, dan dokumen.
- Portal dealer belum dibangun; persetujuan pemilik SPBU dan HSSE masih dicatat NFR atas nama.
- Rincian penawaran untuk tenant memakai `details` bawaan peramban, bukan tab; cukup untuk tiga bagian.

**Tugas berikutnya yang disarankan.** Portal dealer (backlog nomor 10), karena pemilik SPBU memegang empat
persyaratan dan satu persetujuan yang sekarang masih dicatat atas nama. Model wewenang (backlog nomor 5) sebaiknya
dikerjakan bersamaan: organisasi dealer perlu ditautkan ke SPBU yang dikelolanya.

## Serah terima irisan kelima (17 November 2026)

**Masalah pengguna.** Aplikasi tidak tahu siapa pemilik lahan, siapa yang berwenang menyetujui tenant, dan siapa
penerima sewa di tiap SPBU. Pemilik SPBU juga tidak punya akses: persetujuan dan pemeriksaan ruangnya dicatat staf
NFR atas nama.

**Yang dibangun**

- `supabase/migrations/20261126000000_wewenang_dealer.sql`: tabel `hak_spbu`, kolom konfirmasi pengelola di
  `status_lahan`, fungsi wewenang, lima fungsi inspeksi yang kini juga menerima pengelola SPBU, dan enam fungsi
  khusus portal dealer.
- **Wewenang SPBU** (bagian baru di Profil lokasi): pola pengelolaan, pemilik aset, pengelola, organisasi
  pengelola di aplikasi, penyetuju, pihak yang berkontrak, penerima sewa, pembagian sewa, dan rujukan dokumen.
- **Portal dealer**, dirancang untuk ponsel:
  - `/ruang-kerja`: usulan tenant yang menunggu, lalu SPBU yang dikelola organisasinya.
  - `/ruang-kerja/spbu/[id]`: siapa yang memutuskan di SPBU itu, ruang kosong, dan ruang terisi.
  - Konfirmasi tiap ruang kosong: bisa dipakai, atau tidak bisa dipakai dengan alasan.
  - `/ruang-kerja/inspeksi/[id]`: daftar periksa kesiapan dan unggah foto yang sama dengan milik tim NFR.
  - `/ruang-kerja/persetujuan/[id]`: kartu keputusan dengan calon tenant, ruang, syarat, manfaat menurut
    penerima sewa yang dipastikan, kesiapan, dan keputusan pihak lain.

**Aturan yang dijaga basis data**

- Wewenang **diisi lalu dipastikan oleh orang lain** (admin atau penyetuju NFR). Setiap perubahan mengembalikan
  status ke "belum dipastikan".
- **Penawaran baru boleh terbit setelah wewenang SPBU-nya dipastikan**, dan penerima sewa di penawaran harus sama
  dengan yang dipastikan.
- Anggota organisasi dealer hanya melihat **SPBU yang ditautkan ke organisasinya**. Tabel NFR tetap tertutup.
- Admin dealer memutuskan usulan tenant **hanya bila organisasinya penyetuju yang sah** untuk SPBU itu. Bila
  tidak, portal menampilkan nama penyetujunya dan keputusan tetap dicatat tim NFR dengan bukti.
- Operator SPBU boleh mengonfirmasi ruang dan mengisi inspeksi, tetapi tidak memutuskan atas nama organisasi.
- "Tidak bisa dipakai" menahan ruang dari penawaran. Konfirmasi "bisa dipakai" hanya melepas penahanan yang
  berasal dari pengelola; penahanan oleh tim NFR tidak tersentuh.
- Inspeksi yang diisi pengelola SPBU tetap **ditinjau tim NFR** sebelum ruang terverifikasi.
- Foto inspeksi hanya bisa dibuka tim NFR dan pengelola SPBU itu.

**Yang tidak dikirim ke dealer.** Identitas staf NFR, catatan internal peluang, rujukan dokumen wewenang, nilai
kontrak tenant lain, dan alasan keputusan pihak lain.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: enam berkas uji lulus. Yang baru, `wewenang_dealer.sql`, memeriksa pengisian dan pemastian
  wewenang, syarat terbit penawaran, cakupan SPBU antar dua organisasi dealer, konfirmasi ruang, inspeksi oleh
  operator, dan keputusan sesuai wewenang.
- `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Tampilan diperiksa di peramban sebagai akun dealer uji di 375 dan 1280 piksel, dan sebagai analis NFR untuk
  bagian wewenang. Pengelola uji memulai pemeriksaan ruang dari portalnya dan dibawa ke formulirnya. Akun tenant
  yang mencoba membuka halaman dealer mendapat "tidak ada". Semua data uji, termasuk tautan wewenang sementara
  di satu SPBU nyata, sudah dihapus.

**Keterbatasan yang perlu diketahui**

- **Belum ada satu pun SPBU yang wewenangnya terisi.** Datanya tidak ada di Brightspace maupun file master, jadi
  harus diisi tim NFR per SPBU. Sampai itu dilakukan, tidak ada penawaran yang bisa terbit. Mulai dari SPBU di
  tiga kota pilot.
- Wewenang dicatat per SPBU, belum per ruang. Rujukan dokumen berupa teks; belum ada unggahan berkas.
- Pemastian wewenang butuh dua orang berbeda. Dengan tiga admin yang ada ini bisa dilakukan, tetapi tidak oleh
  satu orang sendirian.
- Rekomendasi jenis usaha untuk dealer, manfaat komersial terhitung, kemitraan aktif, dan masalah operasional
  belum dibangun.
- Persetujuan HSSE masih dicatat tim NFR atas nama; belum ada peran HSSE.
- Jalur berhasil tombol (simpan wewenang, konfirmasi ruang, simpan keputusan) tidak dijalankan di peramban agar
  jejak audit bersih. Jalur ditolak terlihat benar.

**Tugas berikutnya yang disarankan.** Semua ruang kerja kini punya tahap pertama, dan alurnya bisa dijalankan
ujung ke ujung. Yang paling bernilai sekarang bukan fitur baru, melainkan **satu uji coba nyata**: isi wewenang
satu SPBU pilot, minta pengelolanya menginspeksi satu ruang, terima inspeksinya, lalu bawa satu peluang sampai
tahap persetujuan. Setelah itu: dasbor eksekutif (nilai perkiraan, terkontrak, dan terealisasi dipisah) dan
studio kelayakan untuk tenant.

## Serah terima irisan keenam (17 November 2026)

**Masalah pengguna.** Beranda hanya menampilkan angka portofolio (lahan kosong, okupansi, potensi sewa). Tidak
terlihat seberapa jauh alur komersial berjalan, apa yang macet, dan nilai mana yang sudah nyata.

**Yang dibangun**

- `supabase/migrations/20261127000000_dasbor.sql`: fungsi `dasbor_nfr()`, satu panggilan untuk beranda.
- **Beranda sebagai dasbor eksekutif** (pola Dashboard): hanya dibaca, semua tindakan menuju modulnya.
  - Lima angka: lahan kosong terverifikasi, okupansi, peluang berjalan, persetujuan menunggu, kontrak
    ditandatangani.
  - **Corong tujuh langkah** dari lahan kosong sampai outlet beroperasi. Baris yang nol menunjukkan di mana alur
    tertahan.
  - **Empat nilai uang yang dipisah:** perkiraan (tarif Brightspace lahan kosong), ditawarkan (versi penawaran
    yang berlaku), terkontrak (kontrak yang ditandatangani), dan terealisasi.
  - **Perlu perhatian:** tenggat lewat, persetujuan menunggu, inspeksi menunggu tinjauan, peluang tanpa pemilik
    atau tanpa tindakan berikut, tanggapan tenant baru, dan temuan data kritis. Hanya yang jumlahnya lebih dari nol.
- `docs/uji-coba-pilot.md`: panduan uji coba satu SPBU, dengan sembilan calon SPBU dari data nyata di tiga kota
  pilot dan dua belas langkah per peran.

**Aturan yang dipegang**

- **Nilai terealisasi ditulis "belum ada data"**, bukan nol, karena Bright Match belum menerima data pembayaran
  sewa. Fungsinya mengembalikan `null` dan uji memastikannya.
- Perkiraan, tawaran, dan kontrak tidak pernah dijumlahkan.
- "Penawaran resmi terbit" hanya menghitung peluang yang punya versi berlaku. Peluang lama di tahap kontrak tanpa
  versi muncul di daftar perlu perhatian.
- Angka dasbor konsisten dengan status per lahan: uji membandingkan jumlah lahan tertahan dengan `v_status_lahan`.

**Yang ditunjukkan dasbor hari ini.** 5.916 lahan kosong, 0 terverifikasi, 0 boleh ditawarkan, 3 peluang berjalan,
0 penawaran resmi, 0 kontrak. Perkiraan Rp 113,2 miliar per tahun; ditawarkan, terkontrak, dan terealisasi belum
ada. Artinya alur baru belum pernah dijalankan dengan data nyata; uji coba satu SPBU adalah langkah yang membukanya.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: tujuh berkas uji lulus dalam satu menit. Yang baru: `dasbor.sql`.
- `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Tampilan beranda diperiksa di peramban sebagai analis NFR di 1280 dan 375 piksel.

**Perbaikan pada cara menguji.** Uji yang gagal di tengah meninggalkan sesi basis data "idle in transaction" yang
memegang kunci atas tabel temuan, sehingga putaran uji berikutnya menggantung. Setiap berkas uji kini memasang
`idle_in_transaction_session_timeout` 30 detik dan `lock_timeout` 45 detik.

**Keterbatasan yang perlu diketahui**

- Fungsi dasbor butuh 0,2 sampai 0,6 detik. Cukup untuk beranda; bila data bertambah, jadikan tampilan
  termaterialisasi yang disegarkan saat data dimuat.
- Tidak ada tren antar waktu: dasbor hanya memotret keadaan sekarang.
- Analitik produk (waktu dari peluang ke penawaran, konversi) belum dihitung, karena belum ada peluang yang
  melewati alur baru.
- Daftar modul masih tampil di bawah dasbor, padahal menu samping sudah memuatnya.

**Tugas berikutnya yang disarankan.** Jalankan uji coba di `docs/uji-coba-pilot.md`. Setelah ada satu peluang
nyata yang sampai tahap persetujuan: studio kelayakan untuk tenant, lalu banding tiga lokasi.

## Serah terima irisan ketujuh (17 November 2026)

**Masalah pengguna.** Calon tenant menerima syarat sewa, tetapi tidak punya cara menghitung apakah usahanya layak
di lokasi itu. Keputusan berminat atau menolak dibuat di luar Bright Match, biasanya di lembar kerja sendiri.

**Yang dibangun**

- `src/lib/kelayakan.ts`: mesin hitung tanpa ketergantungan. Empat model: ritel dan makanan (pengunjung, konversi,
  nilai transaksi, hari buka, margin), pengisian daya kendaraan listrik (jumlah charger, daya, jam terpakai, harga
  jual, biaya listrik), ATM (transaksi, pendapatan per transaksi), dan umum (pendapatan dan margin langsung).
  Keluaran: pendapatan, laba kotor, biaya operasi termasuk sewa dan bagi hasil, laba operasi, investasi awal
  termasuk deposit, titik impas, balik modal, arus kas bersih selama masa sewa, NPV, dan IRR.
- `tests/kelayakan.test.mjs`: 14 uji rumus terhadap nilai acuan yang dihitung terpisah. Dijalankan `npm test`.
- `supabase/migrations/20261128000000_kelayakan.sql`: tabel `skenario_kelayakan`, fungsi `kelayakan_simpan` dan
  `kelayakan_daftar`.
- **Halaman Studio kelayakan** di `/ruang-kerja/penawaran/[id]/kelayakan` (pola Form dengan hasil langsung),
  dibuka dari tombol "Hitung kelayakan usaha Anda" di rincian penawaran tenant.
  - Tiga sumber angka diberi label terpisah: **Dari penawaran versi N** (syarat sewa, tidak bisa diubah),
    **Asumsi Anda** (semua angka usaha), dan **Hitungan model** (hasil).
  - Tiga skenario berdampingan: konservatif, dasar, optimistis. Skenario lain menggeser sisi permintaan saja
    dengan persen yang bisa diubah; biaya tetap.
  - Banding arus kas bersih tiga skenario dalam satu gambar batang, dengan untung dan rugi dieja.
  - Simpan sebagai versi bernama, lalu muat kembali asumsinya. Ini yang mengisi "skenario khusus" di cetak biru.

**Aturan yang dipegang**

- **Tidak ada asumsi usaha yang terisi sendiri.** Bright Match tidak punya data kunjungan atau omzet per lokasi,
  jadi semua kolom kosong sampai tenant mengisinya. Satu-satunya angka awal adalah geseran 20%, dan halaman
  menyebutnya titik awal yang boleh diubah.
- Syarat sewa selalu diambil server dari versi penawaran yang berlaku, tidak dari peramban.
- Hasil yang disimpan dihitung ulang di server dari asumsi, jadi tidak bisa dipalsukan dari peramban.
- **Asumsi tenant rahasia.** Tabelnya tanpa kebijakan baca sama sekali. Hanya anggota organisasi tenant pemilik
  yang bisa membaca lewat fungsi; tim NFR dan tenant lain tidak. Jejak audit hanya mencatat nomor versi.
- Versi tersimpan tidak pernah ditimpa. Tiap versi menyimpan syarat sewa saat itu, dan daftar memberi tanda bila
  penawarannya sudah berganti versi.
- IRR hanya ditampilkan bila arus kas berganti tanda tepat satu kali. NPV hanya bila tingkat diskonto diisi.
  Balik modal ditulis "tidak dalam masa sewa" bila tidak tercapai. Halaman menyebut hasilnya bukan perkiraan
  Pertamina dan bukan jaminan.

**Verifikasi yang sudah dijalankan**

- `npm test`: 14 uji rumus lulus. `npm run db:test`: delapan berkas uji lulus. Yang baru: `kelayakan.sql`
  (versi tidak ditimpa, sewa dari penawaran, tertutup bagi tenant lain dan bagi NFR).
- `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Diperiksa di peramban sebagai tenant uji di 1280 dan 375 piksel dengan satu peluang uji berlabel yang dihapus
  sesudahnya: halaman kosong, halaman terisi, pesan salah isi saat kolom ditinggalkan, dan penolakan simpan
  tanpa nama. Angka contoh dicocokkan dengan hitungan tangan.

**Keterbatasan yang perlu diketahui**

- **Simpan yang berhasil belum diklik di peramban**, karena meninggalkan peristiwa di jejak audit yang tidak bisa
  dihapus. Jalurnya diuji di basis data dan sampai tahap penolakan di peramban.
- Sewa dan biaya dianggap tetap selama masa sewa. Kenaikan sewa tahunan, inflasi biaya, dan pajak belum ada.
- Skenario konservatif dan optimistis hanya menggeser permintaan, bukan biaya atau margin.
- Bagi hasil dihitung dari omzet. Bila kontrak memakai dasar lain, hasilnya berbeda.
- Model ATM mengandaikan pendapatan per transaksi. Kerja sama dengan imbalan tetap memakai model umum.
- Tim NFR tidak punya studio ini; mereka hanya melihat tanggapan tenant.
- Di ponsel tabel menampilkan satu skenario sekaligus dengan pemilih di atasnya.

**Tugas berikutnya yang disarankan.** Uji coba di `docs/uji-coba-pilot.md` tetap yang paling bernilai. Di sisi
bangun: banding sampai tiga lokasi untuk tenant yang menerima lebih dari satu penawaran.

## Serah terima irisan kedelapan (17 November 2026)

**Masalah pengguna.** Tenant yang menerima lebih dari satu penawaran harus membuka tiap penawaran bergantian dan
mengingat angkanya sendiri untuk memilih.

**Yang dibangun**

- `supabase/migrations/20261129000000_banding.sql`: fungsi `tenant_penawaran_banding(p_ids)`. Hanya membaca; tidak
  ada tabel baru. Isinya sama dengan yang sudah boleh dilihat tenant di rincian penawaran, ditambah ringkasan
  skenario kelayakan terbaru milik organisasinya.
- **Halaman Bandingkan lokasi** di `/ruang-kerja/banding` (pola Detail, hanya dibaca), dibuka dari tombol
  "Bandingkan lokasi" di kotak penawaran bila ada dua penawaran atau lebih.
  - Sebelas hal di cetak biru dikelompokkan jadi lima: ruang dan SPBU, syarat sewa, lingkungan dan persaingan,
    kecocokan dan mutu data, dan hitungan kelayakan tenant sendiri.
  - Angka yang bisa dibanding besarnya (luas, daya, sewa, sewa per meter persegi, penduduk, tempat usaha, skor)
    digambar sebagai batang di samping angkanya.
  - Layar lebar: satu kolom per lokasi. Ponsel: tiap hal jadi satu kartu dengan satu baris per lokasi, ditandai
    huruf A, B, C.
  - Pemilih lokasi: dua atau tiga, pilihan tersimpan di alamat halaman. Tanpa pilihan, tampil tiga penawaran
    terbaru yang belum berakhir.

**Aturan yang dipegang**

- **Tidak ada peringkat atau pemenang.** Halaman hanya menyandingkan angka; batang berwarna sama dan catatan di
  bawah menyebut panjangnya bukan penilaian baik atau buruk.
- Tiap kelompok menyebut sumbernya. Sewa per meter persegi ditandai sebagai hitungan.
- Yang kosong ditulis apa adanya: "belum tercatat", "belum terhitung", "belum dihitung". Tidak ada angka pengganti.
- Penawaran organisasi lain yang disisipkan di alamat halaman dibuang di basis data, bukan di antarmuka.
- Ringkasan kelayakan hanya membawa hasil skenario dasar versi terbaru, tanpa asumsinya.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: sembilan berkas uji lulus. Yang baru: `banding.sql` (paling banyak tiga, urutan pilihan,
  tertutup antar tenant, tertutup bagi NFR dan pengunjung tanpa akun).
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Diperiksa di peramban sebagai tenant uji di 1280 dan 375 piksel dengan empat penawaran uji berlabel yang
  dihapus sesudahnya: tiga lokasi, dua lokasi, satu pilihan saja, batas tiga centang, dan pesan kurang dari dua.

**Keterbatasan yang perlu diketahui**

- Skor kecocokan di data uji kosong, jadi baris skor dengan batang belum terlihat terisi di peramban.
- Akses dan infrastruktur hanya diwakili daftar fasilitas SPBU dan letak ruang; Bright Match belum punya data
  lebar jalan, arah arus, atau parkir.
- Persaingan hanya melihat usaha sejenis di SPBU yang sama, bukan di sekitarnya.
- Halaman ponsel panjang karena tiap hal ditumpuk; belum ada cara melipat kelompok.
- Belum ada banding dua versi skenario kelayakan di satu lokasi.

**Tugas berikutnya yang disarankan.** Uji coba di `docs/uji-coba-pilot.md`. Di sisi bangun, yang tersisa di portal
tenant: permintaan jadwal survei dengan tanggal, lalu dokumen per tahap.

## Serah terima irisan kesembilan (17 November 2026)

**Masalah pengguna.** Tenant hanya bisa menekan "Minta survei lokasi" tanpa menyebut kapan. Jadwalnya lalu diatur
lewat telepon atau pesan, dan tidak tercatat di peluang.

**Yang dibangun**

- `supabase/migrations/20261130000000_survei.sql`: tabel `survei_lokasi` dan tujuh fungsi.
- **Tenant, di rincian penawaran, bagian Survei lokasi:** mengusulkan sampai tiga waktu (tanggal dan pagi, siang,
  atau sore) dengan catatan; melihat status "menunggu jadwal" atau jadwal yang ditetapkan beserta pendampingnya;
  membatalkan. Tombol "Minta survei lokasi" di kartu langkah kini menuju bagian ini.
- **Tim NFR, tab Survei di halaman peluang:** melihat usulan tenant, memakai salah satunya atau mengisi waktu
  lain, menetapkan jam dan pendamping, mengubah jadwal, mencatat hasil setelah tanggalnya tiba, atau membatalkan
  dengan alasan. Tab menampilkan "perlu jadwal" atau "terjadwal".
- Lima peristiwa survei tampil di tab Riwayat.

**Aturan yang dipegang**

- Satu peluang hanya punya satu survei yang berjalan; riwayat yang selesai dan yang batal tetap tersimpan.
- Usulan tenant mulai besok sampai 90 hari ke depan. Jadwal dari NFR tidak boleh di tanggal yang sudah lewat.
- Survei baru bisa dicatat selesai setelah tanggalnya tiba, dan hasilnya wajib ditulis.
- **Catatan hasil survei adalah catatan internal NFR** dan tidak terbaca tenant. Tenant hanya melihat jadwal, nama
  pendamping, catatan untuk tenant, dan alasan pembatalan.
- Pembatalan oleh NFR wajib beralasan, karena alasannya terlihat oleh tenant. Pembatalan oleh tenant boleh tanpa
  alasan.
- **Survei tidak memindahkan tahap peluang.** Tahap tetap dipindahkan tim NFR.
- Jam ditulis sebagai waktu setempat di lokasi SPBU. Batas tanggal dihitung menurut WIB.
- Permintaan survei tetap tercatat sebagai tanggapan tenant, jadi ikut terhitung di beranda.

**Perbaikan kecil.** Lencana tab Persetujuan dulu menulis "4/4" untuk peluang yang persetujuannya belum dibuka.
Kini menghitung persetujuan yang sudah diputuskan.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: sepuluh berkas uji lulus. Yang baru: `survei.sql` (validasi usulan, jadwal dan pendamping,
  selesai setelah tanggalnya, batal dua arah, isolasi antar tenant, auditor hanya membaca, hasil tertutup bagi
  tenant, delapan peristiwa audit).
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Diperiksa di peramban sebagai tenant uji dan analis uji di 1280 dan 375 piksel dengan data uji berlabel yang
  dihapus sesudahnya: formulir kosong, menunggu jadwal, dijadwalkan, dialog batal, dan pesan penolakan.

**Keterbatasan yang perlu diketahui**

- **Simpan yang berhasil belum diklik di peramban**, karena meninggalkan peristiwa audit yang tidak bisa dihapus.
  Jalurnya lulus di uji basis data; di peramban teruji sampai penolakan.
- **Tidak ada pemberitahuan.** Tidak ada surel atau pesan saat survei diminta, dijadwalkan, atau dibatalkan;
  kedua pihak melihatnya saat membuka halaman.
- **Pengelola SPBU belum melihat jadwal survei** di portalnya. Pendamping NFR yang mengabari.
- Fungsi lama `tenant_tanggapi` masih menerima permintaan survei tanpa tanggal. Antarmuka tidak lagi memakainya.
- Belum ada daftar semua survei lintas peluang, dan belum ada berkas kalender untuk diunduh.
- Survei yang tanggalnya lewat tanpa dicatat selesai tetap berstatus "dijadwalkan".

**Tugas berikutnya yang disarankan.** Uji coba di `docs/uji-coba-pilot.md`. Di sisi bangun: jadwal survei di
portal pengelola SPBU, lalu dokumen per tahap.

## Serah terima irisan kesepuluh (17 November 2026)

**Masalah pengguna.** Survei dijadwalkan antara tenant dan tim NFR, tetapi pengelola SPBU, yang lokasinya
didatangi, tidak melihatnya di portalnya.

**Yang dibangun**

- `supabase/migrations/20261201000000_survei_dealer.sql`: fungsi `dealer_survei` dan `dealer_survei_ketahui`,
  dua kolom tanda "sudah tahu" di `survei_lokasi`, dan pemicu yang menggugurkan tanda itu saat jadwal berubah.
- **Portal pengelola SPBU:** bagian "Survei lokasi yang akan datang" di halaman SPBU Anda (semua SPBU) dan di
  halaman tiap SPBU. Tiap butir memuat hari, tanggal, jam, ruang yang dilihat, jenis usaha, dan pendamping NFR,
  dengan tombol "Tandai sudah tahu".
- **Tab Survei tim NFR:** satu kalimat keadaan: pengelola sudah menandai tahu (siapa dan kapan), jadwal tampil
  tetapi belum ditandai, atau SPBU belum ditautkan ke organisasi pengelola sehingga jadwal tidak tampil di sana.

**Aturan yang dipegang**

- **Nama calon tenant, syarat sewa, dan catatan survei tidak dibuka ke pengelola.** Ini mengikuti aturan portal
  dealer yang sudah ada: nama tenant baru tampil saat usulannya sampai tahap persetujuan. Pengelola hanya melihat
  jenis usahanya.
- Pengelola hanya melihat survei di SPBU yang ditautkan ke organisasinya, yang sudah dijadwalkan, dan yang
  tanggalnya belum lewat.
- Tanda "sudah tahu" gugur bila tanggal atau jam berubah, tidak bila hanya pendamping yang berganti.
- Tenant tidak melihat tanda dari pengelola.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: sebelas berkas uji lulus. Yang baru: `survei_dealer.sql`.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Diperiksa di peramban sebagai dealer uji (375 dan 1280 piksel) dan analis uji, dengan tautan SPBU, peluang, dan
  survei uji berlabel yang dihapus sesudahnya: belum ditandai dan sudah ditandai, di kedua sisi.

**Keterbatasan yang perlu diketahui**

- **Tombol "Tandai sudah tahu" belum diklik di peramban**, karena meninggalkan peristiwa audit. Jalurnya lulus di
  uji basis data; keadaan "sudah ditandai" dilihat dengan data yang disisipkan.
- Di data nyata belum ada SPBU yang ditautkan ke organisasi pengelola, jadi bagian ini kosong sampai wewenang
  SPBU diisi.
- Pengelola tidak bisa menolak atau mengusulkan waktu lain dari portalnya; ia hanya menandai tahu.
- Tetap tidak ada pemberitahuan lewat surel atau pesan.

**Tugas berikutnya yang disarankan.** Uji coba di `docs/uji-coba-pilot.md`. Di sisi bangun: dokumen per tahap
(unggah, versi, dan siapa yang boleh melihat).

## Serah terima irisan kesebelas (17 November 2026)

**Masalah pengguna.** Surat penawaran, legalitas usaha tenant, dan naskah kontrak beredar lewat surel dan pesan.
Tidak terlihat versi mana yang berlaku dan siapa yang sudah menerimanya.

**Yang dibangun**

- `supabase/migrations/20261202000000_dokumen.sql`: tabel `dokumen_peluang` (tertutup, tanpa kebijakan baca) dan
  tujuh fungsi.
- **Rute unggah** `POST /api/peluang/[id]/dokumen` dan **rute buka** `GET /dokumen/[id]`. Berkas disimpan di bucket
  R2 yang sama dengan foto, di awalan `dokumen/<peluang>/`.
- **Tim NFR, tab Dokumen di halaman peluang:** mengunggah tujuh jenis dokumen, memilih apakah tenant dan
  pengelola SPBU boleh melihat, mengunggah versi baru, menarik dengan alasan, dan mengubah keterlihatan.
- **Tenant, bagian Dokumen di rincian penawaran:** membuka dokumen yang dibagikan kepadanya, dan mengunggah
  legalitas usaha, proposal, atau dokumen lain.
- **Pengelola SPBU, bagian Dokumen pendukung di kartu keputusan:** membuka dokumen yang dibuka untuknya.
- Tiga peristiwa dokumen tampil di tab Riwayat.

**Aturan yang dipegang**

- **Hak buka diperiksa basis data untuk tiap permintaan**, bukan disembunyikan di antarmuka. Jawaban tidak
  disimpan di cache.
- **Versi baru tidak menimpa versi lama.** Keduanya tetap bisa dibuka; versi baru mewarisi jenis dan
  keterlihatan rangkaiannya.
- **Dokumen tenant hanya terlihat oleh tenant itu dan tim NFR.** Tim NFR tidak bisa membukanya ke pengelola SPBU
  dan tidak bisa menariknya.
- **Dokumen yang ditarik tidak bisa dibuka siapa pun**, termasuk pengunggahnya. Catatannya tetap ada. Alasan
  penarikan hanya terlihat oleh tim NFR dan pihak pengunggah.
- Jenis berkas dikenali dari isinya (PDF, JPEG, PNG), bukan dari nama atau tipe kiriman peramban. Batas 4 MB.
- Sidik SHA-256 tiap berkas disimpan saat diunggah dan dicatat di jejak audit.
- **Mengunggah naskah kontrak tidak mencatat tanda tangan**, dan tidak ada dokumen yang menjadi syarat pindah
  tahap. Dokumen apa yang wajib adalah aturan Pertamina yang belum saya ketahui, jadi tidak saya karang.
- Identitas staf NFR tidak tampil ke tenant dan pengelola; mereka melihat "tim Non Fuel Retail".

**Perbaikan yang ditemukan saat mengerjakan ini**

- **Akun tenant dan pengelola SPBU dialihkan dari semua alamat di luar `/ruang-kerja`**, termasuk rute unggah foto
  inspeksi (`/api/inspeksi/...`). Artinya unggah foto inspeksi oleh pengelola SPBU, yang dibangun di irisan
  kelima, tidak pernah sampai ke rutenya. `src/lib/supabase/proxy.ts` kini meloloskan tiga awalan rute berkas;
  tiap rute tetap memeriksa haknya sendiri. Dibuktikan di peramban: pengelola kini menerima jawaban rute, bukan
  pengalihan.
- Daftar "Keputusan pihak lain" di kartu keputusan pengelola tidak lagi tampil kosong sebelum tahap persetujuan.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: dua belas berkas uji lulus. Yang baru: `dokumen.sql`.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Di peramban, sebagai tenant uji, dealer uji, dan analis uji, dengan data uji berlabel dan satu PDF uji di
  bucket, semuanya dihapus sesudahnya:
  - membuka dokumen: tiap peran hanya mendapat yang dibuka untuknya; yang ditarik ditolak untuk semua;
  - mengunggah: berkas bukan PDF ditolak (415), tanpa judul ditolak dan berkasnya dihapus lagi dari bucket,
    pengelola SPBU ditolak (403);
  - tampilan di 1280 dan 375 piksel untuk ketiga peran, tanpa meluber.

**Keterbatasan yang perlu diketahui**

- **Unggah yang berhasil belum dijalankan lewat peramban**, karena meninggalkan peristiwa audit yang tidak bisa
  dihapus. Yang teruji di peramban: penyimpanan ke bucket lalu penolakan catatan, dan pembukaan berkas nyata.
- **Batas 4 MB** mengikuti batas badan permintaan fungsi server di Vercel. Kontrak hasil pindai sering lebih
  besar. Sudah diatasi di irisan keempat belas: berkas sampai 24 MB diunggah bertahap.
- Hanya PDF, JPEG, dan PNG. Berkas Word dan Excel harus disimpan sebagai PDF dulu.
- Berkas yang ditarik tetap ada di bucket; yang ditutup adalah jalan membukanya.
- Pembukaan dokumen tidak dicatat di jejak audit.
- Pengelola SPBU belum bisa mengunggah. Tidak ada pemindaian virus. Tidak ada pemberitahuan.

**Tugas berikutnya yang disarankan.** Uji coba di `docs/uji-coba-pilot.md`; unggah foto inspeksi oleh pengelola
SPBU perlu dicoba di ponsel sungguhan karena baru sekarang rutenya terbuka. Di sisi bangun: penjelajah lokasi
untuk tenant, atau unggah langsung ke bucket untuk berkas besar.

## Serah terima irisan kedua belas (17 November 2026)

**Bukti untuk perbaikan irisan kesebelas.** Unggah foto inspeksi oleh pengelola SPBU kini terbukti dari ujung ke
ujung di peramban: foto dipilih di formulir inspeksi sebagai dealer uji, tersimpan di bucket, tercatat di basis
data, tampil di halaman, dan bisa diambil kembali. Inspeksi uji, fotonya di bucket, dan tautan SPBU uji sudah
dihapus. Yang belum: kamera ponsel sungguhan.

**Masalah pengguna.** Tenant hanya melihat lokasi yang sudah ditawarkan kepadanya. Ia tidak bisa mencari sendiri
ruang yang cocok, dan tim NFR tidak tahu ruang mana yang diminati.

**Yang dibangun**

- `supabase/migrations/20261203000000_jelajah.sql`: tabel `akses_jelajah` dan `minat_lokasi`, dan delapan fungsi.
- **Tenant, halaman Jelajahi lokasi** (`/ruang-kerja/jelajah`, pola List): ruang kosong yang sudah diverifikasi di
  wilayah yang dibuka untuk organisasinya, dengan saringan kota, luas paling sedikit, dan letak; dua belas per
  halaman; tombol "Minati lokasi ini".
- **Tim NFR, halaman Minat lokasi** (`/minat`, pola Inbox): minat yang masuk, dengan tautan ke kartu lahan,
  "Tandai sedang ditindaklanjuti", dan "Tutup minat" beralasan.
- **Admin NFR, halaman Organisasi dan anggota:** wilayah penjelajah tiap organisasi tenant, dan formulir untuk
  membukanya per provinsi beserta jumlah ruang yang saat ini layak.

**Aturan yang dipegang**

- **Tertutup secara bawaan.** Organisasi tenant tidak melihat apa pun sampai admin NFR membuka provinsi tertentu
  untuknya. Ini keputusan admin, bukan analis.
- **Hanya ruang yang boleh ditawarkan resmi:** kosong di sumber, tidak ditahan, datanya terverifikasi di lokasi
  dan belum berubah sejak itu, tanpa temuan kritis, dan tidak sedang menuju kontrak dengan pihak lain. Aturannya
  memakai `v_status_lahan` yang sama dengan penerbitan penawaran.
- **Tanpa tarif, tanpa nama penyewa, tanpa nilai kontrak.** Syarat sewa hanya disampaikan lewat penawaran resmi.
- **Minat tidak mengikat dan tidak membuat peluang.** Tim NFR yang memutuskan menindaklanjuti dan membuat
  peluangnya dari kartu lahan.
- Catatan tim NFR saat menutup minat adalah catatan internal dan tidak terbaca tenant.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: tiga belas berkas uji lulus. Yang baru: `jelajah.sql`.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Diperiksa di peramban sebagai tenant uji dan analis uji di 1280 dan 375 piksel dengan data uji berlabel yang
  dihapus sesudahnya: penjelajah belum dibuka, empat belas ruang dengan dua halaman, saringan tanpa hasil, dialog
  minat, kotak masuk minat, penolakan tutup tanpa alasan, dan keterangan wilayah di halaman organisasi.

**Keterbatasan yang perlu diketahui**

- **Formulir admin untuk membuka wilayah belum dilihat di peramban**, karena akun uji NFR adalah analis. Aturannya
  lulus di uji basis data.
- **Kirim minat yang berhasil belum diklik di peramban**, karena meninggalkan peristiwa audit.
- **Di data nyata penjelajah masih kosong:** belum ada lahan yang terverifikasi dan belum ada wilayah yang dibuka.
- Cetak biru meminta saringan tarif dan fasilitas. Tarif sengaja tidak ditampilkan; saringan fasilitas belum ada.
- Ruang di penjelajah belum punya halaman rincian sendiri; kartunya memuat ringkasannya.
- Minat belum muncul di daftar "perlu perhatian" beranda, dan tidak ada pemberitahuan.
- Satu akun dianggap anggota satu organisasi tenant.

**Tugas berikutnya yang disarankan.** Uji coba di `docs/uji-coba-pilot.md`. Tanpa lahan terverifikasi, penjelajah,
penawaran resmi, dan dasbor tetap kosong, jadi langkah inspeksi di sana yang membuka semuanya.

## Serah terima irisan ketiga belas: gladi uji coba (17 November 2026)

**Mengapa.** Dua belas irisan diuji sendiri-sendiri. Tiap uji menyiapkan keadaan awalnya dengan menulis langsung
ke tabel, jadi sambungan antar irisan belum pernah dijalankan. Kesalahan pengalihan yang ditemukan di irisan
kesebelas adalah contoh kesalahan yang lolos dari uji semacam itu.

**Yang dibangun**

- `supabase/tests/gladi_pilot.sql`: seluruh langkah di `docs/uji-coba-pilot.md` dijalankan berurutan oleh empat
  akun (analis, admin, pengelola SPBU, tenant), lewat fungsi yang sama dengan yang dipakai aplikasi. Yang ditulis
  langsung hanya akun dan dua keanggotaan NFR. Satu transaksi yang dibatalkan di akhir. Ikut berjalan di
  `npm run db:test`.
- Jalurnya: organisasi dan anggota, wewenang SPBU disimpan lalu dipastikan orang lain, konfirmasi ruang, inspeksi
  dengan dua foto, tinjauan, penjelajah dibuka dan tenant menyatakan minat, peluang dengan potret skor, enam
  perpindahan tahap, penawaran versi 1 terbit dan dibagikan, surat penawaran, skenario kelayakan, minat, usulan
  dan jadwal survei, tanda tahu pengelola, legalitas tenant, tiga perpindahan tahap, empat persetujuan, lalu
  kontrak, tanda tangan, aktivasi, mulai beroperasi, dan pemantauan.

**Yang ditemukan dan diperbaiki**

- **Beranda menulis "0 penawaran resmi terbit" padahal penawaran sudah terbit dan dibagikan.** Penawaran boleh
  terbit sejak tahap survei, tetapi beranda hanya menghitung peluang di tahap penawaran ke atas. Di uji coba, tim
  akan melihat nilai yang ditawarkan terisi dan jumlah penawaran nol. Diperbaiki di
  `supabase/migrations/20261204000000_dasbor_berversi.sql`: semua peluang berjalan yang punya versi terbit dihitung.
- Selebihnya, ketiga belas langkah lolos tanpa perubahan aturan. Tiga kali gladi berhenti karena isian gladinya
  sendiri (pilihan parkir yang tidak ada, bentuk keluaran daftar inspeksi), bukan karena alurnya.

**Yang dibuktikan gladi ini, dan yang tidak**

- Dibuktikan: aturan dan hak tiap peran tersambung dari langkah 1 sampai outlet beroperasi, dan angka beranda
  bergerak di tiap titik (lahan terverifikasi, penawaran resmi, kontrak, outlet).
- Tidak dibuktikan: tombol dan formulir di peramban pada jalur berhasil, unggah berkas sungguhan di tengah alur,
  kamera ponsel, dan apakah orang mengerti layarnya. Itu hanya terjawab oleh uji coba dengan orang nyata.
- Gladi memakai satu analis dan satu admin. Akun NFR nyata saat ini semuanya admin; aturan "orang yang berbeda"
  (memastikan wewenang, persetujuan NFR) berlaku per orang, jadi uji coba butuh dua orang NFR yang berbeda.

**Tugas berikutnya yang disarankan.** Uji coba dengan orang nyata. Tidak ada lagi yang perlu dibangun sebelum itu.

## Serah terima irisan keempat belas: dokumen di atas 4 MB (17 November 2026)

**Masalah pengguna.** Kontrak dan legalitas hasil pindai sering lebih besar dari 4 MB, batas yang dipasang di
irisan kesebelas karena badan permintaan fungsi server di Vercel dibatasi 4,5 MB.

**Yang dibangun**

- `supabase/migrations/20261205000000_dokumen_besar.sql`: kolom `bagian` di `dokumen_peluang`, `dokumen_catat`
  menerima jumlah bagian, `dokumen_unggahan_bebas`, dan `dokumen_akses` menyebut jumlah bagiannya.
- **Unggah bertahap.** Berkas di atas 4 MB dipotong di peramban menjadi bagian 3,5 MB. Tiap bagian dikirim ke
  `POST /api/peluang/[id]/dokumen/bagian`, lalu `POST .../dokumen/selesai` memeriksa dan mencatatnya. Formulir
  menulis kemajuannya ("Mengunggah bagian 2 dari 3"). Batas keseluruhan 24 MB.
- **Buka.** `GET /dokumen/[id]` mengalirkan bagian-bagiannya berurutan, jadi pembaca menerima satu berkas utuh.
- Berkas sampai 4 MB tetap lewat jalur satu permintaan yang lama.

**Mengapa berpotongan, bukan unggah langsung ke bucket.** Unggah langsung dengan alamat bertanda tangan butuh
pengaturan CORS di bucket Cloudflare, yang hanya bisa dipasang pemilik akun dan belum bisa saya buktikan. Cara
berpotongan memakai rute dan kredensial yang sudah ada. Unggahan bertahap bawaan S3 tidak bisa dipakai karena tiap
bagiannya paling kecil 5 MB, di atas batas Vercel. Bila kelak CORS dipasang, jalur langsung bisa menggantikan ini
tanpa mengubah catatan dokumennya.

**Aturan yang dipegang**

- **Ukuran, jenis, dan sidik dihitung server dari isi yang benar-benar tersimpan**, bukan dari klaim peramban.
  Saat menyelesaikan, server membaca kembali semua bagian.
- Semua bagian kecuali yang terakhir harus penuh, supaya susunannya tidak bisa dipalsukan.
- Sebelum dicatat, bagian-bagian itu belum menjadi dokumen dan tidak bisa dibuka siapa pun.
- Bila penyelesaian ditolak atau pengiriman gagal di tengah, bagian-bagiannya dihapus lagi.
- Nomor unggahan yang sudah dicatat tidak bisa dipakai lagi, jadi bagian dokumen yang ada tidak bisa ditimpa.
- Jenis berkas dan judul diperiksa di peramban sebelum apa pun dikirim, supaya berkas besar tidak terkirim sia-sia.

**Verifikasi yang sudah dijalankan**

- `npm run db:test`: empat belas berkas uji lulus; `dokumen.sql` diperluas untuk jumlah bagian dan batas ukuran.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`: lolos.
- Di peramban sebagai tenant uji, dengan data uji berlabel dan berkas uji di bucket yang dihapus sesudahnya:
  - dokumen tiga bagian dibuka: panjang dan sidik SHA-256 sama persis dengan yang ditaruh di bucket;
  - berkas 9 MB diunggah lewat formulir aslinya: tiga bagian terkirim, kemajuan tampil, lalu ditolak saat dicatat
    (tanpa judul), dan bucket kembali bersih;
  - berkas besar yang bukan PDF ditolak sebelum dikirim;
  - penyelesaian tanpa bagian ditolak.

**Keterbatasan yang perlu diketahui**

- **Penyelesaian yang berhasil belum dijalankan lewat peramban**, karena meninggalkan peristiwa audit. Pencatatan
  dengan jumlah bagian lulus di uji basis data, dan pembukaan berkas berpotongan terbukti di peramban.
- Pemeriksaan judul di peramban ditambahkan setelah uji peramban terakhir; yang teruji adalah pemeriksaan di server.
- Bila peramban ditutup di tengah unggahan, bagian yang sudah terkirim tertinggal di bucket tanpa catatan. Belum
  ada pembersih berkala.
- Unggahan yang putus harus diulang dari awal; belum bisa dilanjutkan.
- Belum dicoba di Vercel. Aliran jawaban di atas 4,5 MB bergantung pada dukungan aliran di sana.

**Tugas berikutnya yang disarankan.** Uji coba dengan orang nyata. Setelah aplikasi dipasang di Vercel, buka satu
dokumen di atas 5 MB di sana untuk memastikan alirannya.

## Serah terima irisan kelima belas: Next.js 16.4.6 (17 November 2026)

**Mengapa.** Next.js 16.4.4 terkena celah keamanan tingkat sedang (kebocoran informasi lintas parameter akar saat
memakai `use cache`, berlaku untuk 16.3.0 sampai 16.4.4). Akibat sehari-harinya: `npm run build` berhenti dengan
`SecurityFatalError` pada percobaan pertama dan baru lolos saat diulang.

**Yang diubah.** `next` dan `eslint-config-next` dari 16.4.4 ke 16.4.6 di `package.json` dan `package-lock.json`.
Tidak ada kode aplikasi yang berubah. Commit `3dc6dd1` ("bright match 2.0") masih memuat versi 16.4.4, jadi untuk
kembali cukup `git checkout package.json package-lock.json` lalu `npm install`.

**Verifikasi yang sudah dijalankan**

- `npm run build` lolos pada percobaan pertama, tanpa peringatan keamanan. `npm audit` tidak lagi menyebut `next`.
- `npm run typecheck`, `npm run lint`, `npm test` (14 uji), dan `npm run db:test` (14 berkas): lolos.
- Uji asap di peramban pada build baru: 28 halaman tim NFR, 5 halaman tenant, dan 4 halaman pengelola SPBU dibuka
  tanpa halaman galat, tanpa judul yang hilang, dan tanpa meluber (tenant dan pengelola juga di 375 piksel).
- Aksi server dijalankan sebagai tenant dan sebagai analis pada jalur penolakan; rute foto, rute dokumen, dan rute
  unggah foto menjawab benar; tenant yang membuka halaman NFR dialihkan ke ruang kerjanya; pengunjung tanpa akun
  dialihkan ke halaman masuk.

**Yang perlu diketahui**

- `npm audit` masih melaporkan tujuh temuan tingkat sedang, semuanya dari `minimatch` di perkakas lint
  (`typescript-eslint`). Itu perkakas pengembangan, tidak ikut ke aplikasi yang berjalan, dan tidak saya sentuh.
- `npm run dev` belum dicoba pada versi baru; yang diuji adalah build produksi.
- Uji asap membuka halaman dan memeriksa judul, bukan membandingkan tampilannya piksel demi piksel.

## Serah terima irisan keenam belas: akun uji admin dan pemeriksaan layar admin (17 November 2026)

**Mengapa.** Akun uji NFR yang ada hanya analis. Semua layar yang hanya muncul untuk admin atau penyetuju belum
pernah dilihat di peramban; hanya aturannya yang teruji di basis data.

**Yang dibuat.** Akun `uji.admin@brightmatch.test`, admin NFR, dengan sandi yang sama seperti tiga akun uji lain
(`UJI_SANDI` di `.env.local`), bertanda `akun_uji`. Alamatnya ditambahkan ke `.env.local` sebagai `UJI_EMAIL_ADMIN`.
Pengguna menyetujui pembuatannya secara tegas. Akun ini admin sungguhan di basis data yang dipakai, jadi hapus
sebelum aplikasi dipakai di luar pengembangan: keluarkan dari organisasi di halaman Organisasi dan anggota, lalu
hapus akunnya di dasbor Supabase.

**Layar yang diperiksa sebagai admin, di 1280 dan 375 piksel, tanpa meluber**

| Layar | Yang terlihat | Tombol ditekan pada jalur yang ditolak atau tidak mengubah apa pun |
| --- | --- | --- |
| Organisasi dan anggota | Tombol Keluarkan di tiap anggota kecuali diri sendiri, wilayah penjelajah, dua formulir | Simpan wilayah tanpa perubahan; buat organisasi tanpa nama; hubungkan email yang tidak ada; Keluarkan dengan konfirmasi dijawab tidak |
| Profil lokasi, bagian wewenang | Formulir wewenang dan tombol "Pastikan wewenang ini" | Memastikan wewenang yang diisi sendiri: ditolak |
| Inspeksi | Tombol "Tinjau inspeksi", jawaban pemeriksa berdampingan dengan data Brightspace, dua foto bukti | Kembalikan tanpa catatan: ditolak |
| Peluang, tab Persetujuan | Empat kartu persetujuan dengan "Catat keputusan" | Menyetujui versi yang disusun sendiri: ditolak |
| Peluang di tahap kontrak | Formulir tanda tangan kontrak | Tanggal di masa depan: ditolak |

Setelah semua itu, jejak audit tetap tiga peristiwa dan tidak ada data yang berubah. Data uji berlabel dan dua foto
uji di bucket sudah dihapus.

**Yang ditemukan dan diperbaiki.** Kalimat di tab Persetujuan masih menulis "sampai portal tenant dan dealer
tersedia", padahal kedua portal sudah ada sejak irisan keempat dan kelima. Kalimatnya kini menyebut bahwa tenant dan
pengelola SPBU memutuskan di portalnya, dan keputusan di luar aplikasi (termasuk HSSE) dicatat tim NFR dengan bukti.

**Yang belum diperiksa**

- Jalur berhasil dari tombol-tombol itu (membuat organisasi, memastikan wewenang, menerima inspeksi, menyetujui,
  mencatat tanda tangan). Semuanya meninggalkan peristiwa audit yang tidak bisa dihapus. Jalur itu lulus di gladi
  basis data (`gladi_pilot.sql`), tidak di peramban.
- Peran penyetuju. Hak penyetuju di layar sama dengan admin kecuali halaman organisasi, jadi tidak dibuatkan akun.
- Tombol Keluarkan memakai konfirmasi bawaan peramban; yang diperiksa adalah isi pertanyaannya dan bahwa jawaban
  "tidak" membatalkan.

## Serah terima irisan ketujuh belas: Temukan peluang, fase A (20 November 2026)

Temukan peluang (Smart Discovery) adalah pintu depan bagi orang yang belum punya akun: memilih peran, menjawab
kuesioner, dan melihat ringkasan preferensinya. Fase A hanya fondasi. Rekomendasi yang memakai preferensi itu
(fase B) dan tindakan dari hasilnya (fase C) belum dibangun.

### Yang sudah ada

- **Halaman depan `/temukan`**: dua kartu peran, cara kerja, dan dasar rekomendasi. Pengunjung yang kembali
  ditawari melanjutkan atau mulai ulang.
- **Wizard `/temukan/tenant` dan `/temukan/dealer`**: satu pertanyaan per langkah, lima pertanyaan inti, sisanya
  boleh dilewati. Tombol kembali peramban, muat ulang, dan alamat `?langkah=` bekerja.
- **Kuesioner berversi** di `src/lib/temukan/`: pertanyaan (`tenant-v1.ts`, `dealer-v1.ts`), percabangan
  (`cabang.ts`), pemeriksa jawaban (`periksa.ts`), ringkasan dan pengolahan awal (`ringkas.ts`). Wizard tidak tahu
  isi kuesioner; pertanyaan baru dengan jenis yang sudah ada cukup ditambahkan di berkas versi.
- **Sesi anonim**: tabel `sesi_temukan` (migrasi `20261206000000_temukan.sql`). Kuncinya di cookie httpOnly,
  basis data hanya menyimpan sidik SHA-256. Dihapus 30 hari setelah terakhir diubah.
- **Sambungan ke yang sudah ada**: jawaban tenant mengisi awal formulir "Jadi Bright Partner" (`/daftar`), yang
  hasilnya dihitung mesin kecocokan yang sama. Tidak ada mesin rekomendasi baru.

### Keputusan yang perlu diketahui

| Keputusan | Alasan |
| --- | --- |
| Alamat utama tanpa akun kini membuka `/temukan`, bukan `/login` | Permintaan rancangan. Alamat lain tetap ke `/login`; pengguna yang sudah masuk tidak terpengaruh. Satu baris di `src/lib/supabase/proxy.ts` bila ingin dikembalikan. |
| Delapan kartu jenis usaha dipetakan ke sebelas segmen data (`SEGMEN_KARTU`) | Mesin kecocokan bekerja dengan segmen di `lahan.segmen`. Kartu yang memuat dua segmen punya satu pertanyaan lanjutan. |
| Batas rentang anggaran: Rp 10, 25, 50 juta per tahun | Mengikuti sebaran tarif ruang kosong per 14 November 2026 (median Rp 15 juta, persentil 90 Rp 50 juta). |
| Peran di kuesioner hanyalah preferensi | Tidak ada hak yang lahir dari memilih "dealer". Diuji di `supabase/tests/temukan.sql`. |
| Tiap pertanyaan dan kolom bertanda `syarat` atau `preferensi` | Fase B menyaring dengan syarat dan mengurutkan dengan preferensi tanpa menebak. |
| Data umum tanpa jumlah, tarif, penyewa, atau ruang tersewa | Fungsi `temukan_wilayah`, `temukan_cari_spbu`, `temukan_spbu` terbuka untuk `anon`. |
| Tanpa Zod, tanpa shadcn/ui, tanpa gradien | Pemeriksa digerakkan konfigurasi dan dipakai di peramban dan server; profil UX proyek melarang gradien dekoratif. Satu paket baru: `lucide-react` (sesuai profil UX). |
| Huruf judul memakai kapital di awal kalimat saja | Mengikuti `.ux-profile.md`, bukan huruf judul di rancangan. |

### Uji yang dijalankan

| Perintah | Hasil |
| --- | --- |
| `npm test` | 28 lulus (14 baru untuk kuesioner) |
| `npm run db:test` | 15 berkas lulus, termasuk `temukan.sql` |
| `npm run lint`, `npm run typecheck`, `npm run build` | Bersih |
| Peramban tanpa kepala, lebar 375 dan 1280 | Tenant 45 dari 45, pengelola SPBU dan jalur keamanan 31 dari 31, akun yang sudah masuk 14 dari 14 |

Skrip uji peramban tidak ikut di repositori. Sesi yang dibuat uji sudah dihapus; `sesi_temukan` kosong setelahnya.

### Yang belum dan risikonya

- **Belum ada rekomendasi dari preferensi.** Ringkasan pengelola SPBU berakhir di tautan masuk. Halaman depan
  sudah menyebut rekomendasi, jadi fase A sebaiknya tidak dibuka ke umum sendirian.
- **Rem hanya global dan per sesi** (600 sesi baru per jam, 500 tulisan per sesi). Belum ada rem per alamat IP;
  itu perlu di tepi jaringan. Satu pihak bisa menghabiskan kuota pembuatan sesi; wizard tetap berjalan tanpa
  simpanan bila itu terjadi.
- **Jawaban tersimpan belum dipercaya.** Fungsi simpannya terbuka, jadi `bacaSesi()` membersihkannya lagi.
  Fase B wajib memakai `bacaSesi()` atau `bersihkan()`, tidak membaca kolom `jawaban` langsung.
- **Ruang tersewa tidak tampil bagi pengelola SPBU yang belum masuk.** Rancangan meminta "okupansi saat ini";
  itu baru aman ditampilkan setelah wewenangnya dipastikan.
- **"SPBU Anda" untuk pengelola yang sudah masuk belum terlihat di peramban**: akun uji dealer belum punya
  wewenang atas SPBU mana pun. Jalurnya hanya terbukti lewat kode.
- **Belum ada**: jelajah peta di pertanyaan wilayah, tabel peristiwa analitik (fase D), preferensi tersimpan per
  akun dan "Ubah preferensi" dari ruang kerja (fase C), pembaca layar sungguhan.
- **Jumlah langkah bisa berubah di tengah jalan** ("Langkah 1 dari 4" menjadi "2 dari 5") saat pertanyaan
  bercabang muncul.

## Serah terima irisan kedelapan belas: Temukan peluang, fase B (20 November 2026)

Fase B menyambungkan jawaban kuesioner ke rekomendasi: halaman hasil untuk calon tenant
(`/temukan/tenant/hasil`) dan untuk pengelola SPBU (`/temukan/dealer/hasil`). Fase C (minat, perbandingan,
preferensi per akun) belum dibangun.

### Lima lapis

| Lapis | Di mana | Catatan |
| --- | --- | --- |
| 1. Syarat wajib | `kecocokan()` di basis data | Jenis usaha, wilayah, luas minimum, daya minimum, anggaran, letak. Tidak pernah dilonggarkan otomatis. |
| 2. Skor kecocokan | `kecocokan()`, versi model tetap 2 | Enam komponen yang sama. Bobot tidak diubah. |
| 3. Kesesuaian preferensi | `src/lib/temukan/rekomendasi.ts`, versi `p1` | Angka tersendiri, 0 sampai 100. Prioritas pertama berbobot 3, kedua 2, ketiga 1, faktor lain 1. Faktor tanpa data tidak dihitung. |
| 4. Keyakinan data | `keyakinan_data_inti()` yang sudah ada | Tujuh butir yang sama dengan tim NFR, dimuat untuk kartu yang sedang tampil. |
| 5. Keputusan manusia | Halaman hasil | Rincian, alasan, ubah preferensi. Tidak ada persetujuan otomatis. |

### Yang berubah di basis data (migrasi `20261207000000_temukan_rekomendasi.sql`)

- **`kecocokan()` mendapat parameter `p_profil`**: kebutuhan pengunjung diperlakukan seperti calon tenant tanpa
  baris `calon_tenant`. Fungsi lama dihapus dan dibuat ulang dari definisi yang terpasang, dengan tiga sisipan.
  Keluaran untuk 12 pemanggilan lama (6 ruang, 4 tenant, 1 calon, 1 per segmen) dibandingkan sebelum dan sesudah:
  identik.
- **`temukan_lokasi(jsonb)`**: lokasi yang lolos syarat, paling banyak 300 teratas menurut skor mesin, beserta
  jumlah seluruhnya, jumlah di luar wilayah, dan jumlah yang tertahan.
- **`temukan_keyakinan(text[])`**, **`temukan_peluang_spbu(text, text[])`**: keyakinan data, dan jenis usaha
  per ruang untuk pengelola SPBU (paling banyak enam ruang per panggilan).
- **`temukan_ruang_tampil()`**: ruang yang boleh tampil untuk umum, dihitung sekaligus. Aturannya sama dengan
  `v_status_lahan`; uji `temukan_rekomendasi.sql` membandingkan keduanya untuk seluruh jaringan.

### Keputusan yang perlu diketahui

| Keputusan | Alasan |
| --- | --- |
| Data kosong lolos syarat, dengan tanda | Aturan mesin yang sudah ada: ruang yang luas, daya, atau tarifnya belum tercatat belum terbukti melanggar. Kartunya diberi peringatan dan jumlahnya disebut di atas daftar. |
| Anggaran fleksibel = toleransi tarif 1,25 | Sama dengan toleransi tenant eksisting di mesin. Lokasi di atas anggaran diberi tanda. |
| Luas maksimum, pelanggan, rencana buka, prioritas = preferensi | Hanya memengaruhi urutan, tidak menyaring. |
| "Akses dan visibilitas" dan "dekat jaringan usaha" belum dinilai | Tidak ada datanya. Ditampilkan sebagai "belum ada data", bukan diberi angka karangan. |
| Urutan bawaan = rata-rata skor kecocokan dan kesesuaian preferensi | Angka gabungannya tidak ditampilkan, supaya tidak ada skor ketiga. |
| Tarif acuan Brightspace tampil untuk umum | Sama dengan halaman hasil "Jadi Bright Partner". Selalu disebut tarif acuan, bukan penawaran. |
| Pengelola SPBU tanpa wewenang hanya melihat jenis usaha dan jumlah calon | Profil calon (tanpa nama) hanya untuk akun yang wewenangnya tercatat di `hak_spbu`. Nama calon tidak pernah dikirim. |
| "Lainnya" tidak disarankan sebagai jenis usaha | Ia kumpulan usaha tak terklasifikasi. |
| Ruang ditahan, disengketakan, atau menuju kontrak tidak tampil | Dihitung sebagai "belum bisa ditawarkan". |
| Wizard dan halaman hasil dipasang ulang pada navigasi baru (`segar.tsx`) | Next.js 16 menyimpan keadaan halaman yang ditinggalkan; tanpa ini jawaban lama muncul lagi setelah diubah. |

### Uji yang dijalankan

| Perintah | Hasil |
| --- | --- |
| `npm test` | 37 lulus (9 baru untuk rumus preferensi) |
| `npm run db:test` | 16 berkas lulus, termasuk `temukan_rekomendasi.sql` |
| `npm run lint`, `npm run typecheck`, `npm run build` | Bersih |
| Peramban, lebar 375 dan 1280 | Rekomendasi tenant 37 dari 37, pengelola SPBU 15 dari 15; uji fase A diulang: 45 dari 45 dan 31 dari 31; akun yang sudah masuk 14 dari 14 |

Waktu hitung di basis data: satu kota 0,6 detik, seluruh Indonesia 1,1 detik, satu SPBU enam ruang 1,9 detik.

### Yang belum dan risikonya

- **Belum ada**: nyatakan minat, bandingkan lokasi, preferensi tersimpan per akun, potret rekomendasi
  (`personalized_match_results`), analitik. Itu fase C dan D.
- **Preferensi hanya mengurutkan 300 teratas menurut skor mesin.** Untuk pencarian seluruh Indonesia, lokasi di
  luar 300 itu tidak ikut dinilai. Halaman menyebutnya dan menyarankan mempersempit wilayah.
- **Fungsi rekomendasi terbuka dan mahal** (sampai dua detik kerja basis data per panggilan), tanpa rem per
  alamat IP. Perlu pembatas di tepi jaringan sebelum dibuka ke umum.
- **Profil calon untuk pengelola berwenang hanya terbukti di uji basis data**: akun uji dealer belum punya
  wewenang atas SPBU mana pun, jadi tampilannya belum pernah terlihat di peramban.
- **Titik peta tidak bisa dijangkau papan ketik.** Daftar tetap tampilan utama dan memuat hal yang sama.
- **Foto ruang belum tampil** di kartu: rute foto masih tertutup bagi pengunjung tanpa akun.
- **Rumus preferensi adalah usulan awal**, belum divalidasi dengan tenant. Pemetaan pelanggan ke tipe lokasi
  (perkantoran, industri, perumahan) adalah heuristik.
- **Koordinat sumber**: satu SPBU berprovinsi Banten tampil di peta di wilayah Jawa Barat. Itu data sumber, bukan
  perhitungan halaman ini.

## Serah terima irisan kesembilan belas: Temukan peluang, fase C (20 November 2026)

Fase C menambahkan tindakan dari rekomendasi: menyimpan preferensi atas akun, membandingkan lokasi, menyatakan
minat, dan meneruskannya ke kotak kerja tim NFR yang sudah ada. Fase D (analitik, umpan balik, penyempurnaan)
belum dibangun.

### Yang sudah ada

| Hal | Cara kerjanya |
| --- | --- |
| Preferensi per akun | Akun tenant dan akun pengelola SPBU menyimpan jawabannya atas akunnya, jadi terbaca di perangkat mana pun. Peran yang boleh disimpan mengikuti keanggotaan organisasi, bukan pilihan di kuesioner. |
| Serah terima saat masuk | Jawaban yang diisi sebelum masuk menjadi preferensi akun, bila akun itu belum punya. Tautan "Masuk" dari halaman Temukan peluang membawa pengguna kembali ke halaman itu. |
| Bandingkan lokasi | Sampai tiga lokasi berdampingan. Tanda unggul hanya di skor kecocokan, kesesuaian preferensi, dan tarif acuan terendah. |
| Minat tenant berakun | Tombol "Nyatakan minat" di kartu, dengan catatan opsional. Masuk ke `minat_lokasi` dengan asal `temukan`. |
| Minat pengunjung tanpa akun | Lokasi ditandai (paling banyak sepuluh), lalu diteruskan sebagai minat calon tenant saat formulir "Jadi Bright Partner" dikirim. Asal `formulir`. |
| Ketertarikan pengelola SPBU | Akun yang wewenangnya atas SPBU itu tercatat mengajukan ketertarikan pada satu jenis usaha untuk satu ruang. Asal `pengelola`. Tidak memilih tenant. |
| Kotak kerja NFR | Halaman Minat lokasi menampilkan keempat asal, jenis usaha yang diminati, dan tautan ke calon tenant. Peluang tetap dibuat tim NFR dari kartu lahan atau halaman calon. |
| Ruang kerja | Menu "Rekomendasi lokasi" untuk tenant dan "Peluang untuk SPBU" untuk pengelola. |

### Yang berubah di basis data (migrasi `20261208000000_temukan_aksi.sql`)

- `sesi_temukan`: kolom `diminati`, dan baris akun (`user_id` terisi, tidak kedaluwarsa). `temukan_simpan`,
  `temukan_sesi`, `temukan_hapus` kini mengenali akun; `temukan_klaim` mengambil alih sesi cookie saat masuk.
- `minat_lokasi`: kolom `calon_id`, `sumber`, `segmen`, `potret`; `organisasi_id` boleh kosong, dengan syarat tepat
  satu pihak. `minat_daftar` mengembalikan kolom baru. Fungsi lama `tenant_minati` dan `minat_tangani` tidak diubah.
- Fungsi baru: `temukan_minati`, `temukan_minati_usaha`, `temukan_minat_saya`, `temukan_tandai`,
  `temukan_serahkan`.

### Keputusan yang perlu diketahui

| Keputusan | Alasan |
| --- | --- |
| Minat tidak membuat peluang | Aturan yang sudah ada: minat tidak mengikat, peluang dibuat tim NFR. Satu pintu, satu kotak kerja. |
| Tenant berakun boleh meminati ruang yang belum diverifikasi | Rekomendasi memang menampilkannya. Verifikasi tetap syarat sebelum penawaran resmi, dan itu dijaga alur peluang. Ini lebih longgar daripada penjelajah lokasi, yang hanya memuat ruang terverifikasi di provinsi yang dibuka admin. |
| Pengunjung tanpa akun tidak bisa menyatakan minat resmi | Minat butuh identitas. Jalurnya formulir Bright Partner, yang sudah ada dan tidak butuh akun. |
| Potret rekomendasi disimpan sebagai keterangan | Dikirim aplikasi peminat, jadi dibersihkan dan tidak dipakai untuk keputusan. Skor resmi dihitung saat peluang dibuat. |
| Ketertarikan pengelola menyebut jenis usaha, bukan tenant | Nama calon tidak dibuka ke pengelola sebelum tahap persetujuan. |
| Halaman hasil tidak lagi mengalihkan ke kuesioner | Peramban mengingat pengalihan per alamat, sehingga tautan ke hasil terpental walau jawaban sudah lengkap. Kini tampil panel "lengkapi dulu". |
| Alamat tujuan setelah masuk dibatasi | Hanya `/temukan/tenant` dan `/temukan/dealer` (dengan atau tanpa `/hasil`), dan hanya untuk ruang akun itu. |

### Uji yang dijalankan

| Perintah | Hasil |
| --- | --- |
| `npm test` | 38 lulus |
| `npm run db:test` | 17 berkas lulus, termasuk `temukan_aksi.sql` |
| `npm run lint`, `npm run typecheck`, `npm run build` | Bersih |
| Peramban, lebar 375 dan 1280 | Tindakan (bandingkan, tandai, serah terima, masuk, lintas perangkat) 28 dari 28; akun pengelola SPBU dan NFR 13 dari 13; uji fase A dan B diulang: 45, 31, 38, dan 16 lulus semua; akun yang sudah masuk 14 dari 14 |

### Yang sengaja tidak ditekan di peramban

Tombol kirim minat, kirim ketertarikan, dan kirim formulir Bright Partner tidak ditekan: semuanya menulis data
nyata dan jejak audit yang tidak bisa dihapus. Jalur itu terbukti di `supabase/tests/temukan_aksi.sql`, dalam
transaksi yang dibatalkan. Yang terbukti di peramban: tombol dan formulirnya tampil untuk peran yang benar dan
tidak tampil untuk yang lain.

### Yang belum dan risikonya

- **Belum ada**: analitik dan umpan balik rekomendasi (fase D), potret rekomendasi tersimpan untuk semua hasil,
  perbandingan calon tenant untuk pengelola, pemberitahuan ke tim NFR saat minat masuk.
- **Tombol "Ajukan ketertarikan" belum pernah terlihat di peramban**: akun uji dealer belum punya wewenang atas
  SPBU mana pun.
- **Penerusan minat dari formulir bergantung pada cookie sesi yang sama.** Bila pengunjung menandai lokasi di satu
  peramban lalu mendaftar di peramban lain, tandanya tidak ikut.
- **Sesi cookie yang diambil alih tidak lagi terbaca tanpa masuk.** Itu disengaja, tetapi pengguna yang keluar
  akan melihat kuesioner kosong.
- **Rem per alamat IP tetap belum ada** untuk fungsi yang terbuka tanpa akun.

## Serah terima irisan kedua puluh: Temukan peluang, fase D (20 November 2026)

Fase D menambahkan analitik tanpa identitas, umpan balik rekomendasi, penyempurnaan percabangan dan kegunaan,
satu penghematan kinerja, dan verifikasi aksesibilitas dengan alat otomatis. Ini fase terakhir dari rancangan
Smart Discovery.

### Analitik

- **Dicatat di server.** Perjalanan kuesioner dibaca pemicu basis data dari perubahan baris `sesi_temukan`, dan
  minat dari `minat_lokasi`. Halaman hanya boleh mengirim tiga peristiwa tampilan (rekomendasi dibuat, dilihat,
  diklik), paling banyak 300 per sesi per hari.
- **Sebelas nama peristiwa** mengikuti rancangan: `discovery_started`, `role_selected`, `question_answered`,
  `question_skipped`, `discovery_completed`, `recommendation_generated`, `recommendation_viewed`,
  `recommendation_clicked`, `preferences_updated`, `tenant_interest_submitted`, `dealer_interest_submitted`.
- **Tanpa data pribadi.** Tidak ada akun, email, alamat IP, atau teks bebas. Sesi dikenali lewat pseudonim.
  Isi jawaban hanya ikut untuk pertanyaan pilihan; wilayah sampai provinsi; anggaran sebagai rentang.
- **Retensi 180 hari** untuk peristiwa dan umpan balik (`temukan_retensi()`), dijalankan sesekali saat ada
  tulisan baru karena tidak ada penjadwal.
- **Halaman `/analitik-temukan`** untuk tim NFR: penyelesaian, median lama pengisian, corong per pertanyaan,
  titik berhenti, rekomendasi tanpa hasil, dari rekomendasi ke minat, pilihan paling sering, dan umpan balik.
  Di bawah 30 sesi halaman memberi peringatan bahwa persentasenya belum bisa dibaca sebagai pola.

### Umpan balik rekomendasi

Tiap kartu lokasi, dan tiap jenis usaha di hasil pengelola SPBU, punya "Sesuai" dan "Kurang sesuai". Bila
kurang sesuai, pengguna boleh memilih satu alasan dari daftar (tarif, lokasi, ruang, data, lain). Tanpa teks
bebas. Satu penilaian per sesi per rekomendasi; penilaian baru menimpa yang lama. Disimpan di `umpan_temukan`
bersama skor dan urutan saat dinilai, supaya terlihat apakah skor tinggi memang lebih sering dinilai sesuai.

### Penyempurnaan

| Hal | Perubahan |
| --- | --- |
| Hitungan langkah | "Langkah n dari m" kini menghitung pertanyaan inti yang masih mungkin tampil, jadi m tidak bertambah di tengah jalan (dulu 1 dari 4 menjadi 2 dari 5). |
| Percabangan tenant | Untuk F&B, parkir pelanggan ditanyakan langsung, tidak lagi di balik "Tambah detail". |
| Percabangan pengelola | Daya yang bisa disediakan ditanyakan bila listrik tersedia atau perlu ditambah. |
| Versi kuesioner | Naik ke `2026.11.1`. Jawaban versi sebelumnya tetap terbaca; kolom yang tidak lagi tampil dibuang saat dibersihkan. |
| Cip preferensi di ponsel | Tiga pertama saja, sisanya lewat tautan "+N lainnya". |
| Perbandingan di ponsel | Bilah cari dan saringan disembunyikan saat membandingkan, supaya tabel langsung terlihat. |
| Kinerja | Daftar wilayah disimpan sementara satu jam (`use cache`), tidak lagi ditanyakan ke basis data di tiap kunjungan wizard. Daftar kosong tidak disimpan. |

### Verifikasi aksesibilitas

Diuji dengan axe-core 4.14 (aturan WCAG 2.0, 2.1, dan 2.2 tingkat A dan AA, ditambah praktik baik) pada 26
layar dan keadaan, di lebar 375 dan 1280: halaman depan, masuk, tiap jenis pertanyaan wizard termasuk keadaan
galat, ringkasan, daftar hasil, rincian, perbandingan, peta, tampilan kosong, dialog, formulir Bright Partner,
wizard dan hasil pengelola SPBU, serta halaman analitik dan minat NFR. Hasil akhir: tanpa temuan.

Yang ditemukan dan diperbaiki:

| Temuan | Perbaikan |
| --- | --- |
| Nama tombol untuk pembaca layar tidak memuat teks yang terlihat (WCAG 2.5.3), misalnya "Tandai untuk diminati" | Keterangan ruang kini ditambahkan sebagai teks khusus pembaca layar di belakang teks yang terlihat. |
| Bingkai tabel yang bisa digulung tidak bisa dijangkau papan ketik (halaman analitik) | Bingkainya bisa difokus dan diberi nama. |
| Daftar definisi memuat elemen yang tidak diizinkan (`KartuAngka`, dipakai juga di beranda NFR) | Catatan kartu kini elemen `dd`. |
| Dua wilayah halaman bernama sama di tampilan perbandingan | Bingkai tabel diberi nama sendiri. |

Diuji juga tanpa tetikus: Tab mencapai pilihan dengan cincin fokus yang terlihat, panah memindahkan pilihan,
Enter melanjutkan dan fokus pindah ke judul pertanyaan, kotak cari wilayah bisa dipakai penuh, dialog mengurung
fokus dan Esc mengembalikannya ke tombol pemicu, dan preferensi "kurangi gerak" mengganti geseran dengan pudar.

### Uji yang dijalankan

| Perintah | Hasil |
| --- | --- |
| `npm test` | 43 lulus |
| `npm run db:test` | 18 berkas lulus, termasuk `temukan_analitik.sql` |
| `npm run lint`, `npm run typecheck`, `npm run build` | Bersih |
| Aksesibilitas (axe dan papan ketik), 375 dan 1280 | 36 dari 36 di tiap lebar |
| Uji fase D di peramban | 23 dari 23 |
| Uji fase A sampai C diulang, 375 dan 1280 | 45, 31, 38, 16, dan 28 lulus semua; akun 14 dan 13 lulus semua |

Keluaran mesin kecocokan untuk pemanggilan lama tetap identik. Peristiwa dan umpan balik buatan pengujian sudah
dihapus; kedua tabel kosong saat serah terima.

### Yang belum dan risikonya

- **Belum diuji dengan pembaca layar sungguhan** (VoiceOver, TalkBack) dan belum dengan pengguna nyata. Axe
  menangkap pelanggaran yang bisa diperiksa mesin, bukan mutu pengalaman.
- **Titik peta tetap tidak bisa dijangkau papan ketik.** Daftar memuat hal yang sama.
- **Halaman yang hanya dibuka tanpa menjawab tidak tercatat**, jadi "sesi yang mulai" bukan jumlah pengunjung.
  Itu disengaja agar tidak perlu cookie sebelum ada jawaban.
- **Pseudonim bukan anonim penuh**: pihak dengan akses basis data bisa menautkan sesi akun ke peristiwanya.
- **Retensi bergantung pada lalu lintas**: tanpa tulisan baru, penghapusan tidak berjalan. Bila perlu pasti,
  jadwalkan `select public.temukan_retensi()` harian.
- **Rumus preferensi belum disetel dari umpan balik.** Datanya kini terkumpul, tetapi penyetelan baru masuk akal
  setelah ada cukup penilaian dari pengguna nyata.
- **Kinerja belum diukur di peramban.** Yang diukur hanya waktu fungsi basis data (fase B).
- **Rem per alamat IP tetap belum ada.**

## Akun simulasi Temukan peluang (20 November 2026)

Dua akun dibuat atas permintaan pengguna, lalu menjalankan Temukan peluang lewat aplikasi sungguhan di peramban,
termasuk tombol kirim yang sebelumnya sengaja tidak ditekan. Email dan kata sandinya ada di `.env.local`
(`SIM_EMAIL_TENANT`, `SIM_EMAIL_DEALER`, `SIM_SANDI`). Keduanya bertanda `akun_uji` dan `akun_simulasi`.

| Akun | Organisasi (bertanda uji) | Yang sudah dijalankan |
| --- | --- | --- |
| `simulasi.tenant@brightmatch.test` | Tenant Simulasi (akun demonstrasi) | Kuesioner F&B untuk Jakarta Selatan sampai selesai, 51 rekomendasi, perbandingan dua lokasi, dua penilaian, dan minat pada ruang 3412303-IN-001. |
| `simulasi.dealer@brightmatch.test` | Pengelola SPBU Simulasi (akun demonstrasi) | Kuesioner untuk SPBU 3412605 (lima ruang) sampai selesai, jenis usaha per ruang dengan profil calon tanpa nama, satu penilaian, dan ketertarikan pada makanan dan minuman untuk ruang 3412605-IN-002. |

**Yang tertulis di basis data.** Dua akun dan dua organisasi bertanda uji; satu baris `hak_spbu` yang menautkan
SPBU 3412605 ke organisasi pengelola simulasi (hanya tautan: pola, pemilik aset, penyetuju, dan penerima sewa
dikosongkan karena tidak ada sumbernya, status belum dipastikan); dua minat berstatus baru di halaman Minat lokasi
NFR, keduanya bertanda "Organisasi uji" dan catatannya diawali "Simulasi:"; dua preferensi akun; peristiwa analitik
dan tiga penilaian dari kedua sesi; dan tujuh baris jejak audit yang tidak bisa dihapus.

SPBU 3412605 dipilih karena bukan salah satu dari sembilan calon uji coba, belum punya catatan wewenang, peluang,
atau temuan data, dan semua ruangnya kosong.

**Yang belum dijalankan.** Tindak lanjut NFR atas kedua minat itu, dan seluruh alur komersial sesudahnya (peluang,
penawaran, survei, persetujuan).

**Sebelum aplikasi dipakai sungguhan:** tutup kedua minat di halaman Minat lokasi, kosongkan organisasi pengelola
di wewenang SPBU 3412605, keluarkan kedua akun dari organisasinya, hapus akunnya di dasbor Supabase, dan hapus dua
organisasi bertanda uji itu. Angka di halaman analitik memuat dua sesi simulasi ini sampai retensinya habis.
