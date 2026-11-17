-- Uji otomatis jadwal survei di portal pengelola SPBU: cakupan SPBU, isi yang dibuka, tanda "sudah tahu", dan gugurnya tanda itu.
-- Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000b1', 'analis11@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000b2', 'dealer11a@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000b3', 'dealer11b@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000b4', 'tenant11@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-0000000000b1', 'Dealer Uji 11A', 'dealer', true),
  ('00000000-0000-4000-b000-0000000000b2', 'Dealer Uji 11B', 'dealer', true),
  ('00000000-0000-4000-b000-0000000000b3', 'Tenant Uji 11', 'tenant', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-0000000000b1', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-0000000000b2', '00000000-0000-4000-b000-0000000000b1', 'dealer_operator'),
  ('00000000-0000-4000-a000-0000000000b3', '00000000-0000-4000-b000-0000000000b2', 'dealer_admin'),
  ('00000000-0000-4000-a000-0000000000b4', '00000000-0000-4000-b000-0000000000b3', 'tenant_admin');

-- Dua peluang di dua SPBU berbeda. SPBU pertama dikelola dealer 11A, SPBU kedua dealer 11B.
create temporary table uji_lahan on commit drop as
select distinct on (l.spbu_id) l.lahan_id, l.kode, l.spbu_id, s.nomor, s.kota, s.provinsi
from public.lahan l join public.spbu s on s.id = l.spbu_id
where l.status = 'Tersedia' and not l.duplikat and not exists (select 1 from public.hak_spbu h where h.spbu_id = l.spbu_id)
order by l.spbu_id, l.lahan_id limit 2;
grant select on uji_lahan to authenticated;

insert into public.hak_spbu (spbu_id, spbu_nomor, organisasi_dealer)
select u.spbu_id, u.nomor, case when row_number() over (order by u.spbu_id) = 1 then '00000000-0000-4000-b000-0000000000b1'::uuid else '00000000-0000-4000-b000-0000000000b2'::uuid end
from uji_lahan u;
insert into public.peluang (id, lahan_id, lahan_kode, spbu_id, spbu_nomor, kota, provinsi, tenant_kunci, tenant_nama, segmen, tahap, organisasi_tenant, dibagikan)
select ('00000000-0000-4000-d000-0000000000b' || row_number() over (order by u.spbu_id))::uuid, u.lahan_id, u.kode, u.spbu_id, u.nomor, u.kota, u.provinsi,
       'ujisebelas' || row_number() over (order by u.spbu_id), 'Kopi Rahasia Sebelas', 'F&B / Kuliner', 'survei', '00000000-0000-4000-b000-0000000000b3', now()
from uji_lahan u;
insert into public.penawaran_versi (peluang_id, versi, status, sewa_tahunan, lama_sewa_bulan, skema, bebas_sewa_bulan, penerima_sewa, diterbitkan)
select p.id, 1, 'diterbitkan', 77000000, 24, 'sewa_tetap', 0, 'pemilik_spbu', now() from public.peluang p where p.tenant_kunci like 'ujisebelas%';

-- analis menjadwalkan survei di kedua SPBU
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b1","email":"analis11@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; h date := public.hari_ini_wib();
begin
  v := public.survei_jadwalkan('00000000-0000-4000-d000-0000000000b1', h + 3, '10:00', 'Pendamping Sebelas', 'Catatan khusus tenant sebelas.');
  assert (v ->> 'ok')::boolean, 'Jadwal pertama harus tercatat.';
  v := public.survei_jadwalkan('00000000-0000-4000-d000-0000000000b2', h + 5, '14:00', 'Pendamping Sebelas');
  assert (v ->> 'ok')::boolean, 'Jadwal kedua harus tercatat.';
  v := public.survei_peluang('00000000-0000-4000-d000-0000000000b1');
  assert (v -> 0 ->> 'dealer_terhubung')::boolean and v -> 0 ->> 'diketahui_dealer' is null, 'NFR melihat SPBU sudah ditautkan dan jadwal belum diketahui pengelola.';
end $$;
reset role;

-- ---------------------------------------------------------------- dealer 11A
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b2","email":"dealer11a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_s uuid; v_lain uuid; v_spbu text; v_spbu_lain text;
begin
  select spbu_id into v_spbu from uji_lahan order by spbu_id limit 1;
  select spbu_id into v_spbu_lain from uji_lahan order by spbu_id desc limit 1;
  v := public.dealer_survei();
  assert jsonb_array_length(v) = 1 and v -> 0 ->> 'spbu_id' = v_spbu and v -> 0 ->> 'jadwal_jam' = '10:00' and v -> 0 ->> 'pendamping' = 'Pendamping Sebelas'
     and v -> 0 ->> 'segmen' = 'F&B / Kuliner', 'Dealer 11A melihat satu survei di SPBU-nya, dengan jam, pendamping, dan jenis usaha.';
  assert v::text not like '%Kopi Rahasia%' and v::text not like '%77000000%' and v::text not like '%Catatan khusus%' and v::text not like '%tenant11@%'
     and not (v -> 0 ? 'hasil') and not (v -> 0 ? 'peluang_id'), 'Nama tenant, syarat sewa, dan catatan untuk tenant tidak dibuka ke pengelola.';
  assert jsonb_array_length(public.dealer_survei(v_spbu)) = 1 and jsonb_array_length(public.dealer_survei(v_spbu_lain)) = 0,
    'Saringan per SPBU bekerja dan tidak membuka SPBU lain.';
  v_s := (v -> 0 ->> 'id')::uuid;
  begin
    perform 1 from public.survei_lokasi;
    assert (select count(*) from public.survei_lokasi) = 0, 'Tabel survei tertutup bagi dealer.';
  exception when insufficient_privilege then null;
  end;
  v := public.dealer_survei_ketahui(v_s);
  assert (v ->> 'ok')::boolean, 'Dealer boleh menandai jadwal di SPBU-nya sudah diketahui.';
  v := public.dealer_survei_ketahui(v_s);
  assert (v ->> 'ok')::boolean and v ->> 'pesan' like '%sudah ditandai%', 'Menandai dua kali tidak membuat catatan baru.';
  assert public.dealer_survei() -> 0 ->> 'diketahui' is not null, 'Tanda diketahui tampil kembali ke dealer.';
  -- dealer tidak boleh memakai fungsi NFR
  v := public.survei_batalkan(v_s, 'Alasan yang cukup panjang.');
  assert not (v ->> 'ok')::boolean, 'Dealer tidak boleh membatalkan survei.';
end $$;
reset role;

-- ---------------------------------------------------------------- dealer 11B tidak boleh menyentuh SPBU dealer 11A
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b3","email":"dealer11b@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_s uuid;
begin
  v := public.dealer_survei();
  assert jsonb_array_length(v) = 1 and v -> 0 ->> 'jadwal_jam' = '14:00', 'Dealer 11B hanya melihat survei di SPBU-nya sendiri.';
  select id into v_s from (select (x ->> 'id')::uuid as id from jsonb_array_elements(v) x) y;
  -- id survei milik SPBU dealer 11A tidak diketahui dealer 11B; uji dengan id acak
  v := public.dealer_survei_ketahui('00000000-0000-4000-e000-0000000000ff');
  assert not (v ->> 'ok')::boolean, 'Survei yang tidak ada ditolak.';
end $$;
reset role;
do $$
declare v jsonb; v_s uuid;
begin
  select id into v_s from public.survei_lokasi where peluang_id = '00000000-0000-4000-d000-0000000000b1';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b3","email":"dealer11b@uji.invalid","role":"authenticated"}', true);
  set local role authenticated;
  v := public.dealer_survei_ketahui(v_s);
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%tidak ditemukan%', 'Dealer 11B tidak boleh menandai survei di SPBU dealer 11A.';
  reset role;
end $$;

-- ---------------------------------------------------------------- analis: melihat tanda, lalu mengubah jadwal
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b1","email":"analis11@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000b1';
begin
  v := public.survei_peluang(v_p);
  assert v -> 0 ->> 'diketahui_oleh' = 'dealer11a@uji.invalid', 'NFR melihat siapa pengelola yang sudah mengetahui jadwal.';
  v := public.survei_jadwalkan(v_p, public.hari_ini_wib() + 3, '10:00', 'Pendamping Lain');
  assert public.survei_peluang(v_p) -> 0 ->> 'diketahui_dealer' is not null, 'Mengganti pendamping saja tidak menggugurkan tanda diketahui.';
  v := public.survei_jadwalkan(v_p, public.hari_ini_wib() + 4, '10:00', 'Pendamping Lain');
  assert public.survei_peluang(v_p) -> 0 ->> 'diketahui_dealer' is null, 'Tanggal berubah: tanda diketahui gugur.';
  assert (select count(*) from public.audit_peristiwa where entitas_id = v_p::text and peristiwa = 'survei_diketahui_dealer') = 1, 'Tanda diketahui tercatat sekali di jejak audit.';
end $$;
reset role;

-- survei yang lewat, yang batal, dan yang belum dijadwalkan tidak tampil ke dealer
update public.survei_lokasi set jadwal_tanggal = public.hari_ini_wib() - 1 where peluang_id = '00000000-0000-4000-d000-0000000000b1';
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b2","email":"dealer11a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ begin assert jsonb_array_length(public.dealer_survei()) = 0, 'Survei yang tanggalnya sudah lewat tidak tampil ke dealer.'; end $$;
reset role;
update public.survei_lokasi set jadwal_tanggal = public.hari_ini_wib(), status = 'dibatalkan' where peluang_id = '00000000-0000-4000-d000-0000000000b1';
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b2","email":"dealer11a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ begin assert jsonb_array_length(public.dealer_survei()) = 0, 'Survei yang dibatalkan tidak tampil ke dealer.'; end $$;
reset role;

-- tenant tidak melihat siapa pengelola yang menandai
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b4","email":"tenant11@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb := public.tenant_survei('00000000-0000-4000-d000-0000000000b2');
begin
  assert jsonb_array_length(v) = 1 and not (v -> 0 ? 'diketahui_oleh') and not (v -> 0 ? 'diketahui_dealer'), 'Tenant tidak melihat tanda dari pengelola SPBU.';
  assert jsonb_array_length(public.dealer_survei()) = 0, 'Tenant bukan pengelola SPBU: daftar survei dealer kosong.';
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.dealer_survei();
  assert false, 'Pengunjung tanpa akun tidak boleh memanggil fungsi survei dealer.';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji survei di portal dealer (cakupan SPBU, nama tenant dan sewa tertutup, tanda sudah tahu, gugur saat jadwal berubah).'
