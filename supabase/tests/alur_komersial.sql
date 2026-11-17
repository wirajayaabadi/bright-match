-- Uji otomatis irisan ketiga: perjalanan penuh satu peluang lewat 12 tahap, penawaran berversi,
-- persetujuan yang terikat versi, tanda tangan, dan mulai beroperasi. Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
-- Bila uji gagal di tengah, psql berhenti tanpa menutup transaksi. Batas ini menutup sesi yang tertinggal,
-- dan membuat uji lain gagal cepat dengan pesan jelas, bukan menggantung menunggu kuncinya.
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000021', 'analis3@uji.invalid'),
  ('00000000-0000-4000-a000-000000000022', 'penyetuju3@uji.invalid'),
  ('00000000-0000-4000-a000-000000000023', 'tenant3@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values ('00000000-0000-4000-b000-000000000021', 'Tenant Uji 3', 'tenant', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000021', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000022', id, 'nfr_penyetuju' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-000000000023', '00000000-0000-4000-b000-000000000021', 'tenant_admin');

do $_$ begin perform public.deteksi_masalah_data(); end $_$;

create temp table _bahan on commit drop as
select
  (select l.lahan_id from public.lahan l where l.status = 'Tersedia' and not l.duplikat
     and not exists (select 1 from public.masalah_data m where l.lahan_id = any (m.lahan_ids))
     and not exists (select 1 from public.peluang p where p.lahan_id = l.lahan_id)
     and not exists (select 1 from public.status_lahan s where s.lahan_id = l.lahan_id)
   order by l.lahan_id limit 1) as lahan,
  (select t.id from public.v_tenant_profil t order by t.lahan desc, t.id limit 1) as tenant_id,
  null::uuid as peluang, null::uuid as v1, null::uuid as v2;
grant select, update on _bahan to authenticated;

-- Lahan uji ditandai terverifikasi (alur verifikasinya sendiri diuji di status_lahan.sql).
insert into public.status_lahan (spbu_id, lahan_id, lahan_kode, status_data, kesiapan, sidik_sumber, diverifikasi, diverifikasi_oleh)
select l.spbu_id, l.lahan_id, l.kode, 'terverifikasi', 'siap', public.sidik_lahan(l), now(), 'persiapan-uji'
from public.lahan l, _bahan b where l.lahan_id = b.lahan and not l.duplikat;

-- Wewenang SPBU lahan uji dipastikan lebih dulu (alurnya sendiri diuji di wewenang_dealer.sql).
insert into public.hak_spbu (spbu_id, spbu_nomor, pola, pemilik_aset, penyetuju, pihak_kontrak, penerima_sewa, dokumen, status, dipastikan, dipastikan_oleh)
select l.spbu_id, s.nomor, 'DODO', 'Pemilik uji', 'Pemilik uji', 'Pemilik uji', 'pemilik_spbu', 'Dokumen uji', 'dipastikan', now(), 'persiapan-uji'
from public.lahan l join public.spbu s on s.id = l.spbu_id, _bahan b where l.lahan_id = b.lahan and not l.duplikat
on conflict (spbu_id) do update set pola = 'DODO', pemilik_aset = 'Pemilik uji', penyetuju = 'Pemilik uji', pihak_kontrak = 'Pemilik uji',
  penerima_sewa = 'pemilik_spbu', dokumen = 'Dokumen uji', status = 'dipastikan';

-- ---------------------------------------------------------------- analis: dari dibuat sampai tahap persetujuan
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000021","email":"analis3@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare
  v    jsonb;
  v_p  uuid;
  v_v  uuid;
begin
  v_p := public.peluang_buat((select lahan from _bahan), null, (select tenant_id from _bahan));
  update _bahan set peluang = v_p;

  v := public.peluang_ubah_tahap(v_p, 'terverifikasi');
  assert (v ->> 'ok')::boolean, 'Lahan terverifikasi: tahap 2 harus bisa dicapai.';

  -- tahap terpilih butuh pemilik
  v := public.peluang_tindak_lanjut(v_p, null, null, null);
  v := public.peluang_ubah_tahap(v_p, 'terpilih');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%pemilik%', 'Tahap terpilih butuh pemilik.';
  v := public.peluang_tindak_lanjut(v_p, 'tenant3@uji.invalid', 'Hubungi', current_date + 7);
  assert not (v ->> 'ok')::boolean, 'Pemilik harus anggota NFR.';
  v := public.peluang_tindak_lanjut(v_p, 'analis3@uji.invalid', 'Hubungi tim ekspansi tenant.', current_date + 7);
  assert (v ->> 'ok')::boolean, 'Tindak lanjut harus tersimpan.';
  assert (select pemilik = 'analis3@uji.invalid' and tindakan_berikut is not null and tenggat = current_date + 7 from public.peluang where id = v_p),
    'Pemilik, tindakan berikut, dan tenggat harus tercatat.';
  v := public.peluang_ubah_tahap(v_p, 'terpilih');
  v := public.peluang_ubah_tahap(v_p, 'dihubungi');
  assert (v ->> 'ok')::boolean, 'Tahap dihubungi harus bisa dicapai.';

  -- konfirmasi minat wajib bercatatan
  v := public.peluang_ubah_tahap(v_p, 'berminat');
  assert not (v ->> 'ok')::boolean, 'Konfirmasi minat tanpa catatan harus ditolak.';
  v := public.peluang_ubah_tahap(v_p, 'berminat', null, 'Manajer ekspansi menyatakan minat lewat email 10 Nov.');
  v := public.peluang_ubah_tahap(v_p, 'survei');
  assert (v ->> 'ok')::boolean, 'Tahap survei harus bisa dicapai.';

  -- penawaran butuh versi yang diterbitkan
  v := public.peluang_ubah_tahap(v_p, 'penawaran');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%versi penawaran%', 'Tahap penawaran butuh versi yang diterbitkan.';
  v := public.penawaran_simpan(v_p, '{"sewa_tahunan":"abc","lama_sewa_bulan":"24","skema":"sewa_tetap"}'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Sewa yang bukan angka harus ditolak.';
  v := public.penawaran_simpan(v_p, '{"sewa_tahunan":"60000000","lama_sewa_bulan":"24","skema":"bagi_hasil"}'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Skema bagi hasil tanpa persentase harus ditolak.';
  v := public.penawaran_simpan(v_p, '{"sewa_tahunan":"60000000","lama_sewa_bulan":"24","skema":"sewa_tetap"}'::jsonb);
  assert (v ->> 'ok')::boolean, 'Draf penawaran harus tersimpan.';
  v_v := (v ->> 'id')::uuid;
  assert (public.penawaran_simpan(v_p, '{"sewa_tahunan":"62000000","lama_sewa_bulan":"24","skema":"sewa_tetap"}'::jsonb) ->> 'id')::uuid = v_v,
    'Menyimpan lagi harus memperbarui draf yang sama, bukan membuat versi baru.';
  v := public.penawaran_terbitkan(v_v);
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%penerima sewa%', 'Penawaran tidak boleh terbit sebelum penerima sewa dipastikan.';
  v := public.penawaran_simpan(v_p, '{"sewa_tahunan":"62000000","lama_sewa_bulan":"24","skema":"sewa_tetap","penerima_sewa":"pemilik_spbu","deposit":"5000000"}'::jsonb);
  v := public.penawaran_terbitkan(v_v);
  assert (v ->> 'ok')::boolean, 'Draf lengkap harus bisa diterbitkan.';
  assert (select versi = 1 and status = 'diterbitkan' and diterbitkan_oleh = 'analis3@uji.invalid' from public.penawaran_versi where id = v_v), 'Versi 1 harus berlaku.';
  assert (select count(*) from public.persetujuan where penawaran_id = v_v and status = 'menunggu' and not gugur) = 4, 'Empat persetujuan harus dibuka untuk versi yang terbit.';
  update _bahan set v1 = v_v;

  -- versi yang sudah terbit dan tabelnya tidak bisa diubah langsung
  begin
    update public.penawaran_versi set sewa_tahunan = 1;
    assert false, 'Versi penawaran tidak boleh bisa diubah langsung.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.persetujuan set status = 'disetujui';
    assert false, 'Persetujuan tidak boleh bisa diubah langsung.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kontrak_peluang (peluang_id, penawaran_id, nomor, tanggal_tanda_tangan) values (v_p, v_v, 'X', current_date);
    assert false, 'Kontrak tidak boleh bisa dicatat langsung.';
  exception when insufficient_privilege then null;
  end;

  v := public.peluang_ubah_tahap(v_p, 'penawaran');
  v := public.peluang_ubah_tahap(v_p, 'negosiasi');
  assert (v ->> 'ok')::boolean, 'Tahap negosiasi harus bisa dicapai.';

  -- persetujuan hanya dicatat di tahap persetujuan
  v := public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = v_v and pihak = 'dealer'), 'disetujui', null, 'Surat pemilik SPBU 12 Nov', 'Bpk Uji, pemilik SPBU');
  assert not (v ->> 'ok')::boolean, 'Persetujuan di luar tahap persetujuan harus ditolak.';
  v := public.peluang_ubah_tahap(v_p, 'persetujuan');
  assert (v ->> 'ok')::boolean, 'Tahap persetujuan harus bisa dicapai.';

  -- analis tidak memegang wewenang persetujuan NFR
  v := public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = v_v and pihak = 'nfr'), 'disetujui');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%Analis%', 'Analis tidak boleh memberi persetujuan NFR.';
  -- pihak luar: wajib wewenang dan bukti
  v := public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = v_v and pihak = 'dealer'), 'disetujui');
  assert not (v ->> 'ok')::boolean, 'Persetujuan atas nama tanpa wewenang dan bukti harus ditolak.';
  v := public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = v_v and pihak = 'dealer'), 'disetujui', null, 'Surat pemilik SPBU no. 12/XI/2026', 'Bpk Uji, pemilik SPBU (DODO)');
  assert (v ->> 'ok')::boolean, 'Persetujuan dealer atas nama dengan bukti harus tercatat.';
  assert (select atas_nama and penyetuju_email = 'analis3@uji.invalid' from public.persetujuan where penawaran_id = v_v and pihak = 'dealer'),
    'Persetujuan atas nama harus ditandai dan mencatat siapa yang mencatatnya.';
  v := public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = v_v and pihak = 'dealer'), 'ditolak', 'Berubah pikiran.', 'Surat lain no. 13', 'Bpk Uji');
  assert not (v ->> 'ok')::boolean, 'Persetujuan yang sudah diputuskan tidak bisa diubah.';
  -- tenant minta revisi
  v := public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = v_v and pihak = 'tenant'), 'minta_revisi', 'singkat', 'Email 13 Nov dari manajer ekspansi', 'Ibu Uji, manajer ekspansi');
  assert not (v ->> 'ok')::boolean, 'Permintaan revisi wajib beralasan.';
  v := public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = v_v and pihak = 'tenant'), 'minta_revisi', 'Minta masa bebas sewa dua bulan.', 'Email 13 Nov dari manajer ekspansi', 'Ibu Uji, manajer ekspansi');
  assert (v ->> 'ok')::boolean, 'Permintaan revisi harus tercatat.';

  v := public.peluang_ubah_tahap(v_p, 'kontrak');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%menyetujui%', 'Kontrak harus ditolak selama belum semua pihak setuju.';

  -- versi baru: persetujuan lama gugur, empat persetujuan baru dibuka
  v := public.penawaran_simpan(v_p, '{"sewa_tahunan":"62000000","lama_sewa_bulan":"24","skema":"sewa_tetap","penerima_sewa":"pemilik_spbu","deposit":"5000000","bebas_sewa_bulan":"2"}'::jsonb);
  v_v := (v ->> 'id')::uuid;
  v := public.penawaran_terbitkan(v_v);
  assert (v ->> 'ok')::boolean and v ->> 'pesan' like '%gugur%', 'Versi 2 harus terbit dan memberi tahu persetujuan lama gugur.';
  assert (select status from public.penawaran_versi where id = (select v1 from _bahan)) = 'digantikan', 'Versi 1 harus berstatus digantikan.';
  assert (select count(*) from public.persetujuan where penawaran_id = (select v1 from _bahan) and gugur) = 4, 'Persetujuan versi 1 harus gugur semua.';
  assert (select status = 'disetujui' and gugur from public.persetujuan where penawaran_id = (select v1 from _bahan) and pihak = 'dealer'),
    'Keputusan lama tetap tersimpan sebagai riwayat, hanya ditandai gugur.';
  assert (select count(*) from public.persetujuan where penawaran_id = v_v and status = 'menunggu' and not gugur) = 4, 'Versi 2 butuh empat persetujuan baru.';
  update _bahan set v2 = v_v;

  for v in select jsonb_build_object('id', id, 'pihak', pihak) from public.persetujuan where penawaran_id = v_v and pihak <> 'nfr' loop
    assert (public.persetujuan_putuskan((v ->> 'id')::uuid, 'disetujui', null, 'Berita acara persetujuan 14 Nov 2026', 'Wakil pihak ' || (v ->> 'pihak')) ->> 'ok')::boolean,
      'Persetujuan pihak luar atas versi 2 harus tercatat.';
  end loop;
  perform public.peluang_set_syarat(s.id, true) from public.peluang_syarat s where s.peluang_id = v_p;
  v := public.peluang_ubah_tahap(v_p, 'kontrak');
  assert not (v ->> 'ok')::boolean, 'Kontrak masih ditolak: persetujuan NFR belum ada.';
  v := public.kontrak_catat_tanda_tangan(v_p, current_date, 'K-001/UJI/2026');
  assert not (v ->> 'ok')::boolean, 'Analis tidak boleh mencatat tanda tangan kontrak.';
end $$;
reset role;

-- ---------------------------------------------------------------- penyetuju: persetujuan NFR, tanda tangan
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000022","email":"penyetuju3@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare
  v    jsonb;
  v_p  uuid := (select peluang from _bahan);
  v_v  uuid := (select v2 from _bahan);
begin
  v := public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = (select v1 from _bahan) and pihak = 'nfr'), 'disetujui');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%digantikan%', 'Persetujuan atas versi yang sudah digantikan harus ditolak.';
  v := public.persetujuan_putuskan((select id from public.persetujuan where penawaran_id = v_v and pihak = 'nfr'), 'disetujui');
  assert (v ->> 'ok')::boolean, 'Penyetuju NFR yang bukan penyusun harus bisa menyetujui.';
  assert (select data ->> 'versi' = '2' from public.audit_peristiwa where peristiwa = 'persetujuan_diputuskan' and entitas_id = v_p::text
          order by id desc limit 1), 'Jejak audit persetujuan harus menyebut versi penawarannya.';

  -- syarat masuk tahap kontrak kini terpenuhi semua
  assert (select bool_and((x ->> 'terpenuhi')::boolean) from jsonb_array_elements(public.peluang_syarat_masuk(v_p, 'kontrak')) x),
    'Semua syarat masuk tahap kontrak harus terpenuhi.';
  v := public.peluang_ubah_tahap(v_p, 'kontrak');
  assert (v ->> 'ok')::boolean, 'Tahap kontrak harus bisa dicapai setelah semua pihak setuju.';

  -- tahap kontrak belum berarti ditandatangani
  v := public.peluang_ubah_tahap(v_p, 'aktivasi');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%ditandatangani%', 'Aktivasi butuh tanda tangan kontrak yang dicatat.';
  v := public.kontrak_catat_tanda_tangan(v_p, current_date + 1, 'K-001/UJI/2026');
  assert not (v ->> 'ok')::boolean, 'Tanggal tanda tangan di masa depan harus ditolak.';
  v := public.kontrak_catat_tanda_tangan(v_p, current_date, 'K-001/UJI/2026');
  assert (v ->> 'ok')::boolean, 'Tanda tangan kontrak harus tercatat.';
  assert (select penawaran_id = v_v from public.kontrak_peluang where peluang_id = v_p), 'Kontrak harus terikat pada versi penawaran yang berlaku.';
  v := public.peluang_ubah_tahap(v_p, 'aktivasi');
  assert (v ->> 'ok')::boolean, 'Tahap aktivasi harus bisa dicapai setelah tanda tangan.';

  -- tanda tangan belum berarti beroperasi
  v := public.peluang_ubah_tahap(v_p, 'pemantauan');
  assert not (v ->> 'ok')::boolean and v ->> 'pesan' like '%beroperasi%', 'Pemantauan butuh tanggal mulai beroperasi.';
  v := public.kontrak_catat_aktif(v_p, current_date - 1);
  assert not (v ->> 'ok')::boolean, 'Mulai beroperasi sebelum tanda tangan harus ditolak.';
  v := public.kontrak_catat_aktif(v_p, current_date);
  v := public.peluang_ubah_tahap(v_p, 'pemantauan');
  assert (v ->> 'ok')::boolean, 'Tahap pemantauan harus bisa dicapai setelah outlet beroperasi.';

  -- bentuk rincian yang dibaca halaman
  v := public.peluang_rinci(v_p);
  assert jsonb_array_length(v -> 'penawaran') = 2 and jsonb_array_length(v -> 'persetujuan') = 8 and v -> 'kontrak' ->> 'versi' = '2'
         and v ->> 'tahap_berikut' is null and jsonb_array_length(v -> 'anggota') >= 2,
    'Rincian peluang harus memuat dua versi, delapan persetujuan, kontrak, dan anggota NFR.';
  v := public.peluang_daftar('pemantauan');
  assert (v ->> 'total')::int >= 1, 'Daftar peluang harus bisa disaring per tahap baru.';

  -- hasil akhir dan buka kembali
  v := public.peluang_ubah_tahap(v_p, 'kalah', null, 'Tenant memilih lokasi pesaing.');
  assert (v ->> 'ok')::boolean and (select tahap from public.peluang where id = v_p) = 'kalah', 'Hasil akhir beralasan harus tercatat.';
  assert (public.peluang_daftar('berakhir') ->> 'total')::int >= 1, 'Peluang yang berakhir harus muncul di saringan berakhir.';
  v := public.peluang_ubah_tahap(v_p, 'pemantauan', null, 'Salah catat.');
  assert (v ->> 'ok')::boolean, 'Peluang yang berakhir harus bisa dibuka kembali ke tahap sebelumnya.';
end $$;
reset role;

-- ---------------------------------------------------------------- tenant: tidak melihat penawaran pihak lain
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000023","email":"tenant3@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  assert (select count(*) from public.penawaran_versi) = 0, 'Tenant tidak boleh membaca versi penawaran.';
  assert (select count(*) from public.persetujuan) = 0, 'Tenant tidak boleh membaca persetujuan.';
  assert (select count(*) from public.kontrak_peluang) = 0, 'Tenant tidak boleh membaca kontrak.';
  assert jsonb_array_length(public.anggota_nfr()) = 0, 'Tenant tidak boleh membaca daftar anggota NFR.';
  assert jsonb_array_length(public.peluang_syarat_masuk((select peluang from _bahan), 'kontrak')) = 0, 'Tenant tidak boleh membaca syarat tahap.';
  v := public.penawaran_simpan((select peluang from _bahan), '{"sewa_tahunan":"1","lama_sewa_bulan":"12","skema":"sewa_tetap"}'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh menyusun penawaran.';
  v := public.persetujuan_putuskan((select id from public.persetujuan limit 1), 'disetujui');
  assert v is null or not (v ->> 'ok')::boolean, 'Tenant tidak boleh mencatat persetujuan.';
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji alur komersial (12 tahap, pemilik dan tenggat, penawaran berversi, persetujuan terikat versi, tanda tangan, aktivasi).'
