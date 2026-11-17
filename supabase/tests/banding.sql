-- Uji otomatis banding penawaran tenant: paling banyak tiga, urutan dipertahankan, tertutup antar organisasi.
-- Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000091', 'analis9@uji.invalid'),
  ('00000000-0000-4000-a000-000000000093', 'tenant9a@uji.invalid'),
  ('00000000-0000-4000-a000-000000000094', 'tenant9b@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-000000000091', 'Tenant Uji 9A', 'tenant', true),
  ('00000000-0000-4000-b000-000000000092', 'Tenant Uji 9B', 'tenant', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000091', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-000000000093', '00000000-0000-4000-b000-000000000091', 'tenant_perwakilan'),
  ('00000000-0000-4000-a000-000000000094', '00000000-0000-4000-b000-000000000092', 'tenant_admin');

-- Lima peluang di lima lahan kosong: nomor 1 sampai 4 untuk tenant 9A (nomor 4 sudah berakhir), nomor 5 untuk tenant 9B.
insert into public.peluang (id, lahan_id, lahan_kode, spbu_id, spbu_nomor, kota, provinsi, tenant_kunci, tenant_nama, segmen, tahap, organisasi_tenant, dibagikan)
select ('00000000-0000-4000-d000-00000000009' || x.urut)::uuid, x.lahan_id, x.kode, x.spbu_id, x.nomor, x.kota, x.provinsi, 'ujisembilan' || x.urut, 'Tenant Uji 9', 'F&B / Kuliner',
       case when x.urut = 4 then 'menolak' else 'penawaran' end,
       case when x.urut = 5 then '00000000-0000-4000-b000-000000000092'::uuid else '00000000-0000-4000-b000-000000000091'::uuid end,
       now() - make_interval(hours => x.urut::int)
from (select l.lahan_id, l.kode, l.spbu_id, s.nomor, s.kota, s.provinsi, row_number() over (order by l.lahan_id) as urut
      from public.lahan l join public.spbu s on s.id = l.spbu_id where l.status = 'Tersedia' and not l.duplikat order by l.lahan_id limit 5) x;
insert into public.penawaran_versi (peluang_id, versi, status, sewa_tahunan, lama_sewa_bulan, skema, bebas_sewa_bulan, penerima_sewa, diterbitkan)
select p.id, 1, 'diterbitkan', 12000000 * right(p.id::text, 1)::int, 24, 'sewa_tetap', 0, 'pemilik_spbu', now()
from public.peluang p where p.tenant_kunci like 'ujisembilan%';
-- dua versi skenario kelayakan tenant 9A di penawaran nomor 2
insert into public.skenario_kelayakan (peluang_id, organisasi_id, versi, nama, model, penawaran_versi, sewa, asumsi, hasil)
values ('00000000-0000-4000-d000-000000000092', '00000000-0000-4000-b000-000000000091', 1, 'Lama', 'ritel', 1, '{}', '{"rahasia":1}', '{"dasar":{"laba_operasi":1}}'),
       ('00000000-0000-4000-d000-000000000092', '00000000-0000-4000-b000-000000000091', 2, 'Baru', 'ritel', 1, '{}', '{"rahasia":2}', '{"dasar":{"laba_operasi":7500000}}');

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000093","email":"tenant9a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
  p1 uuid := '00000000-0000-4000-d000-000000000091'; p2 uuid := '00000000-0000-4000-d000-000000000092';
  p3 uuid := '00000000-0000-4000-d000-000000000093'; p4 uuid := '00000000-0000-4000-d000-000000000094';
  p5 uuid := '00000000-0000-4000-d000-000000000095';
begin
  -- tanpa pilihan: tiga terbaru yang belum berakhir
  v := public.tenant_penawaran_banding();
  assert jsonb_array_length(v -> 'daftar') = 4, 'Daftar harus memuat keempat penawaran tenant 9A, termasuk yang berakhir.';
  assert jsonb_array_length(v -> 'banding') = 3 and v -> 'banding' -> 0 ->> 'id' = p1::text and v -> 'banding' -> 2 ->> 'id' = p3::text,
    'Tanpa pilihan, banding memuat tiga penawaran terbaru yang belum berakhir.';
  -- urutan permintaan dipertahankan, kembar dibuang, paling banyak tiga
  v := public.tenant_penawaran_banding(array[p3, p1, p3, p4, p2]);
  assert jsonb_array_length(v -> 'banding') = 3 and v -> 'banding' -> 0 ->> 'id' = p3::text and v -> 'banding' -> 1 ->> 'id' = p1::text
     and v -> 'banding' -> 2 ->> 'id' = p4::text, 'Urutan pilihan dipertahankan, kembar dibuang, paling banyak tiga.';
  -- penawaran organisasi lain dan id yang tidak ada dibuang diam-diam
  v := public.tenant_penawaran_banding(array[p5, p2, '00000000-0000-4000-d000-0000000000ff'::uuid]);
  assert jsonb_array_length(v -> 'banding') = 1 and v -> 'banding' -> 0 ->> 'id' = p2::text, 'Penawaran tenant lain tidak boleh ikut dibandingkan.';
  -- ringkasan kelayakan: versi terbaru saja, tanpa asumsi
  assert v -> 'banding' -> 0 -> 'kelayakan' ->> 'versi' = '2' and v -> 'banding' -> 0 -> 'kelayakan' -> 'dasar' ->> 'laba_operasi' = '7500000',
    'Ringkasan kelayakan harus dari versi terbaru.';
  assert not (v -> 'banding' -> 0 -> 'kelayakan') ? 'asumsi', 'Ringkasan kelayakan tidak membawa asumsi.';
  assert v -> 'banding' -> 0 -> 'syarat' ->> 'sewa_tahunan' = '24000000', 'Syarat sewa harus dari versi penawaran yang berlaku.';
  assert not (v -> 'banding' -> 0) ? 'tanggapan' and not (v -> 'banding' -> 0) ? 'foto_spbu', 'Banding hanya membawa kolom yang dipakai.';
  v := public.tenant_penawaran_banding(array[p1]);
  assert v -> 'banding' -> 0 -> 'kelayakan' = 'null'::jsonb, 'Penawaran tanpa skenario tersimpan: kelayakan kosong, bukan angka tiruan.';
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000094","email":"tenant9b@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.tenant_penawaran_banding(array['00000000-0000-4000-d000-000000000092'::uuid, '00000000-0000-4000-d000-000000000095'::uuid]);
  assert jsonb_array_length(v -> 'daftar') = 1 and jsonb_array_length(v -> 'banding') = 1 and v -> 'banding' -> 0 ->> 'id' = '00000000-0000-4000-d000-000000000095',
    'Tenant 9B hanya melihat penawarannya sendiri.';
  assert v -> 'banding' -> 0 -> 'kelayakan' = 'null'::jsonb, 'Skenario kelayakan tenant 9A tidak boleh terbaca tenant 9B.';
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000091","email":"analis9@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.tenant_penawaran_banding(array['00000000-0000-4000-d000-000000000092'::uuid]);
  assert jsonb_array_length(v -> 'daftar') = 0 and jsonb_array_length(v -> 'banding') = 0, 'Analis NFR bukan tenant: banding kosong.';
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.tenant_penawaran_banding();
  assert false, 'Pengunjung tanpa akun tidak boleh memanggil banding.';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji banding penawaran (paling banyak tiga, urutan pilihan, tertutup antar tenant, kelayakan versi terbaru tanpa asumsi).'
