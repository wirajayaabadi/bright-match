# Uji coba satu SPBU: panduan langkah

Untuk tim NFR yang akan menjalankan Bright Match pertama kali dengan data dan orang yang nyata. Tujuannya satu:
membawa satu ruang kosong dari "tercatat kosong di Brightspace" sampai "menunggu persetujuan tenant", dan mencatat
di mana alurnya macet. Disusun 17 November 2026.

Uji coba ini butuh empat orang: dua anggota NFR (salah satunya admin atau penyetuju), satu orang dari pengelola
SPBU, dan satu orang dari calon tenant. Semua langkah di bawah mencatat jejak audit yang tidak bisa dihapus, jadi
isi dengan data yang benar.

## Sudah digladikan

Seluruh langkah di bawah sudah dijalankan berurutan oleh empat akun tiruan di basis data (`npm run db:test`, berkas
`gladi_pilot.sql`), lalu dibatalkan. Aturan dan hak tiap peran tersambung dari langkah 1 sampai outlet beroperasi.
Yang belum pernah dicoba: tombol dan formulir pada jalur berhasil di peramban, unggah berkas di tengah alur, dan
kamera ponsel. Bila ada yang macet di uji coba, kemungkinan besar di sana.

## Yang harus siap sebelum mulai

| Yang dibutuhkan | Dari mana |
| --- | --- |
| Wewenang SPBU: pola (COCO, DODO, CODO), pemilik aset, penyetuju tenant, pihak yang menandatangani kontrak, penerima sewa, dan nomor dokumennya | Arsip perjanjian SPBU. **Tidak ada di Brightspace maupun file master.** |
| Akun untuk pengelola SPBU dan calon tenant | Dibuat admin di dasbor Supabase (Authentication, Users) |
| Calon tenant yang sungguh berminat pada satu ruang | Tim wilayah |
| Ponsel dengan kamera untuk pengelola SPBU | Pengelola SPBU |

## Calon SPBU

Sembilan SPBU di tiga kota pilot dengan ruang kosong terbanyak yang datanya bersih: tanpa temuan data terbuka, luas,
daya, dan tarif tercatat, sudah punya foto, dan lingkungannya terhitung. Angka dari data Brightspace per
14 November 2026 dan file master per 2 November 2026.

| Kota | SPBU | Ruang kosong bersih | Tarif Brightspace per tahun | Foto SPBU |
| --- | --- | --- | --- | --- |
| Jakarta Selatan | 3412504, Jl. Ampera | 12 | Rp 361 juta | Belum ada |
| Jakarta Selatan | 3112402, Jl. RS Fatmawati 16 | 8 | Rp 497 juta | Belum ada |
| Jakarta Selatan | 3412304, Jl. Raya Bintaro Permai | 8 | Rp 232 juta | 5 |
| Kota Tangerang | 3415121, Jatiuwung Pasar Kemis | 7 | Rp 623 juta | 5 |
| Kota Tangerang | 3415138, Tol Jakarta Merak km 13,5 | 7 | Rp 515 juta | 3 |
| Kota Tangerang | 3415110, Jl. Raya Ciledug | 5 | Rp 169 juta | 5 |
| Kota Semarang | 4450138, Jl. Sarwo Edi Wibowo 70 | 5 | Rp 63 juta | Belum ada |
| Kota Semarang | 4150202, Jl. Sultan Agung | 4 | Rp 276 juta | Belum ada |
| Kota Semarang | 4450123, Jl. Siliwangi | 4 | Rp 67 juta | 2 |

Tarif di atas adalah jumlah tarif Brightspace ruang kosong yang bersih, bukan pendapatan. Pilih SPBU yang
pengelolanya paling mudah dihubungi; kebersihan datanya sudah setara.

Catatan untuk SPBU 3415138: ruang `3415138-IN-006` (kasus di master prompt) **tidak termasuk** yang bersih, karena
kodenya dipakai 10 ruang. Bila ingin menguji alur temuan data, mulai dari ruang itu di halaman Validasi data.

## Langkah

Tanda siapa yang mengerjakan: **A** = analis NFR, **P** = admin atau penyetuju NFR (orang yang berbeda dari A),
**D** = pengelola SPBU, **T** = calon tenant.

| # | Siapa | Di mana | Yang dilakukan | Berhasil bila |
| --- | --- | --- | --- | --- |
| 1 | P | Organisasi dan anggota | Buat organisasi dealer untuk pengelola SPBU dan organisasi tenant untuk calon tenant, lalu hubungkan akun mereka | Kedua organisasi tampil dengan anggotanya |
| 2 | A | Profil lokasi, SPBU pilihan, bagian Wewenang | Isi wewenang dari arsip perjanjian; pilih organisasi dealer tadi; centang "organisasi pengelola adalah penyetujunya" hanya bila memang begitu | Status "belum dipastikan" |
| 3 | P | Halaman yang sama | Periksa isinya dengan dokumennya, lalu pastikan | Status "dipastikan" |
| 4 | D | Ponsel, SPBU Anda | Buka SPBU, pilih satu ruang kosong, tekan "Bisa dipakai" | Tercatat tanggal konfirmasinya |
| 5 | D | Ponsel, ruang yang sama | Periksa kesiapan ruang: isi delapan butir, unggah paling sedikit dua foto, ajukan | Status "menunggu tinjauan" |
| 6 | P | Kesiapan lahan | Buka inspeksi itu, bandingkan dengan data Brightspace, lihat fotonya, lalu terima atau kembalikan | Ruang "terverifikasi", dan beranda menunjukkan 1 lahan boleh ditawarkan |
| 7 | A | Mesin kecocokan, ruang yang sama | Pilih calon tenant, jadikan peluang | Skor tercatat beserta potretnya |
| 8 | A | Halaman peluang | Isi pemilik, tindakan berikut, dan tenggat; maju tahap demi tahap sampai survei lokasi | Tiap tahap menolak maju bila syaratnya belum terpenuhi |
| 9 | A | Tab Penawaran, lalu tab Dokumen | Susun versi 1 dengan syarat yang sungguh akan ditawarkan; penerima sewa harus sama dengan wewenang; terbitkan; bagikan ke organisasi tenant; unggah surat penawarannya dan centang "Tenant penerima penawaran" | Versi 1 "berlaku", dan surat penawaran tampil di portal tenant |
| 10 | T | Penawaran untuk Anda | Buka penawaran, baca, hitung kelayakan usahanya di studio kelayakan, usulkan waktu survei, lalu nyatakan berminat atau ajukan pertanyaan. A menetapkan jadwal survei di tab Survei, D menandai sudah tahu | Tanggapan dan usulan survei tampil di halaman peluang NFR; jadwal tampil di portal tenant dan portal pengelola SPBU |
| 11 | A | Halaman peluang | Maju ke penawaran, negosiasi, lalu persetujuan | Empat persetujuan terbuka |
| 12 | T, D, P | Portal masing-masing | Tenant memutuskan; pengelola SPBU memutuskan bila berwenang; P memberi persetujuan NFR | Tiga dari empat persetujuan tercatat |

Persetujuan HSSE masih dicatat tim NFR dengan rujukan bukti, karena belum ada peran HSSE. Uji coba boleh berhenti
di langkah 12. Tanda tangan kontrak hanya dicatat bila kontraknya memang ditandatangani.

**Langkah tambahan setelah langkah 6 (opsional).** P membuka penjelajah lokasi untuk organisasi tenant di
provinsi SPBU itu (Organisasi dan anggota). T membuka "Jelajahi lokasi", menemukan ruang yang baru diverifikasi,
dan menekan "Minati lokasi ini". A melihatnya di "Minat lokasi", lalu melanjutkan ke langkah 7.

## Yang perlu dicatat selama uji coba

Jawabannya menentukan apa yang dibangun berikutnya.

1. **Berapa lama tiap langkah?** Terutama langkah 2 (mencari data wewenang) dan langkah 5 (inspeksi di lokasi).
2. **Di langkah mana orang berhenti dan bertanya?** Tulis pertanyaannya apa adanya.
3. **Data wewenang apa yang tidak bisa ditemukan?** Bila penerima sewa atau penyetuju tidak jelas dari arsip, itu
   temuan tersendiri.
4. **Apakah hasil inspeksi berbeda dari Brightspace?** Luas dan daya yang berbeda menunjukkan mutu data sumber.
5. **Apakah penjelasan kecocokan dimengerti calon tenant?** Minta ia menceritakannya kembali dengan kata-katanya.
6. **Apa yang ingin dilakukan pengelola SPBU atau tenant tetapi tidak ada tombolnya?**

## Bila ada yang salah isi

- Wewenang yang salah: simpan ulang dengan isi yang benar, lalu minta dipastikan lagi.
- Inspeksi yang salah: kembalikan lewat tinjauan dengan catatan, lalu pengelola memperbaiki dan mengajukan lagi.
- Syarat penawaran yang salah: susun dan terbitkan versi baru. Versi lama tidak bisa diubah.
- Peluang yang salah dibuat: akhiri sebagai "dibatalkan" dengan alasan.

Tidak ada yang bisa dihapus dari jejak audit. Itu disengaja.
