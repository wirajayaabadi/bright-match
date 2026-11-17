-- Uji otomatis wewenang SPBU dan portal dealer. Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
-- Bila uji gagal di tengah, psql berhenti tanpa menutup transaksi. Batas ini menutup sesi yang tertinggal,
-- dan membuat uji lain gagal cepat dengan pesan jelas, bukan menggantung menunggu kuncinya.
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000051', 'admin6@uji.invalid'),
  ('00000000-0000-4000-a000-000000000052', 'analis6@uji.invalid'),
  ('00000000-0000-4000-a000-000000000053', 'dealer-admin@uji.invalid'),
  ('00000000-0000-4000-a000-000000000054', 'dealer-operator@uji.invalid'),
  ('00000000-0000-4000-a000-000000000055', 'dealer-lain@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-000000000051', 'Dealer X Uji', 'dealer', true),
  ('00000000-0000-4000-b000-000000000052', 'Dealer Y Uji', 'dealer', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000051', id, 'nfr_admin' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000052', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-000000000053', '00000000-0000-4000-b000-000000000051', 'dealer_admin'),
  ('00000000-0000-4000-a000-000000000054', '00000000-0000-4000-b000-000000000051', 'dealer_operator'),
  ('00000000-0000-4000-a000-000000000055', '00000000-0000-4000-b000-000000000052', 'dealer_admin');

do $_$ begin perform public.deteksi_masalah_data(); end $_$;

-- Dua lahan kosong bersih di dua SPBU berbeda yang belum punya wewenang, status, inspeksi, atau peluang.
create temp table _bahan on commit drop as
with calon as (
  select l.lahan_id, l.spbu_id, row_number() over (partition by l.spbu_id order by l.lahan_id) as urut
  from public.lahan l
  where l.status = 'Tersedia' and not l.duplikat
    and not exists (select 1 from public.masalah_data m where l.lahan_id = any (m.lahan_ids))
    and not exists (select 1 from public.peluang p where p.spbu_id = l.spbu_id)
    and not exists (select 1 from public.status_lahan s where s.spbu_id = l.spbu_id)
    and not exists (select 1 from public.inspeksi_lahan i where i.spbu_id = l.spbu_id)
    and not exists (select 1 from public.hak_spbu h where h.spbu_id = l.spbu_id)
), satu as (select * from calon where urut = 1 order by spbu_id limit 2)
select (select lahan_id from satu order by spbu_id limit 1) as lahan,
       (select spbu_id from satu order by spbu_id limit 1) as spbu,
       (select lahan_id from satu order by spbu_id desc limit 1) as lahan_lain,
       (select spbu_id from satu order by spbu_id desc limit 1) as spbu_lain,
       (select t.id from public.v_tenant_profil t order by t.lahan desc, t.id limit 1) as tenant_id,
       null::uuid as peluang, null::uuid as versi, null::uuid as inspeksi;
grant select, update on _bahan to authenticated;
do $$ begin
  assert (select lahan is not null and lahan_lain is not null and spbu <> spbu_lain from _bahan), 'Bahan uji: butuh dua lahan kosong di dua SPBU berbeda.';
end $$;

-- ---------------------------------------------------------------- analis: mengisi wewenang, tidak boleh memastikan
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000052","email":"analis6@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_s text := (select spbu from _bahan); v_p uuid;
begin
  v := public.hak_spbu_simpan(v_s, '{"pola":"DODO","pemilik_aset":"PT Pemilik Uji","penerima_sewa":"dibagi"}'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Sewa dibagi tanpa pengaturan pembagian harus ditolak.';
  v := public.hak_spbu_simpan(v_s, '{"pola":"DODO","pemilik_aset":"PT Pemilik Uji","organisasi_dealer":"00000000-0000-4000-b000-000000000051"}'::jsonb);
  assert (v ->> 'ok')::boolean, 'Wewenang yang belum lengkap boleh disimpan dulu.';
  v := public.hak_spbu_pastikan(v_s);
  assert not (v ->> 'ok')::boolean, 'Analis tidak boleh memastikan wewenang.';

  -- peluang sampai tahap survei, lalu draf penawaran
  v_p := public.peluang_buat((select lahan from _bahan), null, (select tenant_id from _bahan));
  update _bahan set peluang = v_p;
end $$;
reset role;
insert into public.status_lahan (spbu_id, lahan_id, lahan_kode, status_data, kesiapan, sidik_sumber, diverifikasi, diverifikasi_oleh)
select l.spbu_id, l.lahan_id, l.kode, 'terverifikasi', 'siap', public.sidik_lahan(l), now(), 'persiapan-uji'
from public.lahan l, _bahan b where l.lahan_id = b.lahan and not l.duplikat;
update public.peluang set tahap = 'survei', pemilik = 'analis6@uji.invalid' where id = (select peluang from _bahan);

set local role authenticated;
do $$
declare v jsonb; v_s text := (select spbu from _bahan); v_p uuid := (select peluang from _bahan); v_v uuid;
begin
  v := public.penawaran_simpan(v_p, '{"sewa_tahunan":"36000000","lama_sewa_bulan":"12","skema":"sewa_tetap","penerima_sewa":"pertamina"}'::jsonb);
  v_v := (v ->> 'id')::uuid;
  update _bahan set versi = v_v;
  v := public.penawaran_terbitkan(v_v);
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%Wewenang%', 'Penawaran tidak boleh terbit sebelum wewenang SPBU dipastikan.';
  v := public.hak_spbu_simpan(v_s, '{"pola":"DODO","pemilik_aset":"PT Pemilik Uji","pengelola":"Dealer X Uji","organisasi_dealer":"00000000-0000-4000-b000-000000000051","dealer_berwenang":"false","penyetuju":"Direktur PT Pemilik Uji","pihak_kontrak":"PT Pemilik Uji","penerima_sewa":"pemilik_spbu","dokumen":"Akta dan perjanjian DODO no. 1/UJI"}'::jsonb);
  assert (v ->> 'ok')::boolean, 'Wewenang lengkap harus tersimpan.';
end $$;
reset role;

-- ---------------------------------------------------------------- admin: memastikan wewenang yang diisi orang lain
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000051","email":"admin6@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_s text := (select spbu from _bahan);
begin
  v := public.hak_spbu_pastikan(v_s);
  assert (v ->> 'ok')::boolean and (select status = 'dipastikan' and dipastikan_oleh = 'admin6@uji.invalid' from public.hak_spbu where spbu_id = v_s),
    'Admin harus bisa memastikan wewenang yang diisi orang lain.';
  v := public.hak_spbu_simpan((select spbu_lain from _bahan), '{"pola":"COCO","pemilik_aset":"Pertamina","penyetuju":"Manajer NFR","pihak_kontrak":"Pertamina","penerima_sewa":"pertamina","dokumen":"SK uji","organisasi_dealer":"00000000-0000-4000-b000-000000000052","dealer_berwenang":"true"}'::jsonb);
  v := public.hak_spbu_pastikan((select spbu_lain from _bahan));
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%orang lain%', 'Wewenang tidak boleh dipastikan oleh orang yang mengisinya.';
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000052","email":"analis6@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := (select peluang from _bahan); v_v uuid := (select versi from _bahan);
begin
  v := public.penawaran_terbitkan(v_v);
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%berbeda%', 'Penerima sewa di penawaran harus sama dengan wewenang yang dipastikan.';
  v := public.penawaran_simpan(v_p, '{"sewa_tahunan":"36000000","lama_sewa_bulan":"12","skema":"sewa_tetap","penerima_sewa":"pemilik_spbu"}'::jsonb);
  v := public.penawaran_terbitkan(v_v);
  assert (v ->> 'ok')::boolean, 'Penawaran yang penerima sewanya cocok harus bisa terbit.';
  v := public.peluang_ubah_tahap(v_p, 'penawaran');
  v := public.peluang_ubah_tahap(v_p, 'negosiasi');
  v := public.peluang_ubah_tahap(v_p, 'persetujuan');
  assert (v ->> 'ok')::boolean, 'Peluang harus sampai tahap persetujuan.';
  -- menahan lahan lain oleh NFR, untuk menguji bahwa pengelola tidak bisa melepasnya
  v := public.status_ruang_ubah((select lahan_lain from _bahan), 'ditahan', 'Ditahan tim NFR untuk renovasi.');
end $$;
reset role;

-- ---------------------------------------------------------------- operator dealer X: ruang, konfirmasi, inspeksi
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000054","email":"dealer-operator@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_s text := (select spbu from _bahan); v_l text := (select lahan from _bahan); v_i uuid; v_p uuid := (select peluang from _bahan);
begin
  assert public.dealer_kelola_spbu(v_s) and not public.dealer_kelola_spbu((select spbu_lain from _bahan)), 'Operator hanya mengelola SPBU organisasinya.';
  v := public.dealer_ringkasan();
  assert jsonb_array_length(v -> 'spbu') = 1 and jsonb_array_length(v -> 'persetujuan') = 1 and not (v -> 'persetujuan' -> 0 ->> 'berwenang')::boolean,
    'Ringkasan dealer: satu SPBU, satu usulan menunggu, dan organisasinya tidak berwenang memutuskan.';
  v := public.dealer_spbu_rinci(v_s);
  assert v is not null and jsonb_array_length(v -> 'ruang') >= 1 and v -> 'hak' ->> 'penyetuju' = 'Direktur PT Pemilik Uji', 'Rincian SPBU harus memuat ruang dan penyetujunya.';
  assert v::text not like '%analis6@uji.invalid%' and not (v -> 'hak' ? 'dokumen'), 'Rincian untuk dealer tidak boleh memuat identitas staf NFR atau rujukan dokumen internal.';
  assert public.dealer_spbu_rinci((select spbu_lain from _bahan)) is null, 'SPBU organisasi lain harus tertutup.';
  assert (select count(*) from public.lahan) = 0 and (select count(*) from public.hak_spbu) = 0 and (select count(*) from public.peluang) = 0,
    'Tabel NFR harus tetap tertutup bagi dealer.';

  -- konfirmasi ketersediaan
  v := public.dealer_konfirmasi_ruang(v_l, false);
  assert not (v ->> 'ok')::boolean, 'Menyatakan ruang tidak bisa dipakai wajib beralasan.';
  v := public.dealer_konfirmasi_ruang(v_l, false, 'Sedang dipakai gudang oli.');
  assert (v ->> 'ok')::boolean and public.dealer_spbu_rinci(v_s) -> 'ruang' @> jsonb_build_array(jsonb_build_object('lahan_id', v_l, 'status_ruang', 'ditahan', 'konfirmasi', 'tidak_tersedia')),
    'Ruang yang dinyatakan tidak bisa dipakai harus ditahan.';
  v := public.dealer_konfirmasi_ruang(v_l, true);
  assert public.dealer_spbu_rinci(v_s) -> 'ruang' @> jsonb_build_array(jsonb_build_object('lahan_id', v_l, 'status_ruang', 'tersedia', 'konfirmasi', 'tersedia')),
    'Konfirmasi tersedia harus melepas penahanan yang berasal dari pengelola.';
  v := public.dealer_konfirmasi_ruang((select lahan_lain from _bahan), true);
  assert not (v ->> 'ok')::boolean, 'Ruang di SPBU organisasi lain tidak boleh dikonfirmasi.';

  -- inspeksi oleh operator
  v := public.inspeksi_mulai((select lahan_lain from _bahan));
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%bukan di SPBU%', 'Operator tidak boleh memeriksa lahan di SPBU lain.';
  v := public.inspeksi_mulai(v_l);
  v_i := (v ->> 'id')::uuid;
  assert v_i is not null, 'Operator harus bisa memulai inspeksi di SPBU-nya.';
  update _bahan set inspeksi = v_i;
  assert public.inspeksi_boleh_isi(v_i) and public.inspeksi_boleh_lihat(v_i), 'Pemeriksa boleh mengisi dan melihat foto inspeksinya.';
  v := public.inspeksi_foto_tambah(v_i, 'inspeksi/' || v_i || '/00000000-0000-4000-c000-000000000011.jpg', 800, 600, 1000);
  v := public.inspeksi_foto_tambah(v_i, 'inspeksi/' || v_i || '/00000000-0000-4000-c000-000000000012.jpg', 800, 600, 1000);
  v := public.inspeksi_simpan(v_i, '{"luas_m2":"12","daya_w":"900","air":"tersedia","akses":"mudah","parkir":"cukup","pembatasan":"tidak_ada"}'::jsonb, 'siap');
  v := public.inspeksi_ajukan(v_i);
  assert (v ->> 'ok')::boolean, 'Operator harus bisa mengajukan inspeksinya.';
  v := public.dealer_inspeksi_rinci(v_i);
  assert v ->> 'status' = 'diajukan' and (v ->> 'milik_saya')::boolean and jsonb_array_length(v -> 'foto') = 2, 'Rincian inspeksi harus terbaca pemeriksanya.';
  v := public.inspeksi_tinjau(v_i, 'diterima');
  assert not (v ->> 'ok')::boolean, 'Pengelola SPBU tidak boleh meninjau inspeksi.';

  -- usulan tenant: operator melihat, tidak memutuskan
  v := public.dealer_persetujuan_rinci(v_p);
  assert v is not null and v -> 'syarat' ->> 'sewa_tahunan' = '36000000' and v -> 'hak' ->> 'penerima_sewa' = 'pemilik_spbu' and v -> 'tenant' ? 'nama',
    'Kartu keputusan harus memuat calon tenant, syarat, dan penerima sewa.';
  assert v::text not like '%analis6@uji.invalid%' and not (v ? 'catatan'), 'Kartu keputusan tidak boleh memuat identitas staf atau catatan internal.';
  v := public.dealer_putuskan(v_p, 'disetujui');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%Direktur PT Pemilik Uji%', 'Bila organisasi tidak berwenang, pesan harus menyebut penyetujunya.';
end $$;
reset role;

-- ---------------------------------------------------------------- dealer lain: tidak melihat SPBU dealer X
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000055","email":"dealer-lain@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  assert public.dealer_spbu_rinci((select spbu from _bahan)) is null, 'Dealer lain tidak boleh melihat SPBU dealer X.';
  assert public.dealer_persetujuan_rinci((select peluang from _bahan)) is null, 'Dealer lain tidak boleh melihat usulan di SPBU dealer X.';
  assert public.dealer_inspeksi_rinci((select inspeksi from _bahan)) is null and not public.inspeksi_boleh_lihat((select inspeksi from _bahan)),
    'Dealer lain tidak boleh melihat inspeksi maupun fotonya.';
  v := public.dealer_putuskan((select peluang from _bahan), 'disetujui');
  assert not (v ->> 'ok')::boolean, 'Dealer lain tidak boleh memutuskan usulan di SPBU dealer X.';
  -- penahanan oleh NFR tidak bisa dilepas pengelola
  v := public.dealer_konfirmasi_ruang((select lahan_lain from _bahan), true);
  assert (v ->> 'ok')::boolean and public.dealer_spbu_rinci((select spbu_lain from _bahan)) -> 'ruang' @> jsonb_build_array(jsonb_build_object('lahan_id', (select lahan_lain from _bahan), 'status_ruang', 'ditahan')),
    'Penahanan oleh tim NFR tidak boleh terlepas karena konfirmasi pengelola.';
end $$;
reset role;

-- ---------------------------------------------------------------- admin NFR: meninjau inspeksi dealer; dealer diberi wewenang
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000051","email":"admin6@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.inspeksi_tinjau((select inspeksi from _bahan), 'diterima');
  assert (v ->> 'ok')::boolean, 'Admin NFR harus bisa menerima inspeksi yang diisi pengelola SPBU.';
end $$;
reset role;
-- Wewenang diubah: organisasi dealer kini penyetuju yang sah (disimpan analis, dipastikan admin).
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000052","email":"analis6@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ declare v jsonb; begin
  v := public.hak_spbu_simpan((select spbu from _bahan), '{"pola":"DODO","pemilik_aset":"PT Pemilik Uji","pengelola":"Dealer X Uji","organisasi_dealer":"00000000-0000-4000-b000-000000000051","dealer_berwenang":"true","penyetuju":"Dealer X Uji","pihak_kontrak":"PT Pemilik Uji","penerima_sewa":"pemilik_spbu","dokumen":"Surat kuasa no. 2/UJI"}'::jsonb);
  assert (select status from public.hak_spbu where spbu_id = (select spbu from _bahan)) = 'belum_dipastikan', 'Setiap perubahan wewenang harus dipastikan lagi.';
end $$;
reset role;
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000053","email":"dealer-admin@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ declare v jsonb; begin
  v := public.dealer_putuskan((select peluang from _bahan), 'disetujui');
  assert not (v ->> 'ok')::boolean, 'Wewenang yang belum dipastikan lagi belum memberi hak memutuskan.';
end $$;
reset role;
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000051","email":"admin6@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ begin assert (public.hak_spbu_pastikan((select spbu from _bahan)) ->> 'ok')::boolean, 'Wewenang baru harus bisa dipastikan.'; end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000054","email":"dealer-operator@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ declare v jsonb; begin
  v := public.dealer_putuskan((select peluang from _bahan), 'disetujui');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%admin dealer%', 'Operator tidak boleh memutuskan atas nama organisasi.';
end $$;
reset role;
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000053","email":"dealer-admin@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ declare v jsonb; v_p uuid := (select peluang from _bahan); begin
  assert (public.dealer_ringkasan() -> 'persetujuan' -> 0 ->> 'berwenang')::boolean, 'Setelah dipastikan, organisasi dealer berwenang memutuskan.';
  v := public.dealer_putuskan(v_p, 'minta_revisi', 'pendek');
  assert not (v ->> 'ok')::boolean, 'Permintaan perubahan wajib beralasan.';
  v := public.dealer_putuskan(v_p, 'disetujui');
  assert (v ->> 'ok')::boolean, 'Admin dealer yang berwenang harus bisa menyetujui.';
  v := public.dealer_putuskan(v_p, 'ditolak', 'Berubah pikiran setelah setuju.');
  assert not (v ->> 'ok')::boolean, 'Keputusan dealer yang sudah tercatat tidak bisa diubah.';
end $$;
reset role;

do $$ begin
  assert (select status = 'disetujui' and not atas_nama and penyetuju_email = 'dealer-admin@uji.invalid' and wewenang like 'Admin dealer%'
          from public.persetujuan where peluang_id = (select peluang from _bahan) and pihak = 'dealer' and not gugur),
    'Keputusan admin dealer harus tercatat langsung, bukan atas nama.';
  assert (select count(*) from public.audit_peristiwa where peristiwa in ('wewenang_disimpan', 'wewenang_dipastikan', 'dealer_konfirmasi_ruang')
          and waktu > now() - interval '5 minutes') >= 6, 'Wewenang dan konfirmasi dealer harus tercatat di jejak audit.';
end $$;

rollback;
\echo 'LULUS: semua uji wewenang dan portal dealer (wewenang dipastikan orang lain, syarat terbit penawaran, cakupan SPBU, konfirmasi ruang, inspeksi dealer, keputusan sesuai wewenang).'
