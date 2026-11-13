# Bright Match

NFR Commercial Intelligence & Partnership Platform: mencocokkan ruang usaha kosong di SPBU Pertamina
dengan tenant yang tepat. Bagian dari program Bright Partner.

Aplikasi web Next.js 16 (App Router, React 19, Tailwind 4) dengan Supabase sebagai basis data dan
layanan login.

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
| `npm run db:check` | Menampilkan ringkasan isi basis data. |

Semua perintah aman diulang. Butuh `psql` dan `python3`. Bila sumber data ada di tempat lain:
`SEED_SOURCE=/jalur/ke/eksplorasi npm run db:seed`.

Angka yang seharusnya muncul setelah muat (scraping 3 November 2026):

| SPBU | Lahan | Lahan kosong | Okupansi | Kosong bertarif | Potensi sewa bertarif |
| --- | --- | --- | --- | --- | --- |
| 6.627 | 31.861 | 5.574 | 82,5% | 3.693 | Rp 106.336.314.752 |

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
  tanda baca, sehingga 3.645 nama menjadi 3.515 tenant. Ejaan yang benar-benar berbeda belum digabung.
- 3 SPBU tidak punya kota dan 396 SPBU berprovinsi "Tidak diketahui". Semuanya tanpa lahan.
- 422 SPBU belum punya koordinat. Ini perlu dilengkapi sebelum data eksternal ditempelkan.

### Keamanan data

- Semua tabel memakai Row Level Security. Hanya role `authenticated` yang boleh membaca; role `anon`
  tidak punya akses sama sekali.
- View dibuat dengan `security_invoker`, jadi tunduk pada aturan yang sama.
- `src/proxy.ts` mengalihkan pengguna yang belum masuk ke `/login`. Itu pemeriksaan awal; penjaga
  yang sebenarnya adalah aturan di basis data.

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
src/app/aksi.ts        semua penulisan data (server action)
src/app/daftar/        formulir publik "Jadi Bright Partner" dan halaman hasilnya (tanpa login)
src/lib/modules.ts     daftar tujuh modul dan statusnya
src/lib/supabase/      klien Supabase untuk server dan proxy
supabase/migrations/   skema basis data
supabase/lingkungan/   data lingkungan hasil olahan (ikut di-commit; bukan data kontrak)
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

**Cakupan.** 6.171 dari 6.627 SPBU mendapat data lingkungan, mencakup 5.555 dari 5.574 lahan kosong. Yang tidak
tercakup: 427 SPBU tanpa koordinat lengkap, 4 SPBU dengan koordinat di luar Indonesia, dan 25 SPBU yang koordinatnya
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

Halaman Profil lokasi menampilkan peta semua tempat Overture dalam 1 km dari SPBU: 1,06 juta tempat untuk
6.171 SPBU, paling banyak 2.671 di satu SPBU. SPBU tanpa koordinat yang layak tidak punya peta.

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
