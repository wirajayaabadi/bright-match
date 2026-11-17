-- Uji otomatis penjelajah lokasi tenant: tertutup secara bawaan, hanya ruang yang layak, minat, dan tindak lanjut NFR.
-- Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000d1', 'admin13@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000d2', 'analis13@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000d3', 'tenant13a@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000d4', 'tenant13b@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-0000000000d1', 'Tenant Uji 13A', 'tenant', true),
  ('00000000-0000-4000-b000-0000000000d2', 'Tenant Uji 13B', 'tenant', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select u.id, o.id, u.peran from public.organisasi o,
  (values ('00000000-0000-4000-a000-0000000000d1'::uuid, 'nfr_admin'), ('00000000-0000-4000-a000-0000000000d2'::uuid, 'nfr_analis')) u(id, peran)
where o.jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-0000000000d3', '00000000-0000-4000-b000-0000000000d1', 'tenant_perwakilan'),
  ('00000000-0000-4000-a000-0000000000d4', '00000000-0000-4000-b000-0000000000d2', 'tenant_admin');

-- Lima ruang kosong tanpa temuan kritis: a1, a2, a3, a4 di DKI Jakarta (empat SPBU berbeda), b1 di Banten.
create temporary table uji_l on commit drop as
with calon as (
  select distinct on (l.spbu_id) l.lahan_id, l.spbu_id, l.kode, s.nomor, s.kota, s.provinsi, l.luas_m2
  from public.lahan l join public.spbu s on s.id = l.spbu_id
  where l.status = 'Tersedia' and not l.duplikat and l.luas_m2 > 0 and s.provinsi in ('DKI Jakarta', 'Banten')
    and not exists (select 1 from public.masalah_data m where m.tingkat = 'kritis' and m.status in ('terbuka', 'ditinjau') and l.lahan_id = any (m.lahan_ids))
    and not exists (select 1 from public.peluang p where p.lahan_id = l.lahan_id)
  order by l.spbu_id, l.lahan_id
)
select case when c.provinsi = 'Banten' then 'b' else 'a' end || row_number() over (partition by c.provinsi order by c.spbu_id) as nama, c.*
from calon c;
delete from uji_l where nama not in ('a1', 'a2', 'a3', 'a4', 'b1');
grant select on uji_l to authenticated;
do $$ begin assert (select count(*) from uji_l) = 5, 'Persiapan: butuh lima ruang uji, dapat ' || (select count(*) from uji_l); end $$;

-- a1, a2, a4, b1 terverifikasi; a3 belum; a4 sedang menuju kontrak dengan pihak lain
insert into public.status_lahan (spbu_id, lahan_id, lahan_kode, status_data, kesiapan, sidik_sumber, diverifikasi, diverifikasi_oleh)
select u.spbu_id, u.lahan_id, u.kode, 'terverifikasi', 'siap', public.sidik_lahan(l), now(), 'uji'
from uji_l u join public.lahan l on l.spbu_id = u.spbu_id and l.lahan_id = u.lahan_id and not l.duplikat where u.nama in ('a1', 'a2', 'a4', 'b1');
insert into public.peluang (id, lahan_id, lahan_kode, spbu_id, spbu_nomor, kota, provinsi, tenant_kunci, tenant_nama, segmen, tahap)
select '00000000-0000-4000-d000-0000000000e1', u.lahan_id, u.kode, u.spbu_id, u.nomor, u.kota, u.provinsi, 'ujitigabelas', 'Pihak Lain Rahasia', 'F&B / Kuliner', 'kontrak'
from uji_l u where u.nama = 'a4';

-- ---------------------------------------------------------------- sebelum dibuka
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000d3","email":"tenant13a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.tenant_jelajah();
  assert jsonb_array_length(v -> 'akses') = 0 and (v ->> 'total')::int = 0 and jsonb_array_length(v -> 'lokasi') = 0, 'Tanpa akses, tenant tidak melihat lokasi apa pun.';
  v := public.tenant_minati((select lahan_id from uji_l where nama = 'a1'));
  assert not (v ->> 'ok')::boolean, 'Tanpa akses, tenant tidak boleh menyatakan minat.';
  v := public.jelajah_atur('00000000-0000-4000-b000-0000000000d1', array['DKI Jakarta']);
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh membuka aksesnya sendiri.';
  assert jsonb_array_length(public.jelajah_pilihan()) = 0, 'Daftar provinsi hanya untuk tim NFR.';
end $$;
reset role;

-- ---------------------------------------------------------------- analis tidak boleh membuka; admin boleh
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000d2","email":"analis13@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.jelajah_atur('00000000-0000-4000-b000-0000000000d1', array['DKI Jakarta']);
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%admin%', 'Membuka wilayah adalah keputusan admin NFR.';
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000d1","email":"admin13@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; x jsonb;
begin
  v := public.jelajah_atur('00000000-0000-4000-b000-0000000000d1', array['Provinsi Khayalan']);
  assert not (v ->> 'ok')::boolean, 'Provinsi yang tidak ada harus ditolak.';
  v := public.jelajah_atur((select id from public.organisasi where jenis = 'nfr' limit 1), array['DKI Jakarta']);
  assert not (v ->> 'ok')::boolean, 'Penjelajah hanya untuk organisasi tenant.';
  v := public.jelajah_atur('00000000-0000-4000-b000-0000000000d1', array['DKI Jakarta', 'DKI Jakarta', '']);
  assert (v ->> 'ok')::boolean and v ->> 'pesan' like '%1 provinsi%', 'Admin membuka satu provinsi: ' || (v ->> 'pesan');
  select o into x from jsonb_array_elements(public.organisasi_daftar()) o where o ->> 'id' = '00000000-0000-4000-b000-0000000000d1';
  assert x -> 'jelajah' = '["DKI Jakarta"]'::jsonb, 'Daftar organisasi memuat wilayah yang dibuka.';
  select o into x from jsonb_array_elements(public.jelajah_pilihan()) o where o ->> 'provinsi' = 'DKI Jakarta';
  assert (x ->> 'layak')::int = 2, 'DKI Jakarta punya dua ruang layak (a1, a2); a3 belum diverifikasi, a4 menuju kontrak: ' || (x ->> 'layak');
end $$;
reset role;

-- ---------------------------------------------------------------- tenant 13A menjelajah
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000d3","email":"tenant13a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; a1 text; a2 text; a3 text; a4 text; b1 text; k text;
begin
  select lahan_id into a1 from uji_l where nama = 'a1'; select lahan_id into a2 from uji_l where nama = 'a2'; select lahan_id into a3 from uji_l where nama = 'a3';
  select lahan_id into a4 from uji_l where nama = 'a4'; select lahan_id into b1 from uji_l where nama = 'b1'; select kota into k from uji_l where nama = 'a1';
  v := public.tenant_jelajah();
  assert (v ->> 'total')::int = 2 and jsonb_array_length(v -> 'lokasi') = 2, 'Tenant melihat dua ruang layak di provinsi yang dibuka: ' || (v ->> 'total');
  assert not exists (select 1 from jsonb_array_elements(v -> 'lokasi') x where x ->> 'lahan_id' in (a3, a4, b1)),
    'Ruang yang belum diverifikasi, yang menuju kontrak, dan yang di provinsi lain tidak tampil.';
  assert not (v -> 'lokasi' -> 0 ? 'harga') and not (v -> 'lokasi' -> 0 ? 'outlet') and v::text not like '%Pihak Lain Rahasia%',
    'Penjelajah tidak membawa tarif, nama penyewa, atau pihak lain.';
  assert (public.tenant_jelajah(p_kota => 'Kota Khayalan') ->> 'total')::int = 0 and (public.tenant_jelajah(p_luas_min => 1000000) ->> 'total')::int = 0
     and (public.tenant_jelajah(p_kota => k) ->> 'total')::int >= 1 and (public.tenant_jelajah(p_provinsi => 'Banten') ->> 'total')::int = 0,
    'Saringan kota, luas, dan provinsi bekerja, dan tidak membuka provinsi lain.';
  v := public.tenant_minati(b1);
  assert not (v ->> 'ok')::boolean, 'Minat pada ruang di provinsi yang tidak dibuka harus ditolak.';
  v := public.tenant_minati(a3);
  assert not (v ->> 'ok')::boolean, 'Minat pada ruang yang belum diverifikasi harus ditolak.';
  v := public.tenant_minati(a4);
  assert not (v ->> 'ok')::boolean, 'Minat pada ruang yang menuju kontrak dengan pihak lain harus ditolak.';
  v := public.tenant_minati(a1, 'Kami ingin membuka gerai kopi.');
  assert (v ->> 'ok')::boolean and v ->> 'pesan' like '%tidak mengikat%', 'Minat tercatat dan dinyatakan tidak mengikat.';
  v := public.tenant_minati(a1);
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%sudah tercatat%', 'Minat kedua pada ruang yang sama ditolak.';
  assert exists (select 1 from jsonb_array_elements(public.tenant_jelajah() -> 'lokasi') x where x ->> 'lahan_id' = a1 and x ->> 'diminati' is not null),
    'Ruang yang sudah diminati ditandai di penjelajah.';
  assert (select count(*) from public.minat_lokasi) = 0 and (select count(*) from public.akses_jelajah) = 0 and (select count(*) from public.status_lahan) = 0,
    'Tabel minat, akses, dan status lahan tertutup bagi tenant.';
  assert (select count(*) from public.peluang) = 0, 'Menyatakan minat tidak membuat peluang.';
end $$;
reset role;

-- ---------------------------------------------------------------- tenant 13B tidak punya akses
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000d4","email":"tenant13b@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  assert (public.tenant_jelajah() ->> 'total')::int = 0, 'Akses satu organisasi tidak berlaku untuk organisasi lain.';
  v := public.tenant_minati((select lahan_id from uji_l where nama = 'a1'));
  assert not (v ->> 'ok')::boolean, 'Tenant tanpa akses tidak boleh menyatakan minat.';
  assert jsonb_array_length(public.minat_daftar(null)) = 0, 'Daftar minat hanya untuk tim NFR.';
end $$;
reset role;

-- ---------------------------------------------------------------- analis menindaklanjuti
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000d2","email":"analis13@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_m uuid;
begin
  v := public.minat_daftar();
  assert jsonb_array_length(v) = 1 and v -> 0 ->> 'organisasi' = 'Tenant Uji 13A' and v -> 0 ->> 'catatan' like 'Kami ingin%' and v -> 0 ->> 'peluang_id' is null,
    'Analis melihat minat baru beserta organisasinya; belum ada peluang.';
  v_m := (v -> 0 ->> 'id')::uuid;
  v := public.minat_tangani(v_m, 'ditutup', 'singkat');
  assert not (v ->> 'ok')::boolean, 'Menutup minat butuh alasan.';
  v := public.minat_tangani(v_m, 'diterima');
  assert not (v ->> 'ok')::boolean, 'Status yang tidak dikenal ditolak.';
  v := public.minat_tangani(v_m, 'ditindaklanjuti');
  assert (v ->> 'ok')::boolean, 'Analis menandai minat sedang ditindaklanjuti.';
  v := public.minat_tangani(v_m, 'ditindaklanjuti');
  assert not (v ->> 'ok')::boolean, 'Menandai dua kali ditolak.';
  assert jsonb_array_length(public.minat_daftar()) = 0 and jsonb_array_length(public.minat_daftar('ditindaklanjuti')) = 1, 'Saringan status bekerja.';
  v := public.minat_tangani(v_m, 'ditutup', 'Ruang itu ternyata sudah dijanjikan ke pihak lain.');
  assert (v ->> 'ok')::boolean, 'Analis menutup minat dengan alasan.';
end $$;
reset role;

-- setelah ditutup, tenant boleh menyatakan minat lagi; catatan internal NFR tidak terbaca tenant
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000d3","email":"tenant13a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  assert public.tenant_jelajah()::text not like '%dijanjikan ke pihak lain%', 'Catatan internal NFR tidak terbaca tenant.';
  v := public.tenant_minati((select lahan_id from uji_l where nama = 'a1'));
  assert (v ->> 'ok')::boolean, 'Setelah minat ditutup, tenant boleh menyatakan minat lagi.';
end $$;
reset role;

-- verifikasi a2 gugur: ruangnya hilang dari penjelajah
update public.status_lahan set status_data = null where lahan_id = (select lahan_id from uji_l where nama = 'a2');
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000d3","email":"tenant13a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ begin assert (public.tenant_jelajah() ->> 'total')::int = 1, 'Ruang yang verifikasinya gugur tidak lagi tampil.'; end $$;
reset role;

-- admin menutup akses
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000d1","email":"admin13@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.jelajah_atur('00000000-0000-4000-b000-0000000000d1', '{}');
  assert (v ->> 'ok')::boolean and v ->> 'pesan' like '%ditutup%', 'Admin menutup penjelajah.';
  assert (select count(*) from public.audit_peristiwa where peristiwa = 'akses_jelajah_diubah' and entitas_id = '00000000-0000-4000-b000-0000000000d1') = 2
     and (select count(*) from public.audit_peristiwa where peristiwa like 'minat_lokasi_%' and data ->> 'organisasi_id' = '00000000-0000-4000-b000-0000000000d1') = 4,
    'Buka, tutup, minat, dan tindak lanjutnya tercatat di jejak audit.';
end $$;
reset role;
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000d3","email":"tenant13a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ begin assert (public.tenant_jelajah() ->> 'total')::int = 0, 'Setelah ditutup, tenant tidak melihat lokasi apa pun.'; end $$;
reset role;

set local role anon;
do $$
begin
  perform public.tenant_jelajah();
  assert false, 'Pengunjung tanpa akun tidak boleh memanggil penjelajah.';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji penjelajah lokasi (tertutup secara bawaan, dibuka admin per provinsi, hanya ruang layak, minat tidak mengikat, tindak lanjut NFR).'
