# Bright Match

NFR Commercial Intelligence & Partnership Platform: mencocokkan ruang usaha kosong di SPBU Pertamina
dengan tenant yang tepat. Bagian dari program Bright Partner.

Aplikasi web Next.js 16 (App Router, React 19, Tailwind 4) dengan Supabase sebagai basis data dan
layanan login.

> **Bright Match 2.0.** Penilaian keadaan sekarang, arsitektur sasaran, backlog, dan serah terima tiap irisan ada
> di [docs/bright-match-2.0.md](docs/bright-match-2.0.md). Profil UI/UX ada di `.ux-profile.md`.
> Panduan uji coba satu SPBU, dengan calon SPBU dari data nyata, ada di [docs/uji-coba-pilot.md](docs/uji-coba-pilot.md).

## Menjalankan

```bash
npm install
cp .env.example .env.local   # lalu isi, lihat "Menghubungkan Supabase"
npm run dev                  # http://localhost:3000
```

Tanpa `.env.local`, aplikasi tetap terbuka dan menampilkan panduan penyiapan.

## Menghubungkan Supabase

1. Buat proyek di [supabase.com](https://supabase.com). Catat kata sandi basis datanya.
2. Isi `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`: Project Settings > API > Project URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Project Settings > API Keys > Publishable key.
     Proyek lama boleh memakai anon key. Jangan menaruh secret key atau service_role key di sini.
   - `SUPABASE_DB_URL`: tombol Connect > Session pooler. Tulis di dalam tanda kutip dan ganti
     `[YOUR-PASSWORD]`. Hanya dipakai skrip migrasi, tidak pernah dibaca aplikasi web.
3. Pasang skema dan muat data:

   ```bash
   npm run db:setup
   ```

4. Buat pengguna di dasbor Supabase: Authentication > Users > Add user (email dan kata sandi,
   centang Auto Confirm User). Matikan pendaftaran mandiri di Authentication > Sign In / Providers
   agar hanya admin yang bisa menambah pengguna.
5. Jalankan ulang `npm run dev`, lalu masuk dengan pengguna tadi.

## Migrasi data

Sumber data adalah hasil pipeline Python di folder induk (`eksplorasi.py`), yaitu
`../nfr-dashboard/public/eksplorasi`: hasil scraping Brightspace yang sudah dibersihkan dan digabung
dengan file master kontrak.

| Perintah | Yang dilakukan |
| --- | --- |
| `npm run db:schema` | Memasang berkas di `supabase/migrations` yang belum terpasang. |
| `npm run db:seed` | Mengekspor data ke `supabase/seed/*.csv`, lalu mengganti seluruh isi tabel. |
| `npm run db:setup` | `db:schema` lalu `db:seed`. |
| `npm run db:lingkungan` | Memuat ulang data lingkungan dan titik peta dari `supabase/lingkungan/`. `db:seed` menjalankannya otomatis. |
| `npm run db:gambar` | Memuat ulang daftar foto dari `supabase/gambar/gambar.csv.gz`. `db:seed` menjalankannya otomatis. |
| `npm run db:validasi` | Mencari ulang temuan kualitas data (Validasi data). `db:seed` menjalankannya otomatis; keputusan yang sudah ada tidak ditimpa. |
| `npm run db:test` | Uji otomatis aturan akses dan alur di basis data, termasuk gladi uji coba dari langkah 1 sampai outlet beroperasi (`gladi_pilot.sql`). Tiap berkas berjalan dalam satu transaksi yang dibatalkan, jadi tidak meninggalkan data. |
| `npm run db:check` | Menampilkan ringkasan isi basis data. |
| `npm test` | Uji rumus studio kelayakan (`tests/*.test.mjs`). Tidak menyentuh basis data. |

Semua perintah aman diulang. Butuh `psql` dan `python3`. Bila sumber data ada di tempat lain:
`SEED_SOURCE=/jalur/ke/eksplorasi npm run db:seed`.

Angka yang seharusnya muncul setelah muat (halaman Brightspace 14 November 2026):

| SPBU | Lahan | Lahan kosong | Okupansi | Kosong bertarif | Potensi sewa bertarif |
| --- | --- | --- | --- | --- | --- |
| 6.627 | 33.990 | 5.917 | 82,6% | 3.902 | Rp 113.189.677.374 |

`supabase/seed/` memuat nama tenant dan nilai kontrak, jadi tidak ikut di-commit.

### Skema

| Objek | Isi |
| --- | --- |
| `spbu` | SPBU, alamat, koordinat, fasilitas. |
| `lahan` | Lahan NFR per SPBU: status, segmen, luas, daya, tarif, dan kontrak terakhir dari file master. |
| `area_sekitar` | Titik keramaian di sekitar SPBU menurut Brightspace. |
| `v_ringkasan` | Angka ringkas untuk beranda. |
| `v_peluang_provinsi`, `v_peluang_kota` | Lahan kosong dan potensi sewa per wilayah. |
| `v_tenant_profil` | Profil tenant yang diturunkan dari lahan yang disewanya: jenis usaha, sebaran, luas, daya, tarif. |
| `kecocokan(...)` | Inti Mesin kecocokan: menilai pasangan lahan kosong dan tenant. Aturan dan bobotnya tertulis di komentar fungsi. |
| `daftar_spbu`, `profil_spbu`, `daftar_tenant`, `profil_tenant`, `daftar_lahan_kosong`, `kecocokan_lahan`, `kecocokan_tenant`, `wilayah` | Fungsi yang dipanggil halaman. Masing-masing mengembalikan jsonb; satu halaman, satu panggilan. |

| `spbu_lingkungan`, `poi_sekitar` | Fitur lingkungan dan tipe lokasi per SPBU, serta tempat penting terdekat (data terbuka). |
| `tempat_peta`, `peta_spbu()` | Semua tempat Overture dalam 1 km dari tiap SPBU, untuk peta di Profil lokasi. Satu baris per SPBU. |
| `m_afinitas_tipe` | Seberapa sering tiap jenis usaha hadir di tiap tipe lokasi (materialized view, disegarkan saat muat). |
| `v_peluang_tipe` | Lahan kosong dan potensi sewa per tipe lokasi. |
| `playbook()` | Statistik tiap jenis usaha untuk modul Playbook. |
| `calon_tenant` | Calon tenant dari formulir publik atau dicatat tim NFR. |
| `peluang`, `peluang_syarat`, `peluang_riwayat` | Pipeline: satu lahan untuk satu pihak, 14 butir persyaratan, dan riwayat tahap. |
| `calon_*`, `peluang_*`, `kecocokan_calon`, `penawaran` | Fungsi halaman tahap 3 (baca dan tulis). |
| `daftar_calon`, `hasil_calon` | Dua fungsi yang terbuka untuk umum; lihat "Halaman publik". |

Setelah menarik perubahan yang membawa berkas baru di `supabase/migrations/`, jalankan `npm run db:schema`,
lalu `npm run db:lingkungan` bila migrasinya menyangkut data lingkungan. Data utama tidak perlu dimuat ulang.

Catatan data:

- Sumber memuat 6 lahan dua kali. Semua baris tetap dimuat agar angka sama dengan dasbor analisis;
  baris kedua ditandai `duplikat = true`. Daftar lahan untuk pengguna sebaiknya memakai
  `where not duplikat`.
- Nama tenant di file master ditulis tidak seragam. Kolom `lahan.tenant_kunci` menyamakan huruf besar-kecil dan
  tanda baca, sehingga 3.793 nama menjadi 3.654 tenant. Ejaan yang benar-benar berbeda belum digabung.
- 3 SPBU tidak punya kota dan semuanya tanpa lahan. Pada data 3 November ada 396 SPBU berprovinsi "Tidak diketahui"
  karena server sumber mengirim halaman kosong; sejak data 14 November tidak ada lagi.
- 422 SPBU belum punya koordinat. Ini perlu dilengkapi sebelum data eksternal ditempelkan.

### Keamanan data

- **Organisasi dan peran.** Setiap pengguna butuh keanggotaan di satu organisasi (`organisasi`, `keanggotaan`).
  Hanya anggota organisasi NFR yang bisa membaca data; auditor membaca saja. Akun tenant dan dealer belum melihat
  data apa pun dan diarahkan ke `/ruang-kerja`. Pengguna baru tanpa keanggotaan tidak melihat apa-apa.
  Admin NFR mengatur organisasi dan anggota di halaman `/organisasi`: akun dibuat dulu di dasbor Supabase
  (Authentication, Users), lalu dihubungkan ke organisasi lewat emailnya.
- **Wewenang SPBU.** Pemilik aset, penyetuju, pihak kontrak, dan penerima sewa tiap SPBU diisi di Profil lokasi,
  lalu dipastikan orang lain. Penawaran baru boleh terbit setelah itu.
- **Portal dealer.** Anggota organisasi dealer hanya melihat SPBU yang ditautkan ke organisasinya, dan memutuskan
  usulan tenant hanya bila organisasinya penyetuju yang sah.
- **Portal tenant.** Anggota organisasi tenant hanya melihat penawaran yang dibagikan ke organisasinya dan sudah
  punya versi terbit, lewat fungsi yang memilih kolom aman. Tabel NFR tetap tertutup bagi mereka.
- **Row Level Security** aktif di semua tabel. Role `anon` hanya bisa memanggil dua fungsi formulir publik.
- **Tabel alur komersial tidak bisa ditulis langsung.** Calon tenant, peluang, persyaratan, dan riwayat hanya
  berubah lewat fungsi basis data yang memeriksa peran, mengambil pelaku dari sesi, dan mencatat jejak audit.
- **Jejak audit** (`audit_peristiwa`) hanya bertambah: baris tidak bisa diubah, dihapus, atau dikosongkan.
- `supabase/seed/` memuat nama tenant dan nilai kontrak, jadi tidak ikut di-commit.
- **Lahan baru boleh ditawarkan resmi setelah terverifikasi.** Tahap penawaran mensyaratkan lahan tersedia dan
  inspeksi lokasinya (dengan foto bukti) sudah diterima admin atau penyetuju NFR yang bukan pemeriksanya.
- **Alur 12 tahap dijaga basis data.** Syarat masuk tiap tahap, penawaran berversi, persetujuan empat pihak yang
  terikat versi, serta pencatatan tanda tangan dan mulai beroperasi dijelaskan di `docs/bright-match-2.0.md`.
- **Foto inspeksi** hanya bisa dibuka anggota NFR yang masuk. Token `R2_*` di server harus berizin tulis.
- **Dokumen peluang** (PDF, JPEG, PNG, paling besar 24 MB) disimpan di bucket yang sama di awalan `dokumen/`.
  Berkas di atas 4 MB diunggah dan disimpan berpotongan 3,5 MB, lalu disatukan saat dibuka.
  Dibuka lewat `/dokumen/<id>`, yang memeriksa hak tiap permintaan: tim NFR, tenant penerima penawaran, atau
  pengelola SPBU, sesuai keterlihatan dokumennya.
- Tetap matikan pendaftaran mandiri di dasbor Supabase.

## Struktur

```
src/app/(app)/         halaman di dalam kerangka aplikasi (butuh login)
src/app/login/         halaman masuk dan server action masuk/keluar
src/components/        komponen tampilan
src/lib/data.ts        kueri beranda dan Peta peluang, serta pembungkus pemanggilan fungsi basis data
src/lib/data-tahap1.ts kueri Profil lokasi, Profil tenant, dan Mesin kecocokan
src/lib/data-tahap2.ts kueri peluang per tipe lokasi dan Playbook
src/lib/kecocokan.ts   penjelasan skor dalam kalimat
src/lib/tipe-lokasi.ts nama dan arti tiap tipe lokasi
src/lib/playbook.ts    isi naratif Playbook (segmen pelanggan, alur kunjungan, bukti survei)
src/lib/data-tahap3.ts kueri calon tenant, pipeline, dan kartu penawaran
src/lib/istilah.ts     pilihan dan label: jenis usaha, kanal, tahap, provinsi
src/lib/gambar.ts      alamat foto di object storage; src/lib/data-gambar.ts kuerinya
src/components/galeri.tsx  thumbnail foto dan penampil layar penuh
src/app/aksi.ts        semua penulisan data (server action)
src/app/daftar/        formulir publik "Jadi Bright Partner" dan halaman hasilnya (tanpa login)
src/lib/modules.ts     daftar modul NFR dan statusnya
src/lib/supabase/      klien Supabase untuk server dan proxy
supabase/migrations/   skema basis data
supabase/lingkungan/   data lingkungan hasil olahan (ikut di-commit; bukan data kontrak)
supabase/gambar/       daftar foto Brightspace (ikut di-commit; berkas fotonya ada di object storage)
scripts/               ekspor data dan pembungkus psql
scripts/eksternal/     unduh data terbuka dan hitung fitur lingkungan
data/eksternal/        unduhan mentah (tidak di-commit)
```

## Modul

| Modul | Tahap | Status |
| --- | --- | --- |
| Peta peluang | 1 | Tersedia |
| Profil lokasi | 1–2 | Tersedia, termasuk tipe lokasi, lingkungan dari data terbuka, dan peta sekitar SPBU |
| Profil tenant | 1 | Tersedia; formulir tenant baru menyusul di tahap 3 |
| Mesin kecocokan | 1–2 | Tersedia (versi 2, enam komponen) |
| Playbook jenis usaha | 2 | Tersedia untuk enam jenis usaha |
| Kartu penawaran | 3 | Tersedia, dua bahasa, cetak ke PDF |
| Pipeline calon tenant | 3 | Tersedia: peluang, checklist persyaratan, calon tenant |

Untuk mengaktifkan modul: bangun halamannya di `src/app/(app)/<modul>/`, lalu ubah `siap` menjadi
`true` di `src/lib/modules.ts`.

## Data lingkungan (tahap 2)

Tipe lokasi dan fitur lingkungan tiap SPBU dihitung dari dua sumber terbuka, di luar basis data:

| Sumber | Isi | Lisensi |
| --- | --- | --- |
| [Overture Maps](https://docs.overturemaps.org/attribution/), rilis 2026-10-21.0 | 3,16 juta titik tempat di wilayah Indonesia; 2,14 juta dipakai (keyakinan ≥ 0,5) | Per sumber: CDLA Permissive 2.0, Apache 2.0, CC0 |
| [WorldPop](https://hub.worldpop.org/project/categories?id=3) 2026, sel 1 km | Jumlah penduduk; total 286,8 juta jiwa | CC BY 4.0 |

Hasil olahannya sudah ada di `supabase/lingkungan/`, jadi anggota tim lain cukup menjalankan
`npm run db:lingkungan`. Untuk menghitung ulang (misalnya setelah koordinat SPBU diperbaiki):

```bash
npm run data:overture     # unduh ± 150 MB ke data/eksternal/overture (bisa dilanjutkan bila putus)
# unduh raster WorldPop ke data/eksternal/worldpop (alamatnya ada di scripts/eksternal/fitur_lingkungan.py)
npm run data:lingkungan   # hitung fitur dan tipe lokasi → supabase/lingkungan/*.csv
npm run data:peta         # titik tempat per SPBU untuk peta → supabase/lingkungan/tempat_peta.csv.gz
npm run db:lingkungan     # muat ke basis data
```

Butuh `pyarrow`, `numpy`, dan `Pillow`.

**Cakupan.** 6.565 dari 6.627 SPBU mendapat data lingkungan, mencakup 5.898 dari 5.917 lahan kosong. Yang tidak
tercakup: 32 SPBU tanpa koordinat lengkap, 4 SPBU dengan koordinat di luar Indonesia, dan 26 SPBU yang koordinatnya
lebih dari 150 km dari SPBU sekotanya.

**Tipe lokasi.** Sembilan tipe: kampus, perkantoran, komersial, wisata, industri, pusat kota, perumahan, luar kota,
campuran. Tipe ditentukan dari kelompok tempat yang porsinya paling menonjol dalam 1 km dibanding rata-rata jaringan,
dengan kepadatan penduduk sebagai penentu bila tidak ada yang menonjol. Aturan dan ambangnya ada di
`scripts/eksternal/fitur_lingkungan.py`.

**Mutu.** Tipe lokasi belum diuji lapangan. Uji silang dengan catatan lingkungan Brightspace (1.196 SPBU) menunjukkan
arah yang benar tetapi lemah: SPBU yang dicatat dekat hotel 1,9× lebih sering bertipe wisata, dekat stasiun 2,8×
lebih sering bertipe pusat kota, dekat perkantoran hanya 1,1× lebih sering bertipe perkantoran. Kelas jalan
(OpenStreetMap), Foursquare, dan BPS belum dipakai; "luar kota" saat ini disimpulkan dari sepinya tempat usaha dan
penduduk, bukan dari kelas jalan.

**Atribusi.** Halaman yang menampilkan data ini mencantumkan "Overture Maps Foundation" dan "WorldPop (CC BY 4.0)".

### Peta sekitar SPBU

Halaman Profil lokasi menampilkan peta semua tempat Overture dalam 1 km dari SPBU: 1,12 juta tempat untuk
6.565 SPBU, paling banyak 2.671 di satu SPBU. SPBU tanpa koordinat yang layak tidak punya peta.

- **Data.** `scripts/eksternal/peta_tempat.py` memakai SPBU dan saringan yang sama dengan `fitur_lingkungan.py`,
  lalu menulis satu baris per SPBU. Tiap tempat disimpan sebagai `[dx, dy, kelompok, nama]`, dengan `dx` dan `dy`
  dalam meter dari SPBU. Tabel `tempat_peta` berukuran ± 34 MB.
- **Warna.** Hanya tiga rumpun yang berwarna (tempat makan, pertokoan, pusat kegiatan); sisanya abu-abu. Pada peta
  sebar, lebih dari tiga warna tidak bisa dibedakan dengan andal. Rincian sembilan kelompok dilihat dengan menyorot
  satu kelompok. Daftar kelompok ada di `src/lib/peta.ts` dan harus sama urutannya dengan skrip.
- **Peta dasar.** Ubin OpenStreetMap, dimuat langsung oleh peramban dan dibuat abu-abu. Cukup untuk pemakaian
  ringan; untuk pemakaian luas, isi `NEXT_PUBLIC_PETA_UBIN` dengan penyedia ubin berlangganan. Pustaka: Leaflet.
- **Batas.** Overture adalah data terbuka: bisa tertinggal dari lapangan, dan tempat dengan keyakinan di bawah 0,5
  tidak ditampilkan. Kelompok "Lainnya" memuat kategori yang belum dipetakan, misalnya tempat ibadah dan bengkel.

## Foto SPBU dan lahan

Foto dari Brightspace tampil di daftar SPBU dan daftar lahan kosong (thumbnail per baris), Profil lokasi (foto SPBU
beserta waktu unggahnya, dan thumbnail tiap lahan kosong maupun tersewa), Profil tenant (foto lahan yang disewa,
terbaru dulu, dan thumbnail di tabel kontrak), Kartu rekomendasi lahan, dan Kartu penawaran (tiga foto, ikut tercetak). Setiap thumbnail membuka penampil foto layar penuh. Yang tersedia: 69.220 tautan foto ke 46.590 berkas, untuk 33.957 dari
33.990 lahan dan 2.881 SPBU. Sisanya memang belum punya foto di Brightspace; 102 foto tidak bisa diambil dari sumber.

- **Berkas.** Disimpan di Cloudflare R2 sebagai WebP dua ukuran: `brightspace/<aa>/<sha256>.webp` (sisi terpanjang
  1.600 px) dan `…-480.webp` (thumbnail). Nama berkas adalah hash isi aslinya, jadi tidak pernah berubah dan boleh
  disimpan lama di cache. Diunduh dan diunggah oleh `brightspace_gambar.py` dan `unggah_r2.py` di folder induk.
- **Basis data.** Tabel `gambar` hanya menyimpan kunci objek dan tautannya ke SPBU dan lahan (`spbu_id`, `lahan_id`),
  ± 20 MB. Fungsi `gambar_spbu` dan `gambar_lahan` mengembalikan foto untuk satu halaman detail;
  `gambar_daftar` mengambil foto untuk satu halaman daftar (paling banyak 100 SPBU dan 100 lahan) sekaligus;
  `gambar_tenant` mengambil satu foto per lahan yang disewa tenant (paling banyak 60, terbaru dulu).
- **Alamat.** Foto disajikan lewat rute aplikasi `/foto/<kunci>` (`src/app/foto/[...kunci]/route.ts`). Server
  mengambil berkasnya dari R2 lewat jalur API dengan kredensial `R2_*`, lalu meneruskannya dengan cache satu tahun.
  Alasannya: alamat publik `r2.dev` diblokir di sebagian jaringan Indonesia (DNS-nya diarahkan ke halaman blokir
  Komdigi), sedangkan jalur API R2 tidak. Isi `NEXT_PUBLIC_GAMBAR_URL=/foto`. Di Vercel, isi juga keempat `R2_*`;
  cukup dengan token "Object Read only". Bila bucket kelak dipasangi domain sendiri, isi `NEXT_PUBLIC_GAMBAR_URL`
  dengan domain itu dan foto diambil langsung dari bucket. Bila kosong, aplikasi berjalan tanpa foto.
- **Keterbukaan.** Daftar foto hanya bisa dibaca pengguna yang sudah masuk. Berkasnya sendiri bisa diambil siapa pun
  yang tahu alamatnya (alamat berisi hash 64 karakter dan tidak bisa ditebak), sama seperti di server berkas
  Brightspace. Rute `/foto` hanya melayani kunci berpola `brightspace/<aa>/<sha256>[-480].webp`.

Memperbarui setelah foto diunduh ulang:

```bash
python ../unggah_r2.py    # unggah berkas yang belum ada di bucket
npm run data:gambar       # ringkas ../out/gambar/manifest.csv → supabase/gambar/gambar.csv.gz
npm run db:gambar         # muat ke basis data
```

## Mesin kecocokan versi 2

Dua arah: `/kecocokan/lahan/<id>` (tenant untuk satu lahan kosong) dan `/kecocokan/tenant/<id>` (lahan kosong untuk
satu tenant). Keduanya memakai fungsi `public.kecocokan` yang sama.

- **Syarat wajib.** Luas, posisi, daya, dan tarif lahan dibandingkan dengan rentang yang biasa dipakai tenant.
  Tenant harus sudah beroperasi di provinsi lahan, belum ada di SPBU itu, dan jenis usahanya sudah terbukti di lahan
  sejenis. Data yang kosong tidak menggugurkan; pasangannya ditandai "perlu dicek".
- **Skor 0–100, enam komponen.**

  | Komponen | Poin | Dasar |
  | --- | --- | --- |
  | Tipe lokasi | 25 | Seberapa sering jenis usaha tenant hadir di tipe lokasi SPBU dibanding seluruh jaringan |
  | Bukti dari jaringan | 20 | Lahan sejenis yang disewa jenis usaha itu, dan kehadiran tenant di kota atau provinsi |
  | Permintaan | 20 | Peringkat penduduk dalam 3 km dan jumlah tempat usaha dalam 1 km |
  | Pelengkap bauran | 15 | Jenis usaha tenant belum ada di SPBU itu |
  | Kecocokan harga | 10 | Tarif lahan dibanding yang biasa dibayar tenant |
  | Kesiapan lahan | 10 | Kelengkapan data tarif, daya, luas, fasilitas, koordinat |

  SPBU tanpa data lingkungan mendapat nilai tengah untuk tipe lokasi dan permintaan.
- **Usaha sejenis di sekitar.** Jumlah usaha sejenis dalam 500 m ditampilkan di tiap alasan, tetapi belum masuk skor.
  Usaha sejenis di dekat SPBU bisa berarti persaingan maupun tanda permintaan; arahnya baru bisa dipastikan dari pilot.
- **Status angka.** Bobot dan ambang masih usulan. Kalibrasinya memakai hasil pilot: pasangan yang benar-benar
  menjadi kontrak. Volume BBM per SPBU, bila tersedia, akan menggantikan sebagian komponen permintaan.

## Playbook jenis usaha

Enam jenis usaha: F&B grab-and-go, minimarket, perbankan dan ATM, perawatan kendaraan, logistik dan loker paket,
kesehatan dan jasa pribadi. Tiap halaman menggabungkan dua hal:

- **Angka dari jaringan** (fungsi `playbook()`): sebaran, luas dan sewa yang biasa dipakai, tenant terbesar, dan
  tipe lokasi yang cocok.
- **Isi naratif** (`src/lib/playbook.ts`): segmen pelanggan, alur kunjungan, hal yang perlu disiapkan, risiko, dan
  bukti dari survei 73 responden. Bagian ini usulan awal yang belum divalidasi lewat pengamatan lapangan.

## Calon tenant, pipeline, dan kartu penawaran (tahap 3)

**Alur.** Calon tenant masuk lewat formulir publik atau dicatat tim. Mesin kecocokan menampilkan lahan kosong yang
memenuhi kebutuhannya. Tim memilih satu lahan dan menjadikannya peluang; peluang juga bisa dibuat untuk tenant
eksisting dari kartu rekomendasi lahan. Peluang berjalan melalui enam tahap (baru, dihubungi, survei lokasi,
penawaran, negosiasi, kontrak) atau dibatalkan, dan setiap perpindahan tercatat di riwayat.

**Persyaratan.** Tiap peluang punya 14 butir: lima untuk calon tenant, empat untuk pemilik atau pengelola SPBU, lima
untuk Pertamina. Tahap kontrak ditolak selama masih ada butir yang belum dicentang. Aturannya ada di fungsi
`peluang_ubah_tahap`; daftar butirnya di `peluang_buat`.

**Kecocokan calon tenant.** Rumus skornya sama dengan tenant eksisting. Bedanya, kebutuhan calon dinyatakan sendiri,
jadi dipakai apa adanya tanpa toleransi, dan anggarannya menjadi batas atas tarif.

**Kartu penawaran** (`/penawaran/<lahan>`). Satu halaman per lahan kosong: ruang, sewa, lokasi, dan SPBU-nya. Bila
dibuka dengan `?tenant=<id>` atau `?calon=<id>`, kartu memuat alasan kecocokan untuk pihak itu. `?bahasa=en` untuk
versi Inggris. Tombol "Cetak atau simpan PDF" membuka dialog cetak peramban; tata letak cetaknya A4. Kartu sengaja
tidak memuat nama tenant lain atau nilai kontrak. Skema investasi selain sewa belum ada datanya, jadi kartu hanya
menyebut bahwa skema lain dibahas bersama tim.

**Data pipeline aman dari muat ulang.** Tabel tahap ini tidak merujuk ke `spbu` atau `lahan` lewat foreign key, jadi
`npm run db:seed` tidak menghapusnya. Peluang menyimpan salinan kode lahan dan nomor SPBU.

### Halaman publik

`/daftar` dan `/daftar/<token>` bisa dibuka tanpa login. Keduanya hanya memakai dua fungsi basis data yang diberikan
ke role `anon`:

| Fungsi | Yang dilakukan | Yang dikembalikan |
| --- | --- | --- |
| `daftar_calon(jsonb)` | Memvalidasi dan menyimpan satu calon tenant | Token pendaftaran |
| `hasil_calon(uuid)` | Mencari lahan cocok bagi pemegang token | Ringkasan kebutuhan pendaftar dan sepuluh lahan kosong: kode, kota, luas, posisi, daya, tarif, tipe lokasi, skor |

Tabel `calon_tenant` sendiri tetap tertutup bagi `anon`. Yang perlu diketahui sebelum formulir ini dibuka ke internet:

- Pengaman terhadap pendaftaran beruntun masih sederhana: kolom jebakan di formulir dan batas 30 pendaftaran publik
  per jam di basis data. Belum ada CAPTCHA atau pembatasan per alamat IP.
- Tautan hasil memakai token acak. Siapa pun yang memegang tautannya bisa melihat hasil itu.
- Data lahan yang ditampilkan sama dengan yang tampil di marketplace Brightspace.

## Catatan Next.js 16

- `cacheComponents` aktif. Komponen yang membaca data pengguna harus berada di dalam `<Suspense>`.
- Middleware sekarang bernama Proxy (`src/proxy.ts`).
- Setelah memindahkan rute, jalankan `npm run typecheck` agar tipe rute dibuat ulang.
- Untuk data yang tidak ditemukan, halaman menampilkan `<TidakDitemukan />` langsung. `notFound()` yang dipanggil
  setelah halaman mulai mengalir menghasilkan halaman kosong di mode dev.
- `params` dan `searchParams` hanya dibaca di dalam komponen yang dibungkus `<Suspense>`, tidak di komponen halaman.
- Server action yang mengubah data tanpa berpindah halaman memanggil `refresh()` dari `next/cache`; tanpa itu
  tampilan tetap memakai data lama.
- React mengosongkan formulir setelah aksinya selesai. Formulir yang bisa ditolak validasi mengembalikan isiannya
  lewat status aksi (lihat `form-calon.tsx`).
- Error mode dev tertentu hanya muncul di terminal `next dev`, tidak di `.next/dev/logs`.

## Temukan peluang (Smart Discovery)

Pintu depan tanpa akun di `/temukan`: memilih peran (mencari lokasi usaha atau mengelola SPBU), menjawab kuesioner,
lalu melihat rekomendasi: lokasi yang sesuai untuk calon tenant (`/temukan/tenant/hasil`) dan jenis usaha per ruang
untuk pengelola SPBU (`/temukan/dealer/hasil`). Keempat fase rancangannya sudah dibangun: fondasi, rekomendasi,
tindakan (preferensi per akun, perbandingan, minat), dan penyempurnaan (analitik, umpan balik, aksesibilitas).

- Kuesioner berversi: `src/lib/temukan/` (pertanyaan, percabangan, pemeriksa jawaban).
- Antarmuka: `src/components/temukan/`, rute `src/app/temukan/`.
- Sesi anonim: migrasi `supabase/migrations/20261206000000_temukan.sql`, uji `supabase/tests/temukan.sql`.
- Rekomendasi: migrasi `20261207000000_temukan_rekomendasi.sql`, rumus preferensi `src/lib/temukan/rekomendasi.ts`.
  Mesin kecocokannya tetap satu (`kecocokan()`), dengan parameter `p_profil` untuk pengunjung.
- Tindakan: migrasi `20261208000000_temukan_aksi.sql`. Minat dari Temukan peluang masuk ke halaman Minat lokasi
  tim NFR yang sudah ada; minat tidak membuat peluang.
- Analitik: migrasi `20261209000000_temukan_analitik.sql`, halaman `/analitik-temukan` untuk tim NFR. Tanpa
  identitas pengguna; peristiwa dan umpan balik dihapus setelah 180 hari.
- Rinciannya ada di `docs/bright-match-2.0.md`, serah terima irisan ketujuh belas sampai kedua puluh.
