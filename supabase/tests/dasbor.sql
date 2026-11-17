-- Uji otomatis dasbor eksekutif. Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
-- Bila uji gagal di tengah, psql berhenti tanpa menutup transaksi. Batas ini menutup sesi yang tertinggal,
-- dan membuat uji lain gagal cepat dengan pesan jelas, bukan menggantung menunggu kuncinya.
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000061', 'analis7@uji.invalid'),
  ('00000000-0000-4000-a000-000000000063', 'tenant7@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values ('00000000-0000-4000-b000-000000000061', 'Tenant Uji 7', 'tenant', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000061', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-000000000063', '00000000-0000-4000-b000-000000000061', 'tenant_admin');

do $_$ begin perform public.deteksi_masalah_data(); end $_$;

-- Satu lahan kosong bersih dijadikan terverifikasi, dan wewenang SPBU-nya dipastikan.
create temp table _bahan on commit drop as
select l.lahan_id, l.spbu_id from public.lahan l
where l.status = 'Tersedia' and not l.duplikat
  and not exists (select 1 from public.masalah_data m where l.lahan_id = any (m.lahan_ids))
  and not exists (select 1 from public.status_lahan s where s.spbu_id = l.spbu_id)
  and not exists (select 1 from public.hak_spbu h where h.spbu_id = l.spbu_id)
order by l.lahan_id limit 1;
grant select on _bahan to authenticated;

create temp table _awal on commit drop as select public.dasbor_nfr() as d;
grant select on _awal to authenticated;

insert into public.status_lahan (spbu_id, lahan_id, lahan_kode, status_data, kesiapan, sidik_sumber, diverifikasi, diverifikasi_oleh)
select l.spbu_id, l.lahan_id, l.kode, 'terverifikasi', 'siap', public.sidik_lahan(l), now(), 'persiapan-uji'
from public.lahan l, _bahan b where l.lahan_id = b.lahan_id and not l.duplikat;

do $$
declare a jsonb := (select d from _awal); d jsonb := public.dasbor_nfr();
begin
  assert (d ->> 'kosong_terverifikasi')::int = (a ->> 'kosong_terverifikasi')::int + 1, 'Lahan yang baru terverifikasi harus terhitung.';
  assert (d ->> 'kosong_boleh_ditawarkan')::int = (a ->> 'kosong_boleh_ditawarkan')::int, 'Tanpa wewenang yang dipastikan, lahan belum boleh ditawarkan.';
end $$;

insert into public.hak_spbu (spbu_id, spbu_nomor, pola, pemilik_aset, penyetuju, pihak_kontrak, penerima_sewa, dokumen, status, dipastikan, dipastikan_oleh)
select s.id, s.nomor, 'DODO', 'Pemilik uji', 'Pemilik uji', 'Pemilik uji', 'pemilik_spbu', 'Dokumen uji', 'dipastikan', now(), 'persiapan-uji'
from public.spbu s, _bahan b where s.id = b.spbu_id;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000061","email":"analis7@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare a jsonb := (select d from _awal); d jsonb := public.dasbor_nfr();
begin
  assert (d ->> 'kosong_boleh_ditawarkan')::int = (a ->> 'kosong_boleh_ditawarkan')::int + 1, 'Terverifikasi dan wewenang dipastikan: boleh ditawarkan.';
  assert (d ->> 'spbu')::int > 6000 and (d ->> 'lahan_kosong')::int > 5000, 'Analis NFR harus melihat jumlah SPBU dan lahan kosong.';
  -- konsisten dengan sumber kebenaran per lahan
  assert (d ->> 'kosong_tertahan_temuan')::int = (select count(*) from public.v_status_lahan where status_sumber = 'Tersedia' and status_data = 'disengketakan'),
    'Jumlah lahan tertahan di dasbor harus sama dengan status per lahan.';
  assert (d ->> 'lahan')::int = (d ->> 'lahan_tersewa')::int + (d ->> 'lahan_kosong')::int, 'Lahan = tersewa + kosong.';
  assert d -> 'nilai' ->> 'terealisasi' is null, 'Nilai terealisasi belum punya sumber data: harus kosong, bukan nol.';
  assert (d -> 'nilai' ->> 'perkiraan_tahunan')::numeric > 0 and (d -> 'nilai' ->> 'terkontrak_tahunan')::numeric >= 0, 'Nilai perkiraan dan terkontrak harus terpisah.';
  assert (d ->> 'peluang_berjalan')::int + (d ->> 'peluang_berakhir')::int = (select count(*) from public.peluang), 'Peluang berjalan + berakhir = semua peluang.';
  assert (d ->> 'peluang_berversi')::int = (select count(distinct v.peluang_id) from public.penawaran_versi v join public.peluang p on p.id = v.peluang_id
                                            where v.status = 'diterbitkan' and array_position(public.urutan_tahap(), p.tahap) >= 7),
    'Penawaran resmi terbit hanya menghitung peluang yang punya versi berlaku.';
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000063","email":"tenant7@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare d jsonb := public.dasbor_nfr();
begin
  assert (d ->> 'spbu')::int = 0 and (d ->> 'lahan_kosong')::int = 0 and (d ->> 'peluang_berjalan')::int = 0 and (d -> 'nilai' ->> 'perkiraan_tahunan')::numeric = 0,
    'Tenant tidak boleh mendapat angka apa pun dari dasbor NFR.';
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji dasbor (angka konsisten dengan status per lahan, nilai dipisah, terealisasi kosong, tertutup bagi tenant).'
