-- Uji otomatis jadwal survei lokasi: usulan tenant, penetapan jadwal oleh NFR, selesai, batal, dan isolasi.
-- Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000a1', 'analis10@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000a2', 'auditor10@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000a3', 'tenant10a@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000a4', 'tenant10b@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-0000000000a1', 'Tenant Uji 10A', 'tenant', true),
  ('00000000-0000-4000-b000-0000000000a2', 'Tenant Uji 10B', 'tenant', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select u.id, o.id, u.peran from public.organisasi o,
  (values ('00000000-0000-4000-a000-0000000000a1'::uuid, 'nfr_analis'), ('00000000-0000-4000-a000-0000000000a2'::uuid, 'auditor')) u(id, peran)
where o.jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-0000000000a3', '00000000-0000-4000-b000-0000000000a1', 'tenant_perwakilan'),
  ('00000000-0000-4000-a000-0000000000a4', '00000000-0000-4000-b000-0000000000a2', 'tenant_admin');

insert into public.peluang (id, lahan_id, lahan_kode, spbu_id, spbu_nomor, kota, provinsi, tenant_kunci, tenant_nama, segmen, tahap, organisasi_tenant, dibagikan)
select '00000000-0000-4000-d000-0000000000a1', l.lahan_id, l.kode, l.spbu_id, s.nomor, s.kota, s.provinsi, 'ujisepuluh', 'Tenant Uji 10A', 'F&B / Kuliner',
       'survei', '00000000-0000-4000-b000-0000000000a1', now()
from public.lahan l join public.spbu s on s.id = l.spbu_id where l.status = 'Tersedia' and not l.duplikat order by l.lahan_id limit 1;
insert into public.penawaran_versi (peluang_id, versi, status, sewa_tahunan, lama_sewa_bulan, skema, bebas_sewa_bulan, penerima_sewa, diterbitkan)
values ('00000000-0000-4000-d000-0000000000a1', 1, 'diterbitkan', 60000000, 24, 'sewa_tetap', 0, 'pemilik_spbu', now());

-- ---------------------------------------------------------------- tenant 10A meminta survei
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a3","email":"tenant10a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000a1'; h date := public.hari_ini_wib();
begin
  v := public.tenant_survei_minta(v_p, '[]'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Permintaan tanpa usulan harus ditolak.';
  v := public.tenant_survei_minta(v_p, jsonb_build_array(jsonb_build_object('tanggal', h, 'waktu', 'pagi')));
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%besok%', 'Usulan hari ini harus ditolak.';
  v := public.tenant_survei_minta(v_p, jsonb_build_array(jsonb_build_object('tanggal', h + 200, 'waktu', 'pagi')));
  assert not (v ->> 'ok')::boolean, 'Usulan lebih dari 90 hari harus ditolak.';
  v := public.tenant_survei_minta(v_p, jsonb_build_array(jsonb_build_object('tanggal', h + 3, 'waktu', 'malam')));
  assert not (v ->> 'ok')::boolean, 'Pilihan waktu di luar pagi, siang, sore harus ditolak.';
  v := public.tenant_survei_minta(v_p, '[{"tanggal":"2027-02-31","waktu":"pagi"}]'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Tanggal yang tidak ada di kalender harus ditolak, bukan membuat galat.';
  v := public.tenant_survei_minta(v_p, jsonb_build_array(jsonb_build_object('tanggal', h + 3, 'waktu', 'pagi'), jsonb_build_object('tanggal', h + 3, 'waktu', 'pagi')));
  assert not (v ->> 'ok')::boolean, 'Dua usulan yang sama harus ditolak.';
  v := public.tenant_survei_minta(v_p, jsonb_build_array(jsonb_build_object('tanggal', h + 1, 'waktu', 'pagi'), jsonb_build_object('tanggal', h + 2, 'waktu', 'pagi'),
                                                         jsonb_build_object('tanggal', h + 3, 'waktu', 'pagi'), jsonb_build_object('tanggal', h + 4, 'waktu', 'pagi')));
  assert not (v ->> 'ok')::boolean, 'Lebih dari tiga usulan harus ditolak.';

  v := public.tenant_survei_minta(v_p, jsonb_build_array(jsonb_build_object('tanggal', h + 3, 'waktu', 'pagi', 'sisipan', 'x'), jsonb_build_object('tanggal', h + 5, 'waktu', 'sore')),
                                  'Dua orang dari tim kami akan datang.');
  assert (v ->> 'ok')::boolean, 'Permintaan yang benar harus tercatat: ' || (v ->> 'pesan');
  v := public.tenant_survei_minta(v_p, jsonb_build_array(jsonb_build_object('tanggal', h + 7, 'waktu', 'pagi')));
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%berjalan%', 'Permintaan kedua saat masih ada yang berjalan harus ditolak.';

  v := public.tenant_survei(v_p);
  assert jsonb_array_length(v) = 1 and v -> 0 ->> 'status' = 'diminta' and jsonb_array_length(v -> 0 -> 'usulan') = 2
     and not (v -> 0 -> 'usulan' -> 0 ? 'sisipan'), 'Tenant melihat permintaannya, dan isi usulan hanya tanggal dan waktu.';
  assert jsonb_array_length(public.tenant_penawaran_rinci(v_p) -> 'tanggapan') = 1, 'Permintaan survei juga tercatat sebagai tanggapan.';
  begin
    perform 1 from public.survei_lokasi;
    assert (select count(*) from public.survei_lokasi) = 0, 'Tabel survei tertutup bagi tenant.';
  exception when insufficient_privilege then null;
  end;
  -- tenant tidak boleh memakai fungsi NFR
  v := public.survei_jadwalkan(v_p, h + 3, '10:00', 'Nama Pendamping');
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh menetapkan jadwal.';
end $$;
reset role;

-- ---------------------------------------------------------------- tenant lain
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a4","email":"tenant10b@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000a1';
begin
  assert jsonb_array_length(public.tenant_survei(v_p)) = 0, 'Tenant lain tidak boleh melihat survei tenant 10A.';
  v := public.tenant_survei_batalkan(v_p);
  assert not (v ->> 'ok')::boolean, 'Tenant lain tidak boleh membatalkan survei tenant 10A.';
  v := public.tenant_survei_minta(v_p, jsonb_build_array(jsonb_build_object('tanggal', public.hari_ini_wib() + 3, 'waktu', 'pagi')));
  assert not (v ->> 'ok')::boolean, 'Tenant lain tidak boleh meminta survei di penawaran tenant 10A.';
end $$;
reset role;

-- ---------------------------------------------------------------- auditor: hanya membaca
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a2","email":"auditor10@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000a1';
begin
  assert jsonb_array_length(public.survei_peluang(v_p)) = 1, 'Auditor boleh membaca survei.';
  v := public.survei_jadwalkan(v_p, public.hari_ini_wib() + 3, '10:00', 'Nama Pendamping');
  assert not (v ->> 'ok')::boolean, 'Auditor tidak boleh menetapkan jadwal.';
end $$;
reset role;

-- ---------------------------------------------------------------- analis menetapkan jadwal
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","email":"analis10@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000a1'; h date := public.hari_ini_wib(); v_s uuid;
begin
  v := public.survei_peluang(v_p);
  v_s := (v -> 0 ->> 'id')::uuid;
  assert v -> 0 ->> 'catatan_tenant' like 'Dua orang%' and v -> 0 ->> 'diminta_oleh' = 'tenant10a@uji.invalid', 'NFR melihat permintaan tenant.';
  v := public.survei_jadwalkan(v_p, h - 1, '10:00', 'Nama Pendamping');
  assert not (v ->> 'ok')::boolean, 'Tanggal yang sudah lewat harus ditolak.';
  v := public.survei_jadwalkan(v_p, h + 3, '25:00', 'Nama Pendamping');
  assert not (v ->> 'ok')::boolean, 'Jam yang tidak ada harus ditolak.';
  v := public.survei_jadwalkan(v_p, h + 3, '10:00', '');
  assert not (v ->> 'ok')::boolean, 'Jadwal tanpa pendamping harus ditolak.';
  v := public.survei_selesai(v_s, 'Ruang sesuai data, akses mudah.');
  assert not (v ->> 'ok')::boolean, 'Survei yang belum dijadwalkan tidak bisa dicatat selesai.';
  v := public.survei_jadwalkan(v_p, h + 3, '10:00', 'Nama Pendamping', 'Bertemu di kantor SPBU.');
  assert (v ->> 'ok')::boolean and v ->> 'pesan' like '%ditetapkan%', 'Jadwal harus tercatat.';
  v := public.survei_jadwalkan(v_p, h + 4, '14:30', 'Nama Pendamping');
  assert (v ->> 'ok')::boolean and v ->> 'pesan' like '%diubah%', 'Jadwal harus bisa diubah.';
  assert (select count(*) from public.survei_lokasi where peluang_id = v_p) = 1, 'Mengubah jadwal tidak membuat survei baru.';
  v := public.survei_selesai(v_s, 'Ruang sesuai data, akses mudah.');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%belum sampai%', 'Survei yang tanggalnya belum tiba tidak bisa dicatat selesai.';
  assert (select tahap from public.peluang where id = v_p) = 'survei', 'Survei tidak memindahkan tahap peluang.';
end $$;
reset role;

-- ---------------------------------------------------------------- tenant melihat jadwal, lalu membatalkan
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a3","email":"tenant10a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000a1';
begin
  v := public.tenant_survei(v_p);
  assert v -> 0 ->> 'status' = 'dijadwalkan' and v -> 0 ->> 'jadwal_jam' = '14:30' and v -> 0 ->> 'pendamping' = 'Nama Pendamping',
    'Tenant melihat jadwal dan pendampingnya.';
  assert not (v -> 0 ? 'hasil') and not (v -> 0 ? 'dijadwalkan_oleh') and v::text not like '%analis10@uji.invalid%',
    'Tenant tidak melihat catatan hasil dan identitas staf NFR.';
  v := public.tenant_survei_batalkan(v_p, 'Tim kami berhalangan.');
  assert (v ->> 'ok')::boolean, 'Tenant boleh membatalkan surveinya.';
  v := public.tenant_survei_batalkan(v_p);
  assert not (v ->> 'ok')::boolean, 'Tidak ada lagi yang bisa dibatalkan.';
  v := public.tenant_survei_minta(v_p, jsonb_build_array(jsonb_build_object('tanggal', public.hari_ini_wib() + 6, 'waktu', 'siang')));
  assert (v ->> 'ok')::boolean, 'Setelah batal, tenant boleh mengusulkan waktu baru.';
  assert jsonb_array_length(public.tenant_survei(v_p)) = 2, 'Riwayat survei tetap tersimpan.';
end $$;
reset role;

-- ---------------------------------------------------------------- analis: selesai dan batal
-- jadwal dimundurkan langsung di tabel untuk meniru survei yang tanggalnya sudah tiba
update public.survei_lokasi set status = 'dijadwalkan', jadwal_tanggal = public.hari_ini_wib() - 1, jadwal_jam = '10:00', pendamping = 'Nama Pendamping'
where peluang_id = '00000000-0000-4000-d000-0000000000a1' and status = 'diminta';

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","email":"analis10@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000a1'; v_s uuid;
begin
  select id into v_s from public.survei_lokasi where peluang_id = v_p and status = 'dijadwalkan';
  v := public.survei_selesai(v_s, 'pendek');
  assert not (v ->> 'ok')::boolean, 'Hasil yang terlalu pendek harus ditolak.';
  v := public.survei_selesai(v_s, 'Ruang sesuai data, akses mudah, listrik perlu ditambah.');
  assert (v ->> 'ok')::boolean, 'Survei yang tanggalnya sudah tiba bisa dicatat selesai.';
  v := public.survei_batalkan(v_s, 'Alasan yang cukup panjang.');
  assert not (v ->> 'ok')::boolean, 'Survei yang sudah selesai tidak bisa dibatalkan.';
  -- NFR menjadwalkan tanpa permintaan tenant, lalu membatalkan
  v := public.survei_jadwalkan(v_p, public.hari_ini_wib() + 2, '09:00', 'Nama Pendamping');
  assert (v ->> 'ok')::boolean, 'NFR boleh menjadwalkan survei tanpa permintaan tenant.';
  select id into v_s from public.survei_lokasi where peluang_id = v_p and status = 'dijadwalkan';
  v := public.survei_batalkan(v_s, 'singkat');
  assert not (v ->> 'ok')::boolean, 'Batal oleh NFR butuh alasan.';
  v := public.survei_batalkan(v_s, 'Pengelola SPBU berhalangan pada tanggal itu.');
  assert (v ->> 'ok')::boolean, 'NFR boleh membatalkan dengan alasan.';
  assert (select count(*) from public.audit_peristiwa where entitas_id = v_p::text and peristiwa like 'survei_%') = 8,
    'Tiap langkah survei tercatat di jejak audit: ' || (select string_agg(peristiwa, ',' order by waktu, id) from public.audit_peristiwa where entitas_id = v_p::text and peristiwa like 'survei_%');
end $$;
reset role;

-- hasil survei tidak terbaca tenant
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a3","email":"tenant10a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb := public.tenant_survei('00000000-0000-4000-d000-0000000000a1');
begin
  assert jsonb_array_length(v) = 3 and v::text not like '%listrik perlu ditambah%', 'Catatan hasil survei tidak boleh terbaca tenant.';
  -- ketiga survei dibuat dalam satu transaksi uji, jadi urutannya tidak dipakai; dicari lewat pihak yang membatalkan
  assert exists (select 1 from jsonb_array_elements(v) x where x ->> 'dibatalkan_pihak' = 'nfr' and x ->> 'alasan_batal' like 'Pengelola SPBU%'),
    'Tenant melihat alasan pembatalan dari NFR.';
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.tenant_survei('00000000-0000-4000-d000-0000000000a1');
  assert false, 'Pengunjung tanpa akun tidak boleh memanggil fungsi survei.';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji jadwal survei (usulan tenant, jadwal dan pendamping oleh NFR, selesai setelah tanggalnya, batal dua arah, hasil tertutup bagi tenant).'
