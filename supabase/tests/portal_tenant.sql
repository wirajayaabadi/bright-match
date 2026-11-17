-- Uji otomatis portal tenant: kelola organisasi, berbagi penawaran, isolasi antar organisasi tenant,
-- tanggapan, dan persetujuan oleh admin tenant. Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
-- Bila uji gagal di tengah, psql berhenti tanpa menutup transaksi. Batas ini menutup sesi yang tertinggal,
-- dan membuat uji lain gagal cepat dengan pesan jelas, bukan menggantung menunggu kuncinya.
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000041', 'admin5@uji.invalid'),
  ('00000000-0000-4000-a000-000000000042', 'analis5@uji.invalid'),
  ('00000000-0000-4000-a000-000000000043', 'tenant-a-admin@uji.invalid'),
  ('00000000-0000-4000-a000-000000000044', 'tenant-a-staf@uji.invalid'),
  ('00000000-0000-4000-a000-000000000045', 'tenant-b@uji.invalid');
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000041', id, 'nfr_admin' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000042', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';

do $_$ begin perform public.deteksi_masalah_data(); end $_$;

create temp table _bahan on commit drop as
select
  (select l.lahan_id from public.lahan l where l.status = 'Tersedia' and not l.duplikat
     and not exists (select 1 from public.masalah_data m where l.lahan_id = any (m.lahan_ids))
     and not exists (select 1 from public.peluang p where p.lahan_id = l.lahan_id)
     and not exists (select 1 from public.status_lahan s where s.lahan_id = l.lahan_id)
   order by l.lahan_id limit 1) as lahan,
  (select t.id from public.v_tenant_profil t order by t.lahan desc, t.id limit 1) as tenant_id,
  null::uuid as peluang, null::uuid as org_a, null::uuid as org_b;
grant select, update on _bahan to authenticated;
insert into public.status_lahan (spbu_id, lahan_id, lahan_kode, status_data, kesiapan, sidik_sumber, diverifikasi, diverifikasi_oleh)
select l.spbu_id, l.lahan_id, l.kode, 'terverifikasi', 'siap', public.sidik_lahan(l), now(), 'persiapan-uji'
from public.lahan l, _bahan b where l.lahan_id = b.lahan and not l.duplikat;

-- Wewenang SPBU lahan uji dipastikan lebih dulu (alurnya sendiri diuji di wewenang_dealer.sql).
insert into public.hak_spbu (spbu_id, spbu_nomor, pola, pemilik_aset, penyetuju, pihak_kontrak, penerima_sewa, dokumen, status, dipastikan, dipastikan_oleh)
select l.spbu_id, s.nomor, 'DODO', 'Pemilik uji', 'Pemilik uji', 'Pemilik uji', 'pemilik_spbu', 'Dokumen uji', 'dipastikan', now(), 'persiapan-uji'
from public.lahan l join public.spbu s on s.id = l.spbu_id, _bahan b where l.lahan_id = b.lahan and not l.duplikat
on conflict (spbu_id) do update set pola = 'DODO', pemilik_aset = 'Pemilik uji', penyetuju = 'Pemilik uji', pihak_kontrak = 'Pemilik uji',
  penerima_sewa = 'pemilik_spbu', dokumen = 'Dokumen uji', status = 'dipastikan';

-- ---------------------------------------------------------------- analis: tidak boleh mengelola organisasi
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000042","email":"analis5@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.organisasi_buat('Tenant A Uji', 'tenant');
  assert not (v ->> 'ok')::boolean, 'Analis tidak boleh membuat organisasi.';
  v := public.keanggotaan_atur('tenant-b@uji.invalid', (select id from public.organisasi where jenis = 'nfr'), 'nfr_admin');
  assert not (v ->> 'ok')::boolean, 'Analis tidak boleh mengatur anggota.';
  update _bahan set peluang = public.peluang_buat((select lahan from _bahan), null, (select tenant_id from _bahan));
end $$;
reset role;

-- ---------------------------------------------------------------- admin: organisasi dan anggota
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000041","email":"admin5@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_a uuid; v_b uuid;
begin
  v := public.organisasi_buat('Tenant A Uji', 'nfr');
  assert not (v ->> 'ok')::boolean, 'Organisasi NFR kedua tidak boleh dibuat.';
  v := public.organisasi_buat('Tenant A Uji', 'tenant');  v_a := (v ->> 'id')::uuid;
  v := public.organisasi_buat('Tenant B Uji', 'tenant');  v_b := (v ->> 'id')::uuid;
  assert v_a is not null and v_b is not null, 'Admin harus bisa membuat organisasi tenant.';
  assert not (public.organisasi_buat('tenant a uji', 'tenant') ->> 'ok')::boolean, 'Nama organisasi yang sama harus ditolak.';
  update _bahan set org_a = v_a, org_b = v_b;

  v := public.keanggotaan_atur('tidak-ada@uji.invalid', v_a, 'tenant_admin');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%Belum ada akun%', 'Email tanpa akun harus ditolak dengan petunjuk.';
  v := public.keanggotaan_atur('tenant-a-admin@uji.invalid', v_a, 'nfr_admin');
  assert not (v ->> 'ok')::boolean, 'Peran NFR tidak boleh diberikan di organisasi tenant.';
  assert (public.keanggotaan_atur('tenant-a-admin@uji.invalid', v_a, 'tenant_admin') ->> 'ok')::boolean, 'Admin tenant harus bisa dihubungkan.';
  assert (public.keanggotaan_atur('tenant-a-staf@uji.invalid', v_a, 'tenant_perwakilan') ->> 'ok')::boolean, 'Perwakilan tenant harus bisa dihubungkan.';
  assert (public.keanggotaan_atur('tenant-b@uji.invalid', v_b, 'tenant_admin') ->> 'ok')::boolean, 'Anggota organisasi lain harus bisa dihubungkan.';
  v := public.keanggotaan_atur('admin5@uji.invalid', (select id from public.organisasi where jenis = 'nfr'), 'auditor');
  assert not (v ->> 'ok')::boolean, 'Admin tidak boleh mengubah perannya sendiri.';
  assert (select count(*) from jsonb_array_elements(public.organisasi_daftar()) o where o ->> 'nama' = 'Tenant A Uji' and jsonb_array_length(o -> 'anggota') = 2) = 1,
    'Daftar organisasi harus memuat anggotanya.';

  -- berbagi butuh versi yang terbit
  v := public.peluang_bagikan((select peluang from _bahan), v_a);
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%Terbitkan%', 'Peluang tanpa versi terbit tidak boleh dibagikan.';
end $$;
reset role;

-- Persiapan: peluang dibawa ke tahap survei langsung (alur tahapnya diuji di alur_komersial.sql).
update public.peluang set tahap = 'survei', pemilik = 'analis5@uji.invalid' where id = (select peluang from _bahan);

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000042","email":"analis5@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := (select peluang from _bahan);
begin
  v := public.penawaran_simpan(v_p, '{"sewa_tahunan":"48000000","lama_sewa_bulan":"24","skema":"sewa_tetap","penerima_sewa":"pemilik_spbu","catatan":"Listrik ditanggung tenant."}'::jsonb);
  v := public.penawaran_terbitkan((v ->> 'id')::uuid);
  assert (v ->> 'ok')::boolean, 'Versi penawaran harus terbit.';
  v := public.peluang_bagikan(v_p, (select id from public.organisasi where jenis = 'nfr'));
  assert not (v ->> 'ok')::boolean, 'Penawaran hanya boleh dibagikan ke organisasi tenant.';
  v := public.peluang_bagikan(v_p, (select org_a from _bahan));
  assert (v ->> 'ok')::boolean, 'Penawaran harus bisa dibagikan ke organisasi tenant.';
  v := public.peluang_ubah_tahap(v_p, 'penawaran');
end $$;
reset role;

-- ---------------------------------------------------------------- perwakilan tenant A: melihat dan menanggapi
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000044","email":"tenant-a-staf@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := (select peluang from _bahan);
begin
  v := public.tenant_penawaran_daftar();
  assert jsonb_array_length(v) = 1 and v -> 0 ->> 'sewa_tahunan' = '48000000' and v -> 0 ->> 'status' = 'ditawarkan', 'Tenant harus melihat penawaran yang dibagikan ke organisasinya.';
  v := public.tenant_penawaran_rinci(v_p);
  assert v is not null and v -> 'syarat' ->> 'versi' = '1' and v -> 'spbu' ? 'alamat' and v ? 'keyakinan' and v -> 'kecocokan' ? 'skor',
    'Rincian penawaran harus memuat syarat, lokasi, keyakinan data, dan kecocokan.';
  assert not (v ? 'catatan') and not (v ? 'pemilik') and not (v -> 'syarat' ? 'dibuat_oleh') and v::text not like '%analis5@uji.invalid%',
    'Rincian untuk tenant tidak boleh memuat catatan internal atau identitas staf NFR.';
  -- tabel NFR tetap tertutup
  assert (select count(*) from public.peluang) = 0 and (select count(*) from public.lahan) = 0 and (select count(*) from public.penawaran_versi) = 0
         and (select count(*) from public.tanggapan_tenant) = 0, 'Tabel NFR harus tetap tertutup bagi tenant.';
  assert jsonb_array_length(public.organisasi_daftar()) = 0, 'Tenant tidak boleh membaca daftar organisasi.';

  v := public.tenant_tanggapi(v_p, 'menolak');
  assert not (v ->> 'ok')::boolean, 'Menolak tanpa alasan harus ditolak.';
  v := public.tenant_tanggapi(v_p, 'berminat');
  assert (v ->> 'ok')::boolean and v ->> 'pesan' like '%tidak mengikat%', 'Minat harus tercatat dan dinyatakan tidak mengikat.';
  v := public.tenant_tanggapi(v_p, 'minta_survei', 'Kalau bisa minggu depan.');
  assert (v ->> 'ok')::boolean, 'Permintaan survei harus tercatat.';
  assert jsonb_array_length(public.tenant_penawaran_rinci(v_p) -> 'tanggapan') = 2, 'Tenant harus melihat tanggapannya sendiri.';
  v := public.tenant_putuskan(v_p, 'disetujui');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%admin tenant%', 'Perwakilan tenant tidak boleh memutuskan atas nama organisasi.';
end $$;
reset role;

-- ---------------------------------------------------------------- tenant B: tidak melihat penawaran organisasi lain
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000045","email":"tenant-b@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := (select peluang from _bahan);
begin
  assert jsonb_array_length(public.tenant_penawaran_daftar()) = 0, 'Tenant B tidak boleh melihat penawaran untuk tenant A.';
  assert public.tenant_penawaran_rinci(v_p) is null, 'Rincian penawaran tenant A harus tertutup bagi tenant B.';
  assert not (public.tenant_tanggapi(v_p, 'berminat') ->> 'ok')::boolean, 'Tenant B tidak boleh menanggapi penawaran tenant A.';
  assert not (public.tenant_putuskan(v_p, 'disetujui') ->> 'ok')::boolean, 'Tenant B tidak boleh memutuskan penawaran tenant A.';
  assert not public.tenant_boleh_lihat(v_p), 'Tenant B bukan penerima penawaran ini.';
end $$;
reset role;

-- ---------------------------------------------------------------- admin tenant A: memutuskan di tahap persetujuan
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000043","email":"tenant-a-admin@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := (select peluang from _bahan);
begin
  v := public.tenant_putuskan(v_p, 'disetujui');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%belum sampai tahap persetujuan%', 'Persetujuan tenant hanya di tahap persetujuan.';
end $$;
reset role;
update public.peluang set tahap = 'persetujuan' where id = (select peluang from _bahan);
set local role authenticated;
do $$
declare v jsonb; v_p uuid := (select peluang from _bahan);
begin
  assert (public.tenant_penawaran_rinci(v_p) ->> 'boleh_putuskan')::boolean, 'Di tahap persetujuan, tenant harus bisa memutuskan.';
  v := public.tenant_putuskan(v_p, 'minta_revisi', 'singkat');
  assert not (v ->> 'ok')::boolean, 'Permintaan revisi wajib beralasan.';
  v := public.tenant_putuskan(v_p, 'disetujui');
  assert (v ->> 'ok')::boolean, 'Admin tenant harus bisa menyetujui versi yang berlaku.';
  v := public.tenant_putuskan(v_p, 'ditolak', 'Berubah pikiran setelah setuju.');
  assert not (v ->> 'ok')::boolean, 'Keputusan tenant yang sudah tercatat tidak bisa diubah.';
end $$;
reset role;

-- ---------------------------------------------------------------- NFR: melihat tanggapan dan keputusan tenant
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000042","email":"analis5@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := (select peluang from _bahan);
begin
  v := public.peluang_portal(v_p);
  assert v -> 'organisasi' ->> 'nama' = 'Tenant A Uji' and jsonb_array_length(v -> 'tanggapan') = 2 and jsonb_array_length(v -> 'pilihan') >= 2,
    'NFR harus melihat organisasi penerima, pilihan organisasi, dan tanggapan tenant.';
  assert (select status = 'disetujui' and not atas_nama and penyetuju_email = 'tenant-a-admin@uji.invalid' and wewenang like 'Admin tenant%'
          from public.persetujuan where peluang_id = v_p and pihak = 'tenant' and not gugur),
    'Keputusan admin tenant harus tercatat langsung, bukan atas nama.';
  v := public.persetujuan_putuskan((select id from public.persetujuan where peluang_id = v_p and pihak = 'tenant' and not gugur), 'ditolak', 'Menimpa keputusan tenant.', 'Surat no. 1/XI/2026', 'Staf NFR');
  assert not (v ->> 'ok')::boolean, 'NFR tidak boleh menimpa keputusan yang sudah diambil tenant.';
  assert (select count(*) from public.audit_peristiwa where entitas_id = v_p::text and peristiwa in ('penawaran_dibagikan', 'tenant_berminat', 'tenant_minta_survei')) = 3,
    'Berbagi dan tanggapan tenant harus tercatat di jejak audit.';
  -- berhenti berbagi
  v := public.peluang_bagikan(v_p, null);
  assert (v ->> 'ok')::boolean, 'Berbagi harus bisa dihentikan.';
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000043","email":"tenant-a-admin@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ begin
  assert jsonb_array_length(public.tenant_penawaran_daftar()) = 0 and public.tenant_penawaran_rinci((select peluang from _bahan)) is null,
    'Setelah berbagi dihentikan, tenant tidak lagi melihat penawaran itu.';
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji portal tenant (kelola organisasi, berbagi, isolasi antar tenant, tanggapan, persetujuan admin tenant).'
