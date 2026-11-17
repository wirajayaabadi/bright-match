-- Uji otomatis penyimpanan skenario kelayakan: milik organisasi tenant, tertutup bagi tenant lain dan bagi NFR.
-- Rumusnya sendiri diuji di tests/kelayakan.test.mjs. Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000071', 'analis8@uji.invalid'),
  ('00000000-0000-4000-a000-000000000073', 'tenant8a@uji.invalid'),
  ('00000000-0000-4000-a000-000000000074', 'tenant8b@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-000000000071', 'Tenant Uji 8A', 'tenant', true),
  ('00000000-0000-4000-b000-000000000072', 'Tenant Uji 8B', 'tenant', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000071', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-000000000073', '00000000-0000-4000-b000-000000000071', 'tenant_perwakilan'),
  ('00000000-0000-4000-a000-000000000074', '00000000-0000-4000-b000-000000000072', 'tenant_admin');

-- Persiapan langsung: satu peluang dengan versi penawaran terbit, dibagikan ke tenant 8A.
insert into public.peluang (id, lahan_id, lahan_kode, spbu_id, spbu_nomor, kota, provinsi, tenant_kunci, tenant_nama, segmen, tahap, organisasi_tenant, dibagikan)
select '00000000-0000-4000-d000-000000000071', l.lahan_id, l.kode, l.spbu_id, s.nomor, s.kota, s.provinsi, 'ujidelapan', 'Tenant Uji 8A', 'F&B / Kuliner',
       'penawaran', '00000000-0000-4000-b000-000000000071', now()
from public.lahan l join public.spbu s on s.id = l.spbu_id where l.status = 'Tersedia' and not l.duplikat order by l.lahan_id limit 1;
insert into public.penawaran_versi (id, peluang_id, versi, status, sewa_tahunan, lama_sewa_bulan, skema, bagi_hasil_pct, bebas_sewa_bulan, deposit, penerima_sewa, diterbitkan)
values ('00000000-0000-4000-d000-000000000072', '00000000-0000-4000-d000-000000000071', 3, 'diterbitkan', 60000000, 24, 'campuran', 5, 2, 5000000, 'pemilik_spbu', now());

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000073","email":"tenant8a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-000000000071';
begin
  assert jsonb_array_length(public.kelayakan_daftar(v_p)) = 0, 'Belum ada skenario.';
  v := public.kelayakan_simpan(v_p, '', 'ritel', '{"kunjungan_per_hari":400}'::jsonb, '{"dasar":{}}'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Skenario tanpa nama harus ditolak.';
  v := public.kelayakan_simpan(v_p, 'Dasar', 'kedai', '{}'::jsonb, '{}'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Model yang tidak dikenal harus ditolak.';
  v := public.kelayakan_simpan(v_p, 'Dasar', 'ritel', '[1,2]'::jsonb, '{}'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Asumsi yang bukan objek harus ditolak.';
  v := public.kelayakan_simpan(v_p, 'Dasar', 'ritel', '{"kunjungan_per_hari":400,"rahasia":"margin 60"}'::jsonb, '{"dasar":{"laba_operasi":3500000}}'::jsonb);
  assert (v ->> 'ok')::boolean and (v ->> 'versi')::int = 1, 'Versi pertama harus tersimpan.';
  v := public.kelayakan_simpan(v_p, 'Buka 24 jam', 'ritel', '{"kunjungan_per_hari":600}'::jsonb, '{"dasar":{"laba_operasi":9000000}}'::jsonb);
  assert (v ->> 'versi')::int = 2, 'Menyimpan lagi harus membuat versi baru, bukan menimpa.';
  v := public.kelayakan_daftar(v_p);
  assert jsonb_array_length(v) = 2 and v -> 0 ->> 'nama' = 'Buka 24 jam' and v -> 1 -> 'asumsi' ->> 'kunjungan_per_hari' = '400',
    'Kedua versi harus terbaca pemiliknya, yang terbaru dulu, dan versi lama tidak berubah.';
  -- syarat sewa diambil dari versi penawaran yang berlaku, bukan dari klien
  assert v -> 0 ->> 'penawaran_versi' = '3' and v -> 0 -> 'sewa' ->> 'sewa_tahunan' = '60000000' and v -> 0 -> 'sewa' ->> 'bagi_hasil_pct' = '5',
    'Syarat sewa harus disalin dari versi penawaran yang berlaku.';
  begin
    perform 1 from public.skenario_kelayakan;
    assert false, 'Tabel skenario tidak boleh bisa dibaca langsung, bahkan oleh pemiliknya.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000074","email":"tenant8b@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-000000000071';
begin
  assert jsonb_array_length(public.kelayakan_daftar(v_p)) = 0, 'Tenant lain tidak boleh membaca skenario tenant 8A.';
  v := public.kelayakan_simpan(v_p, 'Menyusup', 'ritel', '{}'::jsonb, '{}'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Tenant lain tidak boleh menyimpan skenario di penawaran tenant 8A.';
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000071","email":"analis8@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v_p uuid := '00000000-0000-4000-d000-000000000071';
begin
  assert jsonb_array_length(public.kelayakan_daftar(v_p)) = 0, 'Tim NFR tidak boleh membaca asumsi keuangan tenant lewat fungsi.';
  begin
    perform 1 from public.skenario_kelayakan;
    assert false, 'Tim NFR tidak boleh membaca tabel skenario.';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.audit_peristiwa where peristiwa = 'skenario_kelayakan_disimpan' and entitas_id = v_p::text) = 2,
    'Jejak audit mencatat bahwa dua versi disimpan.';
  assert not exists (select 1 from public.audit_peristiwa where peristiwa = 'skenario_kelayakan_disimpan' and entitas_id = v_p::text
                     and (data::text like '%kunjungan%' or data::text like '%rahasia%' or data::text like '%laba_operasi%')),
    'Jejak audit tidak boleh memuat isi skenario.';
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji skenario kelayakan (versi tidak ditimpa, sewa dari penawaran, tertutup bagi tenant lain dan bagi NFR).'
