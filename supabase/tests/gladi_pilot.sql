-- Gladi uji coba satu SPBU: seluruh langkah di docs/uji-coba-pilot.md dijalankan berurutan, lintas peran, lewat fungsi
-- yang sama dengan yang dipakai aplikasi. Tidak ada persiapan yang ditulis langsung ke tabel selain akun dan dua
-- keanggotaan NFR. Uji lain memeriksa tiap irisan sendiri-sendiri; berkas ini memeriksa sambungannya.
-- A = analis NFR, P = admin NFR, D = pengelola SPBU, T = calon tenant. Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '60s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000e1', 'a-gladi@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000e2', 'p-gladi@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000e3', 'd-gladi@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000e4', 't-gladi@uji.invalid');
insert into public.keanggotaan (user_id, organisasi_id, peran)
select u.id, o.id, u.peran from public.organisasi o,
  (values ('00000000-0000-4000-a000-0000000000e1'::uuid, 'nfr_analis'), ('00000000-0000-4000-a000-0000000000e2'::uuid, 'nfr_admin')) u(id, peran)
where o.jenis = 'nfr';

do $_$ begin perform public.deteksi_masalah_data(); end $_$;

-- Catatan gladi: kunci dan nilainya, dibaca lintas peran.
create temp table _g (kunci text primary key, nilai text) on commit drop;
grant select, insert, update on _g to authenticated;

-- Ruang uji: ruang kosong yang bersih di SPBU calon pilot (3412304 lebih dulu), tanpa temuan, tanpa peluang, tanpa status.
insert into _g
select x.kunci, x.nilai from (
  select l.lahan_id, l.spbu_id, s.nomor, s.provinsi
  from public.lahan l join public.spbu s on s.id = l.spbu_id
  where l.status = 'Tersedia' and not l.duplikat and l.luas_m2 > 0
    and s.kota in ('Kodya Jakarta Selatan', 'Kodya Tangerang', 'Semarang Kota')
    and not exists (select 1 from public.masalah_data m where l.lahan_id = any (m.lahan_ids))
    and not exists (select 1 from public.peluang p where p.lahan_id = l.lahan_id)
    and not exists (select 1 from public.status_lahan t where t.spbu_id = l.spbu_id)
    and not exists (select 1 from public.hak_spbu h where h.spbu_id = l.spbu_id)
  order by (s.nomor = '3412304') desc, l.lahan_id limit 1
) r, lateral (values ('lahan', r.lahan_id), ('spbu', r.spbu_id), ('nomor', r.nomor), ('provinsi', r.provinsi)) x(kunci, nilai);
do $$ begin assert (select count(*) from _g) = 4, 'Persiapan: tidak ada ruang bersih di kota pilot untuk gladi.'; end $$;

create function pg_temp.g(k text) returns text language sql as $$ select nilai from _g where kunci = k $$;
create function pg_temp.sebagai(p_sub text, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'email', p_email, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.ok(v jsonb, langkah text) returns void language plpgsql as $$
begin assert (v ->> 'ok')::boolean, langkah || ' DITOLAK: ' || coalesce(v ->> 'pesan', v::text); end $$;

-- ================================================================ Langkah 1 (P): organisasi dan anggotanya
select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e2', 'p-gladi@uji.invalid');
set local role authenticated;
do $$
declare v jsonb; d jsonb := public.dasbor_nfr();
begin
  insert into _g values ('awal_boleh', d ->> 'kosong_boleh_ditawarkan'), ('awal_verif', d ->> 'kosong_terverifikasi'), ('awal_kontrak', d ->> 'kontrak_ditandatangani'),
                        ('awal_operasi', d ->> 'outlet_beroperasi'), ('awal_berversi', d ->> 'peluang_berversi');
  v := public.organisasi_buat('Dealer Gladi', 'dealer');           perform pg_temp.ok(v, 'L1 buat organisasi dealer');   insert into _g values ('org_dealer', v ->> 'id');
  v := public.organisasi_buat('Tenant Gladi', 'tenant');           perform pg_temp.ok(v, 'L1 buat organisasi tenant');   insert into _g values ('org_tenant', v ->> 'id');
  perform pg_temp.ok(public.keanggotaan_atur('d-gladi@uji.invalid', pg_temp.g('org_dealer')::uuid, 'dealer_admin'), 'L1 hubungkan akun dealer');
  perform pg_temp.ok(public.keanggotaan_atur('t-gladi@uji.invalid', pg_temp.g('org_tenant')::uuid, 'tenant_admin'), 'L1 hubungkan akun tenant');
end $$;
reset role;

-- ================================================================ Langkah 2 (A): wewenang SPBU
select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e1', 'a-gladi@uji.invalid');
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.hak_spbu_simpan(pg_temp.g('spbu'), jsonb_build_object(
    'pola', 'DODO', 'pemilik_aset', 'PT Pemilik Gladi', 'pengelola', 'Dealer Gladi', 'organisasi_dealer', pg_temp.g('org_dealer'), 'dealer_berwenang', 'true',
    'penyetuju', 'Dealer Gladi', 'pihak_kontrak', 'PT Pemilik Gladi', 'penerima_sewa', 'pemilik_spbu', 'dokumen', 'Perjanjian DODO no. 1/GLADI'));
  perform pg_temp.ok(v, 'L2 simpan wewenang');
  assert (public.hak_spbu_rinci(pg_temp.g('spbu')) -> 'hak' ->> 'status') = 'belum_dipastikan', 'L2: wewenang yang baru disimpan harus belum dipastikan.';
  assert not (public.hak_spbu_pastikan(pg_temp.g('spbu')) ->> 'ok')::boolean, 'L2: analis tidak boleh memastikan wewenang.';
end $$;
reset role;

-- ================================================================ Langkah 3 (P): memastikan wewenang
select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e2', 'p-gladi@uji.invalid');
set local role authenticated;
do $$
begin
  perform pg_temp.ok(public.hak_spbu_pastikan(pg_temp.g('spbu')), 'L3 pastikan wewenang');
  assert (public.hak_spbu_rinci(pg_temp.g('spbu')) -> 'hak' ->> 'status') = 'dipastikan', 'L3: wewenang harus dipastikan.';
end $$;
reset role;

-- ================================================================ Langkah 4 dan 5 (D): konfirmasi ruang, inspeksi dengan foto
select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e3', 'd-gladi@uji.invalid');
set local role authenticated;
do $$
declare v jsonb; v_i uuid; r jsonb;
begin
  v := public.dealer_ringkasan();
  assert jsonb_array_length(v -> 'spbu') = 1 and v -> 'spbu' -> 0 ->> 'spbu_id' = pg_temp.g('spbu'), 'L4: pengelola harus melihat SPBU-nya di portal.';
  r := public.dealer_spbu_rinci(pg_temp.g('spbu'));
  assert r is not null and exists (select 1 from jsonb_array_elements(r -> 'ruang') x where x ->> 'lahan_id' = pg_temp.g('lahan')), 'L4: ruang uji harus tampil di halaman SPBU pengelola.';
  perform pg_temp.ok(public.dealer_konfirmasi_ruang(pg_temp.g('lahan'), true), 'L4 konfirmasi ruang bisa dipakai');

  v := public.inspeksi_mulai(pg_temp.g('lahan'));                  perform pg_temp.ok(v, 'L5 mulai inspeksi');
  v_i := (v ->> 'id')::uuid;                                       insert into _g values ('inspeksi', v_i::text);
  assert public.inspeksi_boleh_isi(v_i), 'L5: pengelola harus boleh mengisi inspeksinya (dipakai rute unggah foto).';
  perform pg_temp.ok(public.inspeksi_foto_tambah(v_i, 'inspeksi/' || v_i || '/00000000-0000-4000-c000-0000000000e1.jpg', 1200, 900, 150000), 'L5 foto pertama');
  perform pg_temp.ok(public.inspeksi_foto_tambah(v_i, 'inspeksi/' || v_i || '/00000000-0000-4000-c000-0000000000e2.jpg', 1200, 900, 150000), 'L5 foto kedua');
  perform pg_temp.ok(public.inspeksi_simpan(v_i,
    '{"luas_m2":"12","daya_w":"1300","air":"tersedia","akses":"mudah","parkir":"cukup","pembatasan":"tidak_ada"}'::jsonb, 'siap'), 'L5 simpan isian inspeksi');
  perform pg_temp.ok(public.inspeksi_ajukan(v_i), 'L5 ajukan inspeksi');
  assert public.dealer_inspeksi_rinci(v_i) ->> 'status' = 'diajukan', 'L5: pengelola melihat inspeksinya menunggu tinjauan.';
end $$;
reset role;

-- ================================================================ Langkah 6 (P): meninjau inspeksi
select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e2', 'p-gladi@uji.invalid');
set local role authenticated;
do $$
declare v jsonb; d jsonb;
begin
  assert exists (select 1 from jsonb_array_elements(public.inspeksi_daftar('diajukan') -> 'baris') x where x ->> 'id' = pg_temp.g('inspeksi')), 'L6: inspeksi harus tampil di daftar menunggu tinjauan.';
  assert jsonb_array_length(public.inspeksi_rinci(pg_temp.g('inspeksi')::uuid) -> 'foto') = 2, 'L6: peninjau harus melihat dua foto bukti.';
  perform pg_temp.ok(public.inspeksi_tinjau(pg_temp.g('inspeksi')::uuid, 'diterima'), 'L6 terima inspeksi');
  assert (public.lahan_boleh_ditawarkan(pg_temp.g('lahan')) ->> 'boleh')::boolean, 'L6: ruang harus boleh ditawarkan: ' || (public.lahan_boleh_ditawarkan(pg_temp.g('lahan')) ->> 'alasan');
  d := public.dasbor_nfr();
  assert (d ->> 'kosong_terverifikasi')::int = pg_temp.g('awal_verif')::int + 1 and (d ->> 'kosong_boleh_ditawarkan')::int = pg_temp.g('awal_boleh')::int + 1,
    'L6: beranda harus menunjukkan satu lahan terverifikasi dan boleh ditawarkan lebih banyak.';
  -- langkah tambahan: membuka penjelajah untuk tenant di provinsi SPBU ini
  perform pg_temp.ok(public.jelajah_atur(pg_temp.g('org_tenant')::uuid, array[pg_temp.g('provinsi')]), 'L6+ buka penjelajah');
end $$;
reset role;

select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e4', 't-gladi@uji.invalid');
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.tenant_jelajah();
  assert exists (select 1 from jsonb_array_elements(v -> 'lokasi') x where x ->> 'lahan_id' = pg_temp.g('lahan')), 'L6+: ruang yang baru diverifikasi harus tampil di penjelajah tenant.';
  perform pg_temp.ok(public.tenant_minati(pg_temp.g('lahan'), 'Kami ingin membuka gerai di sini.'), 'L6+ tenant menyatakan minat');
end $$;
reset role;

-- ================================================================ Langkah 7, 8, 9 (A): peluang, tahap, penawaran, bagikan
select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e1', 'a-gladi@uji.invalid');
set local role authenticated;
do $$
declare v jsonb; v_p uuid; v_v uuid; v_m jsonb;
begin
  v_m := public.minat_daftar();
  assert exists (select 1 from jsonb_array_elements(v_m) x where x ->> 'lahan_id' = pg_temp.g('lahan') and x ->> 'organisasi' = 'Tenant Gladi'), 'L6+: analis harus melihat minat tenant.';

  v_p := public.peluang_buat(pg_temp.g('lahan'), null, (select t.id from public.v_tenant_profil t order by t.lahan desc, t.id limit 1));
  assert v_p is not null, 'L7: peluang harus terbuat.';
  insert into _g values ('peluang', v_p::text);
  assert exists (select 1 from public.hasil_kecocokan h where h.peluang_id = v_p), 'L7: potret skor harus tercatat saat peluang dibuat.';
  perform pg_temp.ok(public.minat_tangani((select (x ->> 'id')::uuid from jsonb_array_elements(v_m) x where x ->> 'lahan_id' = pg_temp.g('lahan')), 'ditindaklanjuti'), 'L7 tandai minat ditindaklanjuti');

  perform pg_temp.ok(public.peluang_tindak_lanjut(v_p, 'a-gladi@uji.invalid', 'Hubungi tim ekspansi tenant.', current_date + 7), 'L8 pemilik, tindakan, tenggat');
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'terverifikasi'), 'L8 ke data terverifikasi');
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'terpilih'), 'L8 ke terpilih');
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'dihubungi'), 'L8 ke dihubungi');
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'berminat', null, 'Manajer ekspansi menyatakan minat lewat penjelajah lokasi.'), 'L8 ke berminat');
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'survei'), 'L8 ke survei lokasi');

  v := public.penawaran_simpan(v_p, '{"sewa_tahunan":"60000000","lama_sewa_bulan":"24","skema":"sewa_tetap","penerima_sewa":"pemilik_spbu","deposit":"5000000","bebas_sewa_bulan":"2"}'::jsonb);
  perform pg_temp.ok(v, 'L9 susun versi 1');
  v_v := (v ->> 'id')::uuid;                                       insert into _g values ('versi', v_v::text);
  perform pg_temp.ok(public.penawaran_terbitkan(v_v), 'L9 terbitkan versi 1');
  perform pg_temp.ok(public.peluang_bagikan(v_p, pg_temp.g('org_tenant')::uuid), 'L9 bagikan ke organisasi tenant');
  v := public.dokumen_catat(v_p, 'penawaran', 'Surat penawaran', 'dokumen/' || v_p || '/00000000-0000-4000-c000-0000000000f1.pdf', 'surat-penawaran.pdf',
                            'application/pdf', 200000, repeat('a', 64), true, false);
  perform pg_temp.ok(v, 'L9 unggah surat penawaran untuk tenant');
  assert (public.dasbor_nfr() ->> 'peluang_berversi')::int = pg_temp.g('awal_berversi')::int + 1, 'L9: beranda harus menghitung satu penawaran resmi lebih banyak.';
end $$;
reset role;

-- ================================================================ Langkah 10 (T): membaca, menghitung, menanggapi, mengusulkan survei
select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e4', 't-gladi@uji.invalid');
set local role authenticated;
do $$
declare v jsonb; v_p uuid := pg_temp.g('peluang')::uuid; h date := public.hari_ini_wib();
begin
  assert jsonb_array_length(public.tenant_penawaran_daftar()) = 1, 'L10: tenant harus melihat satu penawaran di kotaknya.';
  v := public.tenant_penawaran_rinci(v_p);
  assert v is not null and v -> 'syarat' ->> 'sewa_tahunan' = '60000000' and v -> 'kecocokan' is not null, 'L10: rincian penawaran harus terbaca dengan syarat dan kecocokannya.';
  assert exists (select 1 from jsonb_array_elements(public.dokumen_peluang_daftar(v_p) -> 'dokumen') x where x ->> 'judul' = 'Surat penawaran' and (x ->> 'boleh_buka')::boolean),
    'L10: tenant harus bisa membuka surat penawaran.';
  perform pg_temp.ok(public.kelayakan_simpan(v_p, 'Dasar', 'ritel', '{"kunjungan_per_hari":400}'::jsonb, '{"dasar":{"laba_operasi":3500000}}'::jsonb), 'L10 simpan skenario kelayakan');
  perform pg_temp.ok(public.tenant_tanggapi(v_p, 'berminat'), 'L10 nyatakan berminat');
  perform pg_temp.ok(public.tenant_survei_minta(v_p, jsonb_build_array(jsonb_build_object('tanggal', h + 3, 'waktu', 'pagi')), 'Dua orang akan datang.'), 'L10 usulkan waktu survei');
  perform pg_temp.ok(public.dokumen_catat(v_p, 'legalitas', 'NIB perusahaan', 'dokumen/' || v_p || '/00000000-0000-4000-c000-0000000000f2.pdf', 'nib.pdf',
                                          'application/pdf', 90000, repeat('b', 64)), 'L10 unggah legalitas usaha');
  assert jsonb_array_length(public.tenant_penawaran_banding() -> 'banding') = 1, 'L10: halaman banding harus memuat penawaran ini.';
end $$;
reset role;

select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e1', 'a-gladi@uji.invalid');
set local role authenticated;
do $$
declare v_p uuid := pg_temp.g('peluang')::uuid;
begin
  assert jsonb_array_length(public.peluang_portal(v_p) -> 'tanggapan') = 2, 'L10: tanggapan dan usulan survei tenant harus tampil di halaman peluang NFR.';
  assert public.survei_peluang(v_p) -> 0 ->> 'status' = 'diminta', 'L10: usulan survei harus tampil di tab Survei.';
  perform pg_temp.ok(public.survei_jadwalkan(v_p, public.hari_ini_wib() + 3, '10:00', 'Analis Gladi', 'Bertemu di kantor SPBU.'), 'L10 tetapkan jadwal survei');
end $$;
reset role;

select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e3', 'd-gladi@uji.invalid');
set local role authenticated;
do $$
declare v jsonb := public.dealer_survei();
begin
  assert jsonb_array_length(v) = 1, 'L10: pengelola SPBU harus melihat survei terjadwal.';
  perform pg_temp.ok(public.dealer_survei_ketahui((v -> 0 ->> 'id')::uuid), 'L10 pengelola menandai sudah tahu');
end $$;
reset role;

-- ================================================================ Langkah 11 (A): sampai tahap persetujuan
select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e1', 'a-gladi@uji.invalid');
set local role authenticated;
do $$
declare v_p uuid := pg_temp.g('peluang')::uuid;
begin
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'penawaran'), 'L11 ke penawaran');
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'negosiasi'), 'L11 ke negosiasi');
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'persetujuan'), 'L11 ke persetujuan');
  assert (select count(*) from public.persetujuan where penawaran_id = pg_temp.g('versi')::uuid and status = 'menunggu' and not gugur) = 4, 'L11: empat persetujuan harus terbuka.';
end $$;
reset role;

-- ================================================================ Langkah 12 (T, D, P): keputusan tiap pihak
select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e4', 't-gladi@uji.invalid');
set local role authenticated;
do $$ begin perform pg_temp.ok(public.tenant_putuskan(pg_temp.g('peluang')::uuid, 'disetujui'), 'L12 tenant menyetujui'); end $$;
reset role;

select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e3', 'd-gladi@uji.invalid');
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.dealer_ringkasan();
  assert jsonb_array_length(v -> 'persetujuan') = 1 and (v -> 'persetujuan' -> 0 ->> 'berwenang')::boolean, 'L12: usulan harus tampil di portal pengelola sebagai yang berwenang.';
  assert public.dealer_persetujuan_rinci(pg_temp.g('peluang')::uuid) is not null, 'L12: kartu keputusan pengelola harus terbaca.';
  perform pg_temp.ok(public.dealer_putuskan(pg_temp.g('peluang')::uuid, 'disetujui'), 'L12 pengelola menyetujui');
end $$;
reset role;

select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e2', 'p-gladi@uji.invalid');
set local role authenticated;
do $$
declare v_v uuid := pg_temp.g('versi')::uuid; v_p uuid := pg_temp.g('peluang')::uuid;
begin
  perform pg_temp.ok(public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = v_v and pihak = 'nfr'), 'disetujui'), 'L12 persetujuan NFR');
  perform pg_temp.ok(public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = v_v and pihak = 'hsse'), 'disetujui', null,
                                                 'Berita acara HSSE no. 1/GLADI', 'Petugas HSSE wilayah'), 'L12 persetujuan HSSE dicatat dengan bukti');
  assert (select count(*) from public.persetujuan where penawaran_id = v_v and status = 'disetujui' and not gugur) = 4, 'L12: keempat persetujuan harus tercatat.';

  -- ================================================================ Setelah langkah 12: kontrak sampai beroperasi
  perform public.peluang_set_syarat(s.id, true) from public.peluang_syarat s where s.peluang_id = v_p;
  assert (select bool_and((x ->> 'terpenuhi')::boolean) from jsonb_array_elements(public.peluang_syarat_masuk(v_p, 'kontrak')) x),
    'L13: syarat masuk kontrak belum terpenuhi: ' || (select string_agg(x ->> 'syarat', '; ') from jsonb_array_elements(public.peluang_syarat_masuk(v_p, 'kontrak')) x where not (x ->> 'terpenuhi')::boolean);
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'kontrak'), 'L13 ke kontrak');
  perform pg_temp.ok(public.dokumen_catat(v_p, 'kontrak', 'Kontrak ditandatangani', 'dokumen/' || v_p || '/00000000-0000-4000-c000-0000000000f3.pdf', 'kontrak.pdf',
                                          'application/pdf', 900000, repeat('c', 64), true, true), 'L13 unggah kontrak');
  perform pg_temp.ok(public.kontrak_catat_tanda_tangan(v_p, current_date, 'K-001/GLADI/2026'), 'L13 catat tanda tangan');
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'aktivasi'), 'L13 ke aktivasi');
  perform pg_temp.ok(public.kontrak_catat_aktif(v_p, current_date), 'L13 catat mulai beroperasi');
  perform pg_temp.ok(public.peluang_ubah_tahap(v_p, 'pemantauan'), 'L13 ke pemantauan');
  assert (public.dasbor_nfr() ->> 'kontrak_ditandatangani')::int = pg_temp.g('awal_kontrak')::int + 1
     and (public.dasbor_nfr() ->> 'outlet_beroperasi')::int = pg_temp.g('awal_operasi')::int + 1, 'L13: beranda harus menghitung satu kontrak dan satu outlet lebih banyak.';
  assert (select count(distinct peristiwa) from public.audit_peristiwa where entitas_id = v_p::text) >= 12,
    'Jejak audit peluang harus memuat langkah-langkahnya: ' || (select string_agg(distinct peristiwa, ', ') from public.audit_peristiwa where entitas_id = v_p::text);
end $$;
reset role;

-- ruang yang sudah menuju kontrak tidak lagi tampil di penjelajah; tenant tetap melihat penawarannya berjalan
select pg_temp.sebagai('00000000-0000-4000-a000-0000000000e4', 't-gladi@uji.invalid');
set local role authenticated;
do $$
begin
  assert not exists (select 1 from jsonb_array_elements(public.tenant_jelajah() -> 'lokasi') x where x ->> 'lahan_id' = pg_temp.g('lahan')), 'Ruang yang sudah berkontrak tidak boleh tampil lagi di penjelajah.';
  assert public.tenant_penawaran_rinci(pg_temp.g('peluang')::uuid) ->> 'status' = 'berjalan', 'Tenant harus melihat penawarannya berstatus berjalan.';
  assert exists (select 1 from jsonb_array_elements(public.dokumen_peluang_daftar(pg_temp.g('peluang')::uuid) -> 'dokumen') x where x ->> 'judul' = 'Kontrak ditandatangani'),
    'Tenant harus melihat kontrak yang dibagikan kepadanya.';
end $$;
reset role;

rollback;
\echo 'LULUS: gladi uji coba satu SPBU (langkah 1 sampai 12, lalu kontrak sampai outlet beroperasi, lintas empat peran).'
