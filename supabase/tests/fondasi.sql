-- Uji otomatis fondasi Bright Match 2.0: isolasi akses per organisasi, jejak audit, aturan tahap peluang,
-- dan penahanan penawaran oleh temuan data kritis.
-- Dijalankan lewat `npm run db:test`. Seluruhnya di dalam satu transaksi yang dibatalkan di akhir,
-- jadi tidak ada data yang tersisa. Pengguna uji di sini hanya hidup selama transaksi.

\set ON_ERROR_STOP on
\set QUIET on
-- Bila uji gagal di tengah, psql berhenti tanpa menutup transaksi. Batas ini menutup sesi yang tertinggal,
-- dan membuat uji lain gagal cepat dengan pesan jelas, bukan menggantung menunggu kuncinya.
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

-- ---------------------------------------------------------------- persiapan (sebagai pemilik basis data)
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000001', 'analis@uji.invalid'),
  ('00000000-0000-4000-a000-000000000002', 'tenant@uji.invalid'),
  ('00000000-0000-4000-a000-000000000003', 'auditor@uji.invalid'),
  ('00000000-0000-4000-a000-000000000004', 'tanpa-organisasi@uji.invalid');

insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-000000000001', 'Tenant Uji', 'tenant', true);

insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000001', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000003', id, 'auditor' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000001', 'tenant_admin');

-- Temuan disegarkan dulu: sebagian temuan bergantung pada tanggal hari ini (kontrak yang baru lewat tanggal),
-- jadi uji "deteksi ulang tidak membuat temuan baru" di akhir berkas harus berangkat dari keadaan terkini.
do $_$ begin perform public.deteksi_masalah_data(); end $_$;

-- Bahan uji: satu lahan kosong yang bersih, satu yang tertahan temuan kritis, dan satu tenant.
create temp table _bahan on commit drop as
select
  (select l.lahan_id from public.lahan l where l.status = 'Tersedia' and not l.duplikat
     and not exists (select 1 from public.masalah_data m where l.lahan_id = any (m.lahan_ids))
     and not exists (select 1 from public.peluang p where p.lahan_id = l.lahan_id)
   order by l.lahan_id limit 1) as lahan_bersih,
  (select l.lahan_id from public.lahan l join public.masalah_data m on l.lahan_id = any (m.lahan_ids)
   where l.status = 'Tersedia' and not l.duplikat and m.jenis = 'kosong_kontrak_aktif' and m.status = 'terbuka'
     and not exists (select 1 from public.peluang p where p.lahan_id = l.lahan_id)
   order by l.lahan_id limit 1) as lahan_tertahan,
  (select t.id from public.v_tenant_profil t order by t.lahan desc, t.id limit 1) as tenant_id;
grant select on _bahan to authenticated;

-- Sejak irisan kedua, penawaran mensyaratkan lahan terverifikasi. Uji di berkas ini memeriksa aturan tahap dan
-- temuan kritis, jadi kedua lahan uji ditandai terverifikasi lebih dulu (alur verifikasi diuji di status_lahan.sql).
insert into public.status_lahan (spbu_id, lahan_id, lahan_kode, status_data, kesiapan, sidik_sumber, diverifikasi, diverifikasi_oleh)
select l.spbu_id, l.lahan_id, l.kode, 'terverifikasi', 'siap', public.sidik_lahan(l), now(), 'persiapan-uji'
from public.lahan l, _bahan b where l.lahan_id in (b.lahan_bersih, b.lahan_tertahan) and not l.duplikat
on conflict (spbu_id, lahan_id) do update set status_data = 'terverifikasi', kesiapan = 'siap', sidik_sumber = excluded.sidik_sumber;

do $$ begin
  assert (select lahan_bersih is not null and lahan_tertahan is not null and tenant_id is not null from _bahan),
    'Bahan uji tidak lengkap: butuh lahan kosong bersih, lahan tertahan, dan tenant.';
end $$;

-- Peran tidak boleh menyeberang jenis organisasi.
do $$ begin
  begin
    insert into public.keanggotaan (user_id, organisasi_id, peran)
    values ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-b000-000000000001', 'nfr_admin');
    assert false, 'Peran NFR tidak boleh diberikan di organisasi tenant.';
  exception when check_violation then null;
  end;
end $$;

-- Jejak audit tidak bisa diubah, bahkan oleh pemilik basis data.
do $$ begin
  begin
    update public.audit_peristiwa set peristiwa = 'diubah' where id = (select min(id) from public.audit_peristiwa);
    assert not found, 'Jejak audit tidak boleh bisa diubah.';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- 1. tenant: tidak melihat data NFR
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","email":"tenant@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  assert (select count(*) from public.lahan) = 0, 'Tenant tidak boleh membaca lahan.';
  assert (select count(*) from public.spbu) = 0, 'Tenant tidak boleh membaca SPBU.';
  assert (select count(*) from public.peluang) = 0, 'Tenant tidak boleh membaca peluang.';
  assert (select count(*) from public.calon_tenant) = 0, 'Tenant tidak boleh membaca calon tenant.';
  assert (select count(*) from public.masalah_data) = 0, 'Tenant tidak boleh membaca temuan data.';
  assert (select count(*) from public.audit_peristiwa) = 0, 'Tenant tidak boleh membaca jejak audit.';
  assert (select count(*) from public.gambar) = 0, 'Tenant tidak boleh membaca daftar foto.';
  assert (select count(*) from public.organisasi) = 1, 'Tenant hanya melihat organisasinya sendiri.';
  assert public.profil_saya() -> 'keanggotaan' -> 0 ->> 'peran' = 'tenant_admin', 'Profil tenant salah.';
  assert public.peran_nfr() is null, 'Tenant bukan anggota NFR.';

  v := public.peluang_ubah_tahap((select id from public.peluang limit 1), 'dihubungi');
  assert v is null or not (v ->> 'ok')::boolean, 'Tenant tidak boleh mengubah tahap.';
  v := public.masalah_putuskan(1, 'selesai', 'alasan yang cukup panjang');
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh memutuskan temuan.';
  begin
    perform public.peluang_buat((select lahan_bersih from _bahan), null, (select tenant_id from _bahan));
    assert false, 'Tenant tidak boleh membuat peluang.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.deteksi_masalah_data();
    assert false, 'Tenant tidak boleh menjalankan deteksi.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- 2. pengguna tanpa organisasi: kosong
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000004","email":"tanpa-organisasi@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ begin
  assert (select count(*) from public.lahan) = 0, 'Pengguna tanpa organisasi tidak boleh membaca lahan.';
  assert (select count(*) from public.organisasi) = 0, 'Pengguna tanpa organisasi tidak melihat organisasi.';
  assert jsonb_array_length(public.profil_saya() -> 'keanggotaan') = 0, 'Profil harus tanpa keanggotaan.';
end $$;
reset role;

-- ---------------------------------------------------------------- 3. auditor: membaca, tidak mengubah
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000003","email":"auditor@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  assert (select count(*) from public.lahan) > 0, 'Auditor boleh membaca lahan.';
  assert (select count(*) from public.masalah_data) > 0, 'Auditor boleh membaca temuan.';
  v := public.masalah_putuskan((select id from public.masalah_data where status = 'terbuka' limit 1), 'selesai', 'alasan yang cukup panjang');
  assert not (v ->> 'ok')::boolean, 'Auditor tidak boleh memutuskan temuan.';
  begin
    perform public.peluang_buat((select lahan_bersih from _bahan), null, (select tenant_id from _bahan));
    assert false, 'Auditor tidak boleh membuat peluang.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- 4. analis NFR: alur peluang
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","email":"analis@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare
  v      jsonb;
  v_id   uuid;
  v_id2  uuid;
  v_m    bigint;
begin
  assert (select count(*) from public.lahan) > 30000, 'Analis NFR harus bisa membaca semua lahan.';

  -- tabel alur tidak bisa ditulis langsung
  begin
    update public.peluang set tahap = 'kontrak';
    assert false, 'Tabel peluang tidak boleh bisa diubah langsung.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.peluang_riwayat (peluang_id, tahap_ke) select id, 'kontrak' from public.peluang limit 1;
    assert false, 'Riwayat peluang tidak boleh bisa ditulis langsung.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.audit_peristiwa (peristiwa, entitas) values ('palsu', 'peluang');
    assert false, 'Jejak audit tidak boleh bisa ditulis langsung.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.masalah_data set status = 'selesai', keputusan = 'langsung';
    assert false, 'Temuan data tidak boleh bisa diubah langsung.';
  exception when insufficient_privilege then null;
  end;

  -- peluang di lahan bersih: pelaku dari sesi, bukan dari isian klien
  v_id := public.peluang_buat((select lahan_bersih from _bahan), null, (select tenant_id from _bahan), 80, 'penyamar@uji.invalid');
  assert (select pemilik from public.peluang where id = v_id) = 'analis@uji.invalid', 'Pemilik peluang harus diambil dari sesi.';
  assert (select count(*) from public.peluang_syarat where peluang_id = v_id) = 14, 'Peluang baru harus punya 14 persyaratan.';

  v := public.peluang_ubah_tahap(v_id, 'terpilih');
  assert not (v ->> 'ok')::boolean, 'Tahap tidak boleh dilompati.';
  v := public.peluang_ubah_tahap(v_id, 'terverifikasi', 'penyamar@uji.invalid');
  assert (v ->> 'ok')::boolean, 'Maju satu tahap harus berhasil.';
  assert (select oleh from public.peluang_riwayat where peluang_id = v_id and tahap_ke = 'terverifikasi') = 'analis@uji.invalid',
    'Pelaku di riwayat harus diambil dari sesi.';
  v := public.peluang_ubah_tahap(v_id, 'baru');
  assert not (v ->> 'ok')::boolean, 'Mundur tanpa alasan harus ditolak.';
  v := public.peluang_ubah_tahap(v_id, 'batal');
  assert not (v ->> 'ok')::boolean, 'Batal tanpa alasan harus ditolak.';
  v := public.peluang_ubah_tahap(v_id, 'batal', null, 'Tenant menunda ekspansi.');
  assert (v ->> 'ok')::boolean, 'Batal dengan alasan harus berhasil.';
  v := public.peluang_ubah_tahap(v_id, 'kalah', null, 'Sudah batal.');
  assert not (v ->> 'ok')::boolean, 'Peluang yang sudah berakhir tidak bisa diberi hasil akhir lain.';
  v := public.peluang_ubah_tahap(v_id, 'penawaran', null, 'Dibuka lagi.');
  assert not (v ->> 'ok')::boolean, 'Buka kembali ke tahap lain harus ditolak.';
  v := public.peluang_ubah_tahap(v_id, 'terverifikasi', null, 'Tenant kembali berminat.');
  assert (v ->> 'ok')::boolean, 'Buka kembali ke tahap sebelum batal harus berhasil.';
  v := public.peluang_ubah_tahap(v_id, 'baru', null, 'Perlu diperiksa ulang.');
  assert (v ->> 'ok')::boolean, 'Mundur satu tahap dengan alasan harus berhasil.';
  assert (select count(*) from public.audit_peristiwa where entitas = 'peluang' and entitas_id = v_id::text and peristiwa = 'tahap_diubah') = 4,
    'Setiap perpindahan tahap yang berhasil harus tercatat di jejak audit.';

  -- peluang di lahan dengan temuan kritis: boleh dicatat, tetapi tidak lolos tahap "terverifikasi"
  v_id2 := public.peluang_buat((select lahan_tertahan from _bahan), null, (select tenant_id from _bahan));
  v := public.peluang_ubah_tahap(v_id2, 'terverifikasi');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%temuan data kritis%', 'Lahan dengan temuan kritis tidak boleh lolos tahap terverifikasi.';

  select m.id into v_m from public.masalah_data m
  where (select lahan_tertahan from _bahan) = any (m.lahan_ids) and m.tingkat = 'kritis' and m.status = 'terbuka' limit 1;
  v := public.masalah_putuskan(v_m, 'selesai', 'pendek');
  assert not (v ->> 'ok')::boolean, 'Keputusan tanpa dasar yang cukup harus ditolak.';
  v := public.masalah_tinjau(v_m);
  assert (v ->> 'ok')::boolean and (select peninjau_email from public.masalah_data where id = v_m) = 'analis@uji.invalid', 'Peninjau harus tercatat.';
  v := public.masalah_putuskan(v_m, 'selesai', 'Pengelola SPBU memastikan lahan kosong; kontrak di file master sudah diakhiri.');
  assert (v ->> 'ok')::boolean, 'Keputusan beralasan harus tersimpan.';
  assert (select data ? 'bukti' from public.audit_peristiwa where entitas = 'masalah_data' and entitas_id = v_m::text and peristiwa = 'masalah_diputuskan'),
    'Bukti saat keputusan harus tersimpan di jejak audit.';
  if not public.lahan_tertahan((select lahan_tertahan from _bahan)) then
    v := public.peluang_ubah_tahap(v_id2, 'terverifikasi');
    assert (v ->> 'ok')::boolean, 'Setelah temuan diputuskan, peluang harus lolos tahap terverifikasi.';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------- 5. deteksi ulang tidak menimpa keputusan
do $$
declare v jsonb; v_n integer;
begin
  select count(*) into v_n from public.masalah_data where status = 'selesai' and diputuskan_oleh = 'analis@uji.invalid';
  v := public.deteksi_masalah_data();
  assert (v ->> 'baru')::int = 0, 'Deteksi ulang atas data yang sama tidak boleh membuat temuan baru.';
  assert (v ->> 'dibuka_kembali')::int = 0, 'Bukti tidak berubah, jadi tidak ada temuan yang dibuka kembali.';
  assert (select count(*) from public.masalah_data where status = 'selesai' and diputuskan_oleh = 'analis@uji.invalid') = v_n,
    'Keputusan peninjau tidak boleh tertimpa deteksi ulang.';
end $$;

rollback;
\echo 'LULUS: semua uji fondasi (akses per organisasi, jejak audit, aturan tahap, penahanan penawaran, deteksi ulang).'
