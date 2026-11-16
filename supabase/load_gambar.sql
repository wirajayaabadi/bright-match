-- Muat ulang tabel gambar dari supabase/gambar/gambar.csv.gz (hasil scripts/export_gambar.py).
-- Dijalankan dari akar proyek lewat scripts/db.sh (perintah: npm run db:gambar). Aman diulang.

\set ON_ERROR_STOP on
-- Berkasnya dikirim dari komputer ini; di jaringan lambat batas waktu bawaan bisa terlampaui.
set statement_timeout = '15min';

begin;

truncate public.gambar restart identity;

-- Lewat tabel sementara agar gambar milik SPBU yang sudah tidak ada di basis data dilewati.
create temp table _gambar (
  spbu_id text, lahan_id text, jenis text, urutan integer, label text, diunggah timestamp,
  kunci text, lebar integer, tinggi integer
) on commit drop;
\copy _gambar from program 'gzip -dc supabase/gambar/gambar.csv.gz' with (format csv, header true)

insert into public.gambar (spbu_id, lahan_id, jenis, urutan, label, diunggah, kunci, lebar, tinggi)
select g.spbu_id, g.lahan_id, g.jenis, g.urutan, nullif(g.label, ''), g.diunggah, g.kunci, g.lebar, g.tinggi
from _gambar g join public.spbu s on s.id = g.spbu_id
order by g.spbu_id, g.jenis, g.lahan_id, g.urutan;

commit;

analyze public.gambar;

\echo
\echo 'Gambar setelah muat:'
select jenis, count(*) as gambar, count(distinct kunci) as berkas, count(distinct spbu_id) as spbu,
       count(distinct (spbu_id, lahan_id)) filter (where lahan_id is not null) as lahan
from public.gambar group by jenis order by jenis;
