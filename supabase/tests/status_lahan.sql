-- Uji otomatis irisan kedua: tiga status lahan, inspeksi lokasi, tinjauan oleh orang lain,
-- dan syarat "terverifikasi" sebelum penawaran resmi. Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
-- Bila uji gagal di tengah, psql berhenti tanpa menutup transaksi. Batas ini menutup sesi yang tertinggal,
-- dan membuat uji lain gagal cepat dengan pesan jelas, bukan menggantung menunggu kuncinya.
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000011', 'pemeriksa@uji.invalid'),
  ('00000000-0000-4000-a000-000000000012', 'penyetuju@uji.invalid'),
  ('00000000-0000-4000-a000-000000000013', 'tenant2@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values ('00000000-0000-4000-b000-000000000011', 'Tenant Uji 2', 'tenant', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000011', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000012', id, 'nfr_penyetuju' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-000000000013', '00000000-0000-4000-b000-000000000011', 'tenant_admin');

do $_$ begin perform public.deteksi_masalah_data(); end $_$;

create temp table _bahan on commit drop as
select
  (select l.lahan_id from public.lahan l where l.status = 'Tersedia' and not l.duplikat
     and not exists (select 1 from public.masalah_data m where l.lahan_id = any (m.lahan_ids))
     and not exists (select 1 from public.peluang p where p.lahan_id = l.lahan_id)
     and not exists (select 1 from public.status_lahan s where s.lahan_id = l.lahan_id)
     and not exists (select 1 from public.inspeksi_lahan i where i.lahan_id = l.lahan_id)
   order by l.lahan_id limit 1) as lahan,
  (select l.lahan_id from public.lahan l join public.masalah_data m on l.lahan_id = any (m.lahan_ids)
   where l.status = 'Tersedia' and not l.duplikat and m.tingkat = 'kritis' and m.status = 'terbuka'
     and not exists (select 1 from public.inspeksi_lahan i where i.lahan_id = l.lahan_id)
   order by l.lahan_id limit 1) as lahan_sengketa,
  (select l.lahan_id from public.lahan l where l.status = 'Tersewa' and not l.duplikat order by l.lahan_id limit 1) as lahan_terisi,
  (select t.id from public.v_tenant_profil t order by t.lahan desc, t.id limit 1) as tenant_id,
  null::uuid as inspeksi, null::uuid as inspeksi2, null::uuid as peluang;
grant select, update on _bahan to authenticated;

do $$ begin
  assert (select lahan is not null and lahan_sengketa is not null and lahan_terisi is not null from _bahan), 'Bahan uji tidak lengkap.';
  -- keadaan awal: tiga status berdiri sendiri
  assert (select status_ruang = 'tersedia' and status_data = 'belum_diverifikasi' and kesiapan = 'belum_diketahui'
          from public.v_status_lahan where lahan_id = (select lahan from _bahan)), 'Lahan baru: tersedia, belum diverifikasi, kesiapan belum diketahui.';
  assert (select status_data = 'disengketakan' from public.v_status_lahan where lahan_id = (select lahan_sengketa from _bahan)),
    'Lahan dengan temuan kritis harus berstatus data disengketakan.';
  assert (select status_ruang = 'terisi' from public.v_status_lahan where lahan_id = (select lahan_terisi from _bahan)),
    'Lahan tersewa di sumber harus berstatus ruang terisi.';
end $$;

-- ---------------------------------------------------------------- tenant: tidak melihat apa pun
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000013","email":"tenant2@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  assert (select count(*) from public.v_status_lahan) = 0, 'Tenant tidak boleh membaca status lahan.';
  assert (select count(*) from public.inspeksi_lahan) = 0, 'Tenant tidak boleh membaca inspeksi.';
  assert public.lahan_boleh_ditawarkan((select lahan from _bahan)) is null, 'Tenant tidak boleh bertanya soal kelayakan penawaran.';
  v := public.inspeksi_mulai((select lahan from _bahan));
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh memulai inspeksi.';
  v := public.status_ruang_ubah((select lahan from _bahan), 'ditahan', 'alasan yang cukup');
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh menahan lahan.';
end $$;
reset role;

-- ---------------------------------------------------------------- pemeriksa (analis NFR)
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000011","email":"pemeriksa@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare
  v     jsonb;
  v_id  uuid;
  v_p   uuid;
  v_l   text := (select lahan from _bahan);
begin
  -- tahap "terverifikasi" ditolak selama lahan belum diverifikasi
  v_p := public.peluang_buat(v_l, null, (select tenant_id from _bahan));
  v := public.peluang_ubah_tahap(v_p, 'terverifikasi');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%belum diverifikasi%', 'Tahap terverifikasi harus ditolak selama lahan belum diverifikasi.';
  update _bahan set peluang = v_p;

  -- penahanan: wajib beralasan, menahan penawaran, bisa dilepas
  v := public.status_ruang_ubah(v_l, 'ditahan', '');
  assert not (v ->> 'ok')::boolean, 'Menahan lahan tanpa alasan harus ditolak.';
  v := public.status_ruang_ubah(v_l, 'ditahan', 'Dipakai gudang sementara sampai Desember.');
  assert (v ->> 'ok')::boolean and (select status_ruang from public.v_status_lahan where lahan_id = v_l) = 'ditahan', 'Lahan harus bisa ditahan.';
  assert public.lahan_boleh_ditawarkan(v_l) ->> 'kode' = 'ditahan', 'Lahan yang ditahan tidak boleh ditawarkan.';
  v := public.status_ruang_ubah(v_l, 'tersedia');
  assert (select status_ruang from public.v_status_lahan where lahan_id = v_l) = 'tersedia', 'Penahanan harus bisa dilepas.';
  v := public.status_ruang_ubah((select lahan_terisi from _bahan), 'ditahan', 'alasan yang cukup');
  assert not (v ->> 'ok')::boolean, 'Lahan yang terisi di sumber tidak bisa ditahan.';

  -- inspeksi: mulai, simpan draf, ajukan
  v := public.inspeksi_mulai((select lahan_terisi from _bahan));
  assert not (v ->> 'ok')::boolean, 'Inspeksi hanya untuk lahan kosong.';
  v := public.inspeksi_mulai(v_l);
  v_id := (v ->> 'id')::uuid;
  assert v_id is not null, 'Inspeksi harus bisa dimulai.';
  assert (public.inspeksi_mulai(v_l) ->> 'id')::uuid = v_id, 'Memulai lagi harus membuka inspeksi yang sama.';
  assert (select kesiapan from public.v_status_lahan where lahan_id = v_l) = 'perlu_inspeksi', 'Selama inspeksi berjalan, kesiapan = perlu inspeksi.';
  update _bahan set inspeksi = v_id;

  v := public.inspeksi_simpan(v_id, '{"luas_m2":"30.5","daya_w":"abc","air":"tersedia","kunci_asing":"x"}'::jsonb, null);
  assert (v ->> 'ok')::boolean, 'Draf harus tersimpan.';
  assert (select isi from public.inspeksi_lahan where id = v_id) = '{"luas_m2":30.5,"air":"tersedia"}'::jsonb,
    'Hanya kunci yang dikenal dan angka yang sah yang disimpan.';
  v := public.inspeksi_ajukan(v_id);
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%daya listrik%' and v ->> 'pesan' like '%dua foto%' and v ->> 'pesan' like '%kesimpulan%',
    'Inspeksi yang belum lengkap tidak boleh diajukan, dan butir yang kurang harus disebut.';

  v := public.inspeksi_foto_tambah(v_id, 'inspeksi/lain/x.jpg', 800, 600, 1000);
  assert not (v ->> 'ok')::boolean, 'Kunci foto di luar folder inspeksi ini harus ditolak.';
  v := public.inspeksi_foto_tambah(v_id, 'inspeksi/' || v_id || '/00000000-0000-4000-c000-000000000001.jpg', 800, 600, 1000);
  v := public.inspeksi_foto_tambah(v_id, 'inspeksi/' || v_id || '/00000000-0000-4000-c000-000000000002.jpg', 800, 600, 1000);
  assert (v ->> 'ok')::boolean, 'Foto bukti harus bisa dicatat.';
  v := public.inspeksi_simpan(v_id,
    '{"luas_m2":"30.5","daya_w":"1300","air":"tersedia","akses":"mudah","parkir":"terbatas","pembatasan":"ada","pembatasan_rinci":"Tidak boleh memakai api terbuka."}'::jsonb,
    'siap');
  v := public.inspeksi_ajukan(v_id);
  assert (v ->> 'ok')::boolean, 'Inspeksi lengkap harus bisa diajukan.';
  v := public.inspeksi_simpan(v_id, '{}'::jsonb, null);
  assert not (v ->> 'ok')::boolean, 'Inspeksi yang sudah diajukan tidak bisa diubah.';
  -- bentuk rincian yang dibaca halaman: status inspeksi tetap teks, status lahan di kunci tersendiri
  v := public.inspeksi_rinci(v_id);
  assert jsonb_typeof(v -> 'status') = 'string' and v ->> 'status' = 'diajukan' and (v ->> 'milik_saya')::boolean
         and jsonb_array_length(v -> 'foto') = 2 and v -> 'status_lahan' ->> 'status_ruang' = 'tersedia',
    'Rincian inspeksi harus memuat status inspeksi (teks), foto, dan status lahan di kunci tersendiri.';
  assert public.status_lahan_rinci(v_l) -> 'inspeksi' -> 0 ->> 'status' = 'diajukan', 'Rincian status lahan harus memuat inspeksinya.';

  -- pemeriksa tidak boleh meninjau (bukan perannya, dan inspeksinya sendiri)
  v := public.inspeksi_tinjau(v_id, 'diterima');
  assert not (v ->> 'ok')::boolean, 'Analis tidak boleh meninjau inspeksi.';
  assert (select status_data from public.v_status_lahan where lahan_id = v_l) = 'belum_diverifikasi', 'Mengajukan inspeksi belum memverifikasi lahan.';

  -- tabel tidak bisa ditulis langsung
  begin
    update public.status_lahan set status_data = 'terverifikasi';
    assert false, 'Status lahan tidak boleh bisa diubah langsung.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.inspeksi_lahan set status = 'diterima';
    assert false, 'Inspeksi tidak boleh bisa diubah langsung.';
  exception when insufficient_privilege then null;
  end;

  -- inspeksi di lahan bersengketa: boleh diajukan, tetapi tidak bisa diterima sebelum temuannya diputuskan
  v := public.inspeksi_mulai((select lahan_sengketa from _bahan));
  v_id := (v ->> 'id')::uuid;
  update _bahan set inspeksi2 = v_id;
  v := public.inspeksi_foto_tambah(v_id, 'inspeksi/' || v_id || '/00000000-0000-4000-c000-000000000003.jpg', 800, 600, 1000);
  v := public.inspeksi_foto_tambah(v_id, 'inspeksi/' || v_id || '/00000000-0000-4000-c000-000000000004.jpg', 800, 600, 1000);
  v := public.inspeksi_simpan(v_id, '{"luas_m2":"10","daya_w":"0","air":"tidak_ada","akses":"terbatas","parkir":"tidak_ada","pembatasan":"tidak_ada"}'::jsonb, 'belum_siap');
  v := public.inspeksi_ajukan(v_id);
  assert (v ->> 'ok')::boolean, 'Inspeksi di lahan bersengketa tetap boleh diajukan.';
end $$;
reset role;

-- ---------------------------------------------------------------- penyetuju: meninjau inspeksi orang lain
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000012","email":"penyetuju@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare
  v     jsonb;
  v_id  uuid := (select inspeksi from _bahan);
  v_l   text := (select lahan from _bahan);
begin
  v := public.inspeksi_tinjau((select inspeksi2 from _bahan), 'diterima');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%temuan data kritis%', 'Inspeksi di lahan bersengketa tidak boleh diterima.';
  v := public.inspeksi_tinjau(v_id, 'ditolak', 'kurang');
  assert not (v ->> 'ok')::boolean, 'Menolak inspeksi wajib beralasan.';
  v := public.inspeksi_tinjau(v_id, 'diterima');
  assert (v ->> 'ok')::boolean, 'Penyetuju harus bisa menerima inspeksi orang lain.';
  assert (select status_data = 'terverifikasi' and kesiapan = 'siap' and pembatasan like '%api terbuka%' and diverifikasi_oleh = 'penyetuju@uji.invalid'
          from public.v_status_lahan where lahan_id = v_l), 'Setelah diterima: terverifikasi, kesiapan mengikuti kesimpulan, pembatasan tercatat.';
  assert (public.lahan_boleh_ditawarkan(v_l) ->> 'boleh')::boolean, 'Lahan terverifikasi dan tersedia boleh ditawarkan.';
  assert (select data ? 'isi' from public.audit_peristiwa where peristiwa = 'inspeksi_ditinjau' and entitas_id = v_l),
    'Isi inspeksi saat ditinjau harus tersimpan di jejak audit.';
  v := public.peluang_ubah_tahap((select peluang from _bahan), 'terverifikasi');
  assert (v ->> 'ok')::boolean, 'Setelah lahan terverifikasi, peluang harus lolos tahap terverifikasi.';
  v := public.inspeksi_tinjau(v_id, 'ditolak', 'Sudah diterima, tidak boleh ditinjau lagi.');
  assert not (v ->> 'ok')::boolean, 'Inspeksi yang sudah ditinjau tidak bisa ditinjau lagi.';
end $$;
reset role;

-- ---------------------------------------------------------------- data sumber berubah: verifikasi gugur
update public.lahan set luas_m2 = coalesce(luas_m2, 0) + 1 where lahan_id = (select lahan from _bahan);
do $$
declare v_l text := (select lahan from _bahan);
begin
  assert (select status_data = 'belum_diverifikasi' and verifikasi_usang and kesiapan = 'perlu_inspeksi'
          from public.v_status_lahan where lahan_id = v_l), 'Bila data sumber berubah, verifikasi gugur dan lahan perlu diinspeksi lagi.';
  assert public.lahan_boleh_ditawarkan(v_l) ->> 'kode' = 'usang', 'Lahan dengan verifikasi usang tidak boleh ditawarkan.';
end $$;

rollback;
\echo 'LULUS: semua uji status lahan (tiga status, penahanan, inspeksi, tinjauan orang lain, syarat verifikasi, verifikasi gugur).'
