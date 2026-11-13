-- Muat ulang data lingkungan dari supabase/lingkungan/ (hasil scripts/eksternal/fitur_lingkungan.py dan peta_tempat.py).
-- Dijalankan dari akar proyek lewat scripts/db.sh (perintah: npm run db:lingkungan). Aman diulang.

\set ON_ERROR_STOP on

begin;

truncate public.poi_sekitar, public.spbu_lingkungan restart identity;

-- Dimuat lewat tabel sementara agar SPBU yang sudah tidak ada di basis data dilewati, bukan menggagalkan muat.
create temp table _lingkungan (like public.spbu_lingkungan) on commit drop;
\copy _lingkungan (spbu_id, tipe_lokasi, tipe_kedua, poi_500m, poi_1km, kampus_1km, sekolah_1km, kantor_1km, belanja_1km, kuliner_1km, wisata_1km, industri_1km, kesehatan_1km, transportasi_1km, minimarket_500m, fnb_500m, bank_500m, otomotif_500m, logistik_500m, apotek_500m, minimarket_1km, spbu_lain_1km, ev_1km, penduduk_km2, penduduk_3km, pct_penduduk, pct_aktivitas, sumber_tempat, sumber_penduduk, dihitung) from 'supabase/lingkungan/spbu_lingkungan.csv' with (format csv, header true)
insert into public.spbu_lingkungan select l.* from _lingkungan l join public.spbu s on s.id = l.spbu_id;

create temp table _poi (spbu_id text, nama text, jenis text, jarak_m integer) on commit drop;
\copy _poi from 'supabase/lingkungan/poi_sekitar.csv' with (format csv, header true)
insert into public.poi_sekitar (spbu_id, nama, jenis, jarak_m)
select p.spbu_id, p.nama, p.jenis, p.jarak_m from _poi p join public.spbu s on s.id = p.spbu_id;

commit;

analyze public.spbu_lingkungan, public.poi_sekitar;

-- Titik untuk peta sekitar SPBU. Dilewati bila berkasnya belum dibuat (npm run data:peta).
\if :ada_peta
begin;
truncate public.tempat_peta;
create temp table _peta (spbu_id text, jumlah integer, titik jsonb) on commit drop;
\copy _peta from program 'gzip -dc supabase/lingkungan/tempat_peta.csv.gz' with (format csv, header true)
insert into public.tempat_peta (spbu_id, jumlah, titik)
select p.spbu_id, p.jumlah, p.titik from _peta p join public.spbu s on s.id = p.spbu_id;
commit;
analyze public.tempat_peta;
\else
\echo 'Peta sekitar dilewati: supabase/lingkungan/tempat_peta.csv.gz belum ada.'
\endif

-- Afinitas jenis usaha × tipe lokasi dihitung ulang dari data yang baru dimuat.
refresh materialized view public.m_afinitas_tipe;

\echo
\echo 'Tipe lokasi setelah muat:'
select tipe_lokasi, spbu, lahan_kosong, okupansi_pct from public.v_peluang_tipe order by spbu desc;
