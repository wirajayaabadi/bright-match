-- Muat ulang seluruh data dari supabase/seed/*.csv.
-- Dijalankan dari akar proyek lewat scripts/db.sh (perintah: npm run db:seed).
-- Aman diulang: isi tabel diganti seluruhnya dalam satu transaksi.

\set ON_ERROR_STOP on

begin;

-- Tabel lingkungan ikut dikosongkan karena merujuk ke spbu; scripts/db.sh memuatnya kembali setelah ini.
truncate public.tempat_peta, public.poi_sekitar, public.spbu_lingkungan, public.area_sekitar, public.lahan, public.spbu restart identity;

\copy public.spbu (id, nomor, nama, alamat, kota, provinsi, lat, lng, koordinat_diperbaiki, fasilitas, jumlah_foto, punya_tur_360, status_listing) from 'supabase/seed/spbu.csv' with (format csv, header true)

\copy public.lahan (lahan_id, spbu_id, kode, status, segmen, luas_m2, daya_w, harga, periode, tarif_tahunan, tarif_per_m2, outlet, deskripsi, tinggi_m, panjang_m, lebar_m, lantai, posisi, duplikat, tenant, kontrak_mulai, kontrak_akhir, kontrak_nilai, kontrak_status, kontrak_baris) from 'supabase/seed/lahan.csv' with (format csv, header true)

\copy public.area_sekitar (spbu_id, nama, kategori, keterangan, jarak_km) from 'supabase/seed/area_sekitar.csv' with (format csv, header true)

commit;

analyze public.spbu, public.lahan, public.area_sekitar;

\echo
\echo 'Ringkasan setelah muat:'
select spbu, lahan, lahan_kosong, okupansi_pct, kosong_bertarif, potensi_sewa_bertarif, tenant from public.v_ringkasan;
