-- Uji otomatis dokumen per peluang: siapa boleh mengunggah, versi, keterlihatan, penarikan, dan akses berkas.
-- Berkasnya sendiri tidak diuji di sini (itu tugas rute unggah); yang diuji adalah catatan dan aturan aksesnya.
-- Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000c1', 'analis12@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000c2', 'auditor12@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000c3', 'tenant12a@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000c4', 'tenant12b@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000c5', 'dealer12@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-0000000000c1', 'Tenant Uji 12A', 'tenant', true),
  ('00000000-0000-4000-b000-0000000000c2', 'Tenant Uji 12B', 'tenant', true),
  ('00000000-0000-4000-b000-0000000000c3', 'Dealer Uji 12', 'dealer', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select u.id, o.id, u.peran from public.organisasi o,
  (values ('00000000-0000-4000-a000-0000000000c1'::uuid, 'nfr_analis'), ('00000000-0000-4000-a000-0000000000c2'::uuid, 'auditor')) u(id, peran)
where o.jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-0000000000c3', '00000000-0000-4000-b000-0000000000c1', 'tenant_perwakilan'),
  ('00000000-0000-4000-a000-0000000000c4', '00000000-0000-4000-b000-0000000000c2', 'tenant_admin'),
  ('00000000-0000-4000-a000-0000000000c5', '00000000-0000-4000-b000-0000000000c3', 'dealer_admin');

insert into public.peluang (id, lahan_id, lahan_kode, spbu_id, spbu_nomor, kota, provinsi, tenant_kunci, tenant_nama, segmen, tahap, organisasi_tenant, dibagikan)
select '00000000-0000-4000-d000-0000000000d1', l.lahan_id, l.kode, l.spbu_id, s.nomor, s.kota, s.provinsi, 'ujiduabelas', 'Tenant Uji 12A', 'F&B / Kuliner',
       'penawaran', '00000000-0000-4000-b000-0000000000c1', now()
from public.lahan l join public.spbu s on s.id = l.spbu_id
where l.status = 'Tersedia' and not l.duplikat and not exists (select 1 from public.hak_spbu h where h.spbu_id = l.spbu_id) order by l.lahan_id limit 1;
insert into public.penawaran_versi (peluang_id, versi, status, sewa_tahunan, lama_sewa_bulan, skema, bebas_sewa_bulan, penerima_sewa, diterbitkan)
values ('00000000-0000-4000-d000-0000000000d1', 1, 'diterbitkan', 60000000, 24, 'sewa_tetap', 0, 'pemilik_spbu', now());
insert into public.hak_spbu (spbu_id, spbu_nomor, organisasi_dealer)
select p.spbu_id, p.spbu_nomor, '00000000-0000-4000-b000-0000000000c3' from public.peluang p where p.id = '00000000-0000-4000-d000-0000000000d1';

create temporary table uji_dok (nama text primary key, id uuid) on commit drop;
grant select, insert on uji_dok to authenticated;

-- ---------------------------------------------------------------- analis mengunggah
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","email":"analis12@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000d1'; k text := 'dokumen/00000000-0000-4000-d000-0000000000d1/';
  h text := repeat('a', 64);
begin
  assert public.dokumen_boleh_unggah(v_p) = 'nfr' and public.dokumen_peran(v_p) = 'nfr', 'Analis mengunggah sebagai NFR.';
  v := public.dokumen_catat(v_p, 'penawaran', 'Surat penawaran', 'dokumen/00000000-0000-4000-d000-0000000000ff/11111111-1111-4111-8111-111111111111.pdf', 'surat.pdf', 'application/pdf', 1000, h);
  assert not (v ->> 'ok')::boolean, 'Alamat berkas di luar folder peluang ini harus ditolak.';
  v := public.dokumen_catat(v_p, 'penawaran', 'Surat penawaran', k || '11111111-1111-4111-8111-111111111111.exe', 'surat.exe', 'application/pdf', 1000, h);
  assert not (v ->> 'ok')::boolean, 'Ekstensi di luar pdf, jpg, png harus ditolak.';
  v := public.dokumen_catat(v_p, 'penawaran', 'Surat penawaran', k || '11111111-1111-4111-8111-111111111111.pdf', 'surat.pdf', 'application/zip', 1000, h);
  assert not (v ->> 'ok')::boolean, 'Tipe berkas di luar PDF, JPEG, PNG harus ditolak.';
  v := public.dokumen_catat(v_p, 'penawaran', 'Surat penawaran', k || '11111111-1111-4111-8111-111111111111.pdf', 'surat.pdf', 'application/pdf', 9000000, h);
  assert not (v ->> 'ok')::boolean, 'Berkas di atas batas ukuran harus ditolak.';
  v := public.dokumen_catat(v_p, 'rahasia', 'Surat penawaran', k || '11111111-1111-4111-8111-111111111111.pdf', 'surat.pdf', 'application/pdf', 1000, h);
  assert not (v ->> 'ok')::boolean, 'Jenis yang tidak dikenal harus ditolak.';
  v := public.dokumen_catat(v_p, 'penawaran', ' ', k || '11111111-1111-4111-8111-111111111111.pdf', 'surat.pdf', 'application/pdf', 1000, h);
  assert not (v ->> 'ok')::boolean, 'Dokumen tanpa judul harus ditolak.';

  -- berkas besar: jumlah bagian menentukan batas ukurannya
  v := public.dokumen_catat(v_p, 'kontrak', 'Kontrak pindai', k || '99999999-9999-4999-8999-999999999991.pdf', 'pindai.pdf', 'application/pdf', 12000000, h, false, false, null, 1);
  assert not (v ->> 'ok')::boolean, 'Berkas 12 MB dalam satu bagian harus ditolak.';
  v := public.dokumen_catat(v_p, 'kontrak', 'Kontrak pindai', k || '99999999-9999-4999-8999-999999999991.pdf', 'pindai.pdf', 'application/pdf', 12000000, h, false, false, null, 9);
  assert not (v ->> 'ok')::boolean, 'Lebih dari delapan bagian harus ditolak.';
  v := public.dokumen_catat(v_p, 'kontrak', 'Kontrak pindai', k || '99999999-9999-4999-8999-999999999991.pdf', 'pindai.pdf', 'application/pdf', 30000000, h, false, false, null, 8);
  assert not (v ->> 'ok')::boolean, 'Berkas di atas batas keseluruhan harus ditolak.';
  v := public.dokumen_catat(v_p, 'kontrak', 'Kontrak pindai', k || '99999999-9999-4999-8999-999999999991.pdf', 'pindai.pdf', 'application/pdf', 100, h, false, false, null, 4);
  assert not (v ->> 'ok')::boolean, 'Jumlah bagian yang tidak masuk akal untuk ukurannya harus ditolak.';
  assert public.dokumen_unggahan_bebas(v_p, '99999999-9999-4999-8999-999999999991'), 'Nomor unggahan yang belum dicatat harus bebas.';
  v := public.dokumen_catat(v_p, 'kontrak', 'Kontrak pindai', k || '99999999-9999-4999-8999-999999999991.pdf', 'pindai.pdf', 'application/pdf', 12000000, h, false, false, null, 4);
  assert (v ->> 'ok')::boolean, 'Berkas 12 MB dalam empat bagian harus tersimpan: ' || (v ->> 'pesan');
  assert not public.dokumen_unggahan_bebas(v_p, '99999999-9999-4999-8999-999999999991'), 'Nomor unggahan yang sudah dicatat tidak boleh dipakai lagi.';
  assert (public.dokumen_akses((v ->> 'id')::uuid) ->> 'bagian')::int = 4, 'Akses berkas harus menyebut jumlah bagiannya.';
  perform pg_catalog.set_config('uji.besar', v ->> 'id', true);

  -- tiga dokumen NFR: internal, untuk tenant, untuk tenant dan pengelola SPBU
  v := public.dokumen_catat(v_p, 'survei', 'Catatan internal survei', k || '11111111-1111-4111-8111-111111111111.pdf', '../../catatan\internal.pdf', 'application/pdf', 1000, h);
  assert (v ->> 'ok')::boolean, 'Dokumen internal harus tersimpan: ' || (v ->> 'pesan');
  insert into uji_dok values ('internal', (v ->> 'id')::uuid);
  v := public.dokumen_catat(v_p, 'penawaran', 'Surat penawaran', k || '22222222-2222-4222-8222-222222222222.pdf', 'surat.pdf', 'application/pdf', 2000, h, true, false);
  insert into uji_dok values ('surat1', (v ->> 'id')::uuid);
  v := public.dokumen_catat(v_p, 'kontrak', 'Naskah kontrak', k || '33333333-3333-4333-8333-333333333333.pdf', 'kontrak.pdf', 'application/pdf', 3000, h, true, true);
  insert into uji_dok values ('kontrak', (v ->> 'id')::uuid);
  -- versi kedua surat penawaran: mewarisi jenis dan keterlihatan, tidak menimpa versi pertama
  v := public.dokumen_catat(v_p, 'lainnya', 'Surat penawaran (revisi)', k || '44444444-4444-4444-8444-444444444444.pdf', 'surat-v2.pdf', 'application/pdf', 2500, repeat('b', 64),
                            false, true, (select id from uji_dok where nama = 'surat1'));
  assert (v ->> 'ok')::boolean and (v ->> 'versi')::int = 2, 'Versi kedua harus tersimpan.';
  insert into uji_dok values ('surat2', (v ->> 'id')::uuid);
  v := public.dokumen_catat(v_p, 'penawaran', 'Surat penawaran lagi', k || '55555555-5555-4555-8555-555555555555.pdf', 'x.pdf', 'application/pdf', 2500, h,
                            false, false, (select id from uji_dok where nama = 'surat1'));
  assert not (v ->> 'ok')::boolean, 'Mengganti versi yang bukan terbaru harus ditolak.';
  -- blok bersarang: galat di dalamnya tidak membatalkan unggahan di atas
  begin
    v := public.dokumen_catat(v_p, 'penawaran', 'Kembar', k || '22222222-2222-4222-8222-222222222222.pdf', 'surat.pdf', 'application/pdf', 2000, h);
    raise exception 'Alamat berkas yang sama tidak boleh dicatat dua kali.';
  exception when unique_violation then null;
  end;
end $$;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000d1'; d jsonb;
begin
  v := public.dokumen_peluang_daftar(v_p);
  assert v ->> 'peran' = 'nfr' and jsonb_array_length(v -> 'dokumen') = 5, 'NFR melihat kelima berkas.';
  select x into d from jsonb_array_elements(v -> 'dokumen') x where x ->> 'id' = (select id::text from uji_dok where nama = 'surat2');
  assert d ->> 'jenis' = 'penawaran' and (d ->> 'tampak_tenant')::boolean and not (d ->> 'tampak_dealer')::boolean and (d ->> 'terkini')::boolean,
    'Versi baru mewarisi jenis dan keterlihatan versi lamanya.';
  select x into d from jsonb_array_elements(v -> 'dokumen') x where x ->> 'id' = (select id::text from uji_dok where nama = 'surat1');
  assert not (d ->> 'terkini')::boolean and (d ->> 'boleh_buka')::boolean, 'Versi lama tetap ada dan tetap bisa dibuka.';
  select x into d from jsonb_array_elements(v -> 'dokumen') x where x ->> 'id' = (select id::text from uji_dok where nama = 'internal');
  assert d ->> 'nama_berkas' = '....catataninternal.pdf', 'Nama berkas dibersihkan dari garis miring: ' || (d ->> 'nama_berkas');
  begin
    perform 1 from public.dokumen_peluang;
    assert false, 'Tabel dokumen tidak boleh dibaca langsung, bahkan oleh tim NFR.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- tenant 12A
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c3","email":"tenant12a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000d1'; k text := 'dokumen/00000000-0000-4000-d000-0000000000d1/'; h text := repeat('c', 64);
begin
  v := public.dokumen_peluang_daftar(v_p);
  assert v ->> 'peran' = 'tenant' and v ->> 'boleh_unggah' = 'tenant' and jsonb_array_length(v -> 'dokumen') = 3,
    'Tenant melihat surat penawaran (dua versi) dan naskah kontrak, tidak catatan internal.';
  assert v::text not like '%analis12@uji.invalid%' and v::text not like '%Catatan internal%' and not (v::text like '%"sha256": "%'),
    'Tenant tidak melihat identitas staf NFR, dokumen internal, dan sidik berkas.';
  assert public.dokumen_akses((select id from uji_dok where nama = 'surat1')) ->> 'kunci' like 'dokumen/%', 'Tenant boleh membuka dokumen yang dibagikan kepadanya.';
  assert public.dokumen_akses((select id from uji_dok where nama = 'internal')) is null, 'Tenant tidak boleh membuka dokumen internal.';
  v := public.dokumen_catat(v_p, 'kontrak', 'Kontrak buatan tenant', k || '66666666-6666-4666-8666-666666666666.pdf', 'k.pdf', 'application/pdf', 1000, h);
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh mengunggah jenis kontrak.';
  v := public.dokumen_catat(v_p, 'legalitas', 'NIB perusahaan', k || '66666666-6666-4666-8666-666666666666.pdf', 'nib.pdf', 'application/pdf', 1000, h, false, true);
  assert (v ->> 'ok')::boolean, 'Tenant boleh mengunggah legalitas usahanya.';
  insert into uji_dok values ('nib', (v ->> 'id')::uuid);
  v := public.dokumen_catat(v_p, 'penawaran', 'Menimpa surat NFR', k || '77777777-7777-4777-8777-777777777777.pdf', 's.pdf', 'application/pdf', 1000, h,
                            false, false, (select id from uji_dok where nama = 'surat2'));
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh mengunggah versi baru dokumen NFR.';
  v := public.dokumen_tarik((select id from uji_dok where nama = 'surat2'));
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh menarik dokumen NFR.';
  v := public.dokumen_atur_tampak((select id from uji_dok where nama = 'nib'), true, true);
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh mengatur keterlihatan.';
end $$;
reset role;

-- ---------------------------------------------------------------- tenant lain dan pengelola SPBU
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c4","email":"tenant12b@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000d1';
begin
  v := public.dokumen_peluang_daftar(v_p);
  assert v ->> 'peran' is null and jsonb_array_length(v -> 'dokumen') = 0, 'Tenant lain tidak melihat dokumen peluang ini.';
  assert public.dokumen_akses((select id from uji_dok where nama = 'surat1')) is null and public.dokumen_akses((select id from uji_dok where nama = 'nib')) is null,
    'Tenant lain tidak boleh membuka berkas apa pun.';
  v := public.dokumen_catat(v_p, 'legalitas', 'Menyusup', 'dokumen/00000000-0000-4000-d000-0000000000d1/88888888-8888-4888-8888-888888888888.pdf', 'x.pdf', 'application/pdf', 1000, repeat('d', 64));
  assert not (v ->> 'ok')::boolean, 'Tenant lain tidak boleh mengunggah ke peluang ini.';
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c5","email":"dealer12@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000d1';
begin
  v := public.dokumen_peluang_daftar(v_p);
  assert v ->> 'peran' = 'dealer' and v ->> 'boleh_unggah' is null and jsonb_array_length(v -> 'dokumen') = 1 and v -> 'dokumen' -> 0 ->> 'judul' = 'Naskah kontrak',
    'Pengelola SPBU hanya melihat dokumen yang dibuka untuknya.';
  assert v::text not like '%NIB perusahaan%' and v::text not like '%analis12@uji.invalid%', 'Dokumen tenant dan identitas staf NFR tidak terlihat pengelola.';
  assert public.dokumen_akses((select id from uji_dok where nama = 'kontrak')) is not null and public.dokumen_akses((select id from uji_dok where nama = 'nib')) is null
     and public.dokumen_akses((select id from uji_dok where nama = 'surat2')) is null, 'Pengelola hanya boleh membuka dokumen yang dibuka untuknya.';
end $$;
reset role;

-- ---------------------------------------------------------------- auditor membaca, tidak mengubah
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c2","email":"auditor12@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000d1';
begin
  v := public.dokumen_peluang_daftar(v_p);
  assert v ->> 'peran' = 'nfr' and v ->> 'boleh_unggah' is null and jsonb_array_length(v -> 'dokumen') = 6, 'Auditor membaca semua dokumen, tanpa hak unggah.';
  v := public.dokumen_tarik((select id from uji_dok where nama = 'surat2'), 'Alasan yang cukup panjang.');
  assert not (v ->> 'ok')::boolean, 'Auditor tidak boleh menarik dokumen.';
end $$;
reset role;

-- ---------------------------------------------------------------- analis: keterlihatan dan penarikan
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","email":"analis12@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000d1';
begin
  v := public.dokumen_atur_tampak((select id from uji_dok where nama = 'nib'), true, true);
  assert not (v ->> 'ok')::boolean, 'Dokumen tenant tidak boleh dibuka ke pengelola SPBU oleh NFR.';
  v := public.dokumen_tarik((select id from uji_dok where nama = 'nib'), 'Alasan yang cukup panjang.');
  assert not (v ->> 'ok')::boolean, 'NFR tidak boleh menarik dokumen tenant.';
  v := public.dokumen_atur_tampak((select id from uji_dok where nama = 'surat2'), false, false);
  assert (v ->> 'ok')::boolean, 'NFR boleh menutup dokumennya dari tenant.';
  v := public.dokumen_tarik((select id from uji_dok where nama = 'kontrak'), 'singkat');
  assert not (v ->> 'ok')::boolean, 'Penarikan oleh NFR butuh alasan.';
  v := public.dokumen_tarik((select id from uji_dok where nama = 'kontrak'), 'Naskah salah unggah, memuat lampiran yang keliru.');
  assert (v ->> 'ok')::boolean, 'NFR boleh menarik dokumennya dengan alasan.';
  assert public.dokumen_akses((select id from uji_dok where nama = 'kontrak')) is null, 'Dokumen yang ditarik tidak bisa dibuka lagi, juga oleh NFR.';
  assert (select count(*) from public.audit_peristiwa where entitas_id = v_p::text and peristiwa like 'dokumen_%') = 8,
    'Unggah, ubah keterlihatan, dan tarik tercatat: ' || (select string_agg(peristiwa, ',') from public.audit_peristiwa where entitas_id = v_p::text and peristiwa like 'dokumen_%');
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c3","email":"tenant12a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; v_p uuid := '00000000-0000-4000-d000-0000000000d1'; d jsonb;
begin
  v := public.dokumen_peluang_daftar(v_p);
  -- surat penawaran (dua versi) kini tertutup; naskah kontrak ditarik tetapi tetap tercatat; NIB milik tenant
  assert jsonb_array_length(v -> 'dokumen') = 2, 'Setelah ditutup, kedua versi surat penawaran hilang dari tenant: ' || jsonb_array_length(v -> 'dokumen');
  assert public.dokumen_akses((select id from uji_dok where nama = 'surat1')) is null, 'Menutup keterlihatan berlaku untuk semua versi rangkaian itu.';
  select x into d from jsonb_array_elements(v -> 'dokumen') x where x ->> 'judul' = 'Naskah kontrak';
  assert d ->> 'ditarik' is not null and not (d ->> 'boleh_buka')::boolean and d ->> 'alasan_tarik' is null, 'Tenant melihat dokumen itu ditarik, tanpa alasan internalnya.';
  v := public.dokumen_tarik((select id from uji_dok where nama = 'nib'));
  assert (v ->> 'ok')::boolean, 'Tenant boleh menarik dokumennya sendiri tanpa alasan.';
end $$;
reset role;

-- peluang berakhir: tidak ada unggahan baru
update public.peluang set tahap = 'batal' where id = '00000000-0000-4000-d000-0000000000d1';
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","email":"analis12@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$ begin assert public.dokumen_boleh_unggah('00000000-0000-4000-d000-0000000000d1') is null, 'Peluang yang berakhir tidak menerima dokumen baru.'; end $$;
reset role;

set local role anon;
do $$
begin
  perform public.dokumen_akses('00000000-0000-4000-d000-0000000000d1');
  assert false, 'Pengunjung tanpa akun tidak boleh memanggil fungsi dokumen.';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji dokumen (unggah per peran, versi tidak ditimpa, keterlihatan tenant dan pengelola, penarikan, akses berkas).'
