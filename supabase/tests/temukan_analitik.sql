-- Uji otomatis analitik Temukan peluang (fase D): peristiwa dicatat dari perubahan sesi, tanpa data pribadi,
-- umpan balik, batas per sesi, retensi 180 hari, dan angka gabungan hanya untuk tim NFR.
-- Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '90s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000e1', 'tenant14@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000e2', 'dealer14@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000e3', 'analis14@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-0000000000e1', 'Tenant Uji 14', 'tenant', true),
  ('00000000-0000-4000-b000-0000000000e2', 'Dealer Uji 14', 'dealer', true);
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-0000000000e1', '00000000-0000-4000-b000-0000000000e1', 'tenant_admin'),
  ('00000000-0000-4000-a000-0000000000e2', '00000000-0000-4000-b000-0000000000e2', 'dealer_admin');
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-0000000000e3', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';

create temporary table uji_d on commit drop as
select r.lahan_id, r.spbu_id, l.kode from public.temukan_ruang_tampil() r
join public.lahan l on l.spbu_id = r.spbu_id and l.lahan_id = r.lahan_id and not l.duplikat limit 1;
grant select on uji_d to anon, authenticated;
delete from public.hak_spbu h using uji_d u where h.spbu_id = u.spbu_id;
insert into public.hak_spbu (spbu_id, spbu_nomor, organisasi_dealer)
select u.spbu_id, s.nomor, '00000000-0000-4000-b000-0000000000e2'::uuid from uji_d u join public.spbu s on s.id = u.spbu_id;
delete from public.minat_lokasi m using uji_d u where m.lahan_id = u.lahan_id;

-- Angka sebelum uji, agar yang diperiksa adalah selisihnya (basis data bisa sudah memuat peristiwa nyata).
create temporary table dasar_d on commit drop as
select public.temukan_analitik_peran('tenant', 30) as tenant, public.temukan_analitik_peran('dealer', 30) as dealer;
grant select on dasar_d to authenticated;

create function pg_temp.sebagai(p_sub text, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims', case when p_sub is null then '' else json_build_object('sub', p_sub, 'email', p_email, 'role', 'authenticated')::text end, true)
$$;
create function pg_temp.peristiwa(p_kunci text, p_peran text) returns table (peristiwa text, langkah text, data jsonb, urut bigint)
language sql security definer as $$
  select e.peristiwa, e.langkah, e.data, row_number() over (order by e.id)
  from public.peristiwa_temukan e
  where e.sesi = public.temukan_pseudonim((select s.id from public.sesi_temukan s where s.token_hash = public.temukan_sidik(p_kunci) and s.peran = p_peran))
$$;

-- ---------------------------------------------------------------- perjalanan kuesioner tanpa akun
set local role anon;
do $$
declare v jsonb; k constant text := 'P' || repeat('p', 42);
begin
  perform public.temukan_simpan(k, 'tenant', '2026.11', 'wilayah', '{"usaha":["fnb"]}'::jsonb);
  perform public.temukan_simpan(k, 'tenant', '2026.11', 'anggaran',
    '{"usaha":["fnb"],"wilayah":{"terbuka":false,"lain":false,"daftar":[{"provinsi":"Banten","kota":"Kodya Tangerang"},{"provinsi":"Banten","kota":"Kodya Cilegon"}]},"ruang":{"luas_min":12,"catatan":"teks bebas rahasia"}}'::jsonb,
    array['pelanggan']);
  perform public.temukan_simpan(k, 'tenant', '2026.11', 'anggaran', '{"usaha":["ritel"],"wilayah":{"terbuka":false,"lain":false,"daftar":[{"provinsi":"Banten","kota":"Kodya Tangerang"},{"provinsi":"Banten","kota":"Kodya Cilegon"}]},"ruang":{"luas_min":12,"catatan":"teks bebas rahasia"}}'::jsonb, array['pelanggan']);
  perform public.temukan_simpan(k, 'tenant', '2026.11', null, '{"usaha":["ritel"],"wilayah":{"terbuka":true},"ruang":{"luas_min":12},"anggaran":{"pilihan":"r25","maks":25000000},"prioritas":["biaya","akses"]}'::jsonb, array['pelanggan'], true);
  perform public.temukan_simpan(k, 'tenant', '2026.11', null, '{"usaha":["ritel"],"wilayah":{"terbuka":true},"ruang":{"luas_min":12},"anggaran":{"pilihan":"r25","maks":25000000},"prioritas":["biaya","akses"]}'::jsonb, array['pelanggan'], true);

  -- tiga peristiwa tampilan dari halaman
  assert not (public.temukan_peristiwa('X' || repeat('x', 42), 'tenant', 'recommendation_viewed') ->> 'ok')::boolean, 'Tanpa sesi, peristiwa tidak dicatat.';
  assert not (public.temukan_peristiwa(k, 'tenant', 'discovery_completed') ->> 'ok')::boolean, 'Peristiwa perjalanan tidak bisa dikirim dari luar.';
  assert not (public.temukan_peristiwa(k, 'tenant', 'tenant_interest_submitted') ->> 'ok')::boolean, 'Peristiwa minat tidak bisa dikirim dari luar.';
  assert (public.temukan_peristiwa(k, 'tenant', 'recommendation_generated', '{"jumlah":"0","kosong":true,"email":"a@b.c"}'::jsonb) ->> 'ok')::boolean, 'Rekomendasi dibuat tercatat.';
  assert (public.temukan_peristiwa(k, 'tenant', 'recommendation_generated', '{"jumlah":"27","tertahan":"5","kosong":false}'::jsonb) ->> 'ok')::boolean;
  assert (public.temukan_peristiwa(k, 'tenant', 'recommendation_viewed', '{"jumlah":"27"}'::jsonb) ->> 'ok')::boolean;
  assert (public.temukan_peristiwa(k, 'tenant', 'recommendation_clicked', '{"aksi":"rinci","urut":"1","skor":"88","lahan":"rahasia","aksi2":"x"}'::jsonb) ->> 'ok')::boolean;
  assert (public.temukan_peristiwa(k, 'tenant', 'recommendation_clicked', '{"aksi":"<script>","urut":"abc"}'::jsonb) ->> 'ok')::boolean;

  -- umpan balik
  assert not (public.temukan_umpan(k, 'tenant', 'L1', null, 'bagus') ->> 'ok')::boolean, 'Nilai umpan balik harus dikenal.';
  assert not (public.temukan_umpan(k, 'tenant', 'L1', null, 'kurang', 'karangan') ->> 'ok')::boolean, 'Alasan harus dari daftar.';
  assert not (public.temukan_umpan('X' || repeat('x', 42), 'tenant', 'L1', null, 'sesuai') ->> 'ok')::boolean, 'Tanpa sesi, umpan balik ditolak.';
  assert not (public.temukan_umpan(k, 'dealer', 'L1', null, 'sesuai') ->> 'ok')::boolean, 'Sesi tenant tidak bisa menilai sebagai pengelola.';
  assert (public.temukan_umpan(k, 'tenant', 'L1', null, 'sesuai', 'tarif', '{"skor":"90","preferensi":"70","urut":"1","versi_model":"2","versi_preferensi":"p1"}'::jsonb) ->> 'ok')::boolean;
  assert (public.temukan_umpan(k, 'tenant', 'L2', 'F&B / Kuliner', 'kurang', 'tarif', '{"skor":"60"}'::jsonb) ->> 'ok')::boolean;
  assert (public.temukan_umpan(k, 'tenant', 'L1', null, 'kurang', 'lokasi', '{"skor":"90","urut":"1"}'::jsonb) ->> 'ok')::boolean, 'Penilaian baru menimpa yang lama.';
  v := public.temukan_umpan_saya(k, 'tenant');
  assert jsonb_array_length(v) = 2 and (select count(*) from jsonb_array_elements(v) x where x ->> 'lahan_id' = 'L1' and x ->> 'nilai' = 'kurang' and x ->> 'alasan' = 'lokasi') = 1,
    'Satu penilaian per lokasi, yang terbaru.';
  assert jsonb_array_length(public.temukan_umpan_saya('X' || repeat('x', 42), 'tenant')) = 0, 'Pemegang kunci lain tidak melihat penilaian ini.';

  begin
    perform 1 from public.peristiwa_temukan;
    assert false, 'Tabel peristiwa tidak boleh bisa dibaca langsung.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.umpan_temukan;
    assert false, 'Tabel umpan balik tidak boleh bisa dibaca langsung.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.temukan_analitik(30);
    assert false, 'Angka analitik tidak boleh bisa diminta tanpa akun.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare e record; k constant text := 'P' || repeat('p', 42); v_n integer;
begin
  assert (select array_agg(p.peristiwa || coalesce(':' || p.langkah, '') order by p.urut) from pg_temp.peristiwa(k, 'tenant') p) = array[
    'discovery_started', 'role_selected', 'question_answered:usaha',
    'question_answered:ruang', 'question_answered:wilayah', 'question_skipped:pelanggan',
    'preferences_updated:usaha',
    'preferences_updated:ruang', 'preferences_updated:wilayah', 'question_answered:anggaran', 'question_answered:prioritas', 'discovery_completed',
    'recommendation_generated', 'recommendation_generated', 'recommendation_viewed', 'recommendation_clicked', 'recommendation_clicked'],
    format('Urutan peristiwa tidak sesuai: %s', (select array_agg(p.peristiwa || coalesce(':' || p.langkah, '') order by p.urut) from pg_temp.peristiwa(k, 'tenant') p));

  -- isi yang ikut ke analitik: pilihan saja, wilayah sampai provinsi, tanpa teks bebas
  assert (select p.data from pg_temp.peristiwa(k, 'tenant') p where p.peristiwa = 'question_answered' and p.langkah = 'usaha') = '{"nilai":["fnb"]}'::jsonb;
  assert (select p.data from pg_temp.peristiwa(k, 'tenant') p where p.peristiwa = 'question_answered' and p.langkah = 'wilayah') = '{"nilai":["Banten"]}'::jsonb, 'Wilayah hanya sampai provinsi.';
  assert (select p.data from pg_temp.peristiwa(k, 'tenant') p where p.peristiwa = 'question_answered' and p.langkah = 'ruang') = '{}'::jsonb, 'Isian ruang tidak ikut.';
  assert (select p.data from pg_temp.peristiwa(k, 'tenant') p where p.peristiwa = 'question_answered' and p.langkah = 'anggaran') = '{"nilai":["r25"]}'::jsonb;
  assert not exists (select 1 from pg_temp.peristiwa(k, 'tenant') p where p.data::text ~* 'tangerang|cilegon|rahasia|email|script|25000000'), 'Tidak ada kota, teks bebas, atau angka anggaran di peristiwa.';
  select * into e from pg_temp.peristiwa(k, 'tenant') p where p.peristiwa = 'discovery_completed';
  assert (e.data ->> 'detik')::int >= 0, 'Lama pengisian tercatat.';
  assert (select array_agg(p.data order by p.urut) from pg_temp.peristiwa(k, 'tenant') p where p.peristiwa = 'recommendation_clicked')
       = array['{"aksi":"rinci","urut":1,"skor":88}'::jsonb, '{}'::jsonb], 'Data klik dibersihkan.';
  assert (select array_agg(p.data order by p.urut) from pg_temp.peristiwa(k, 'tenant') p where p.peristiwa = 'recommendation_generated')
       = array['{"jumlah":0,"kosong":true}'::jsonb, '{"jumlah":27,"tertahan":5,"kosong":false}'::jsonb];

  -- kolom tabel: tidak ada tempat untuk identitas
  assert (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'peristiwa_temukan')
       = array['id', 'waktu', 'sesi', 'peran', 'peristiwa', 'langkah', 'data'], 'Tabel peristiwa tidak punya kolom akun, email, atau alamat IP.';
  assert not exists (select 1 from public.peristiwa_temukan e2 join public.sesi_temukan s on e2.sesi = s.id::text or e2.sesi = s.token_hash), 'Pseudonim bukan id sesi dan bukan sidik kunci cookie.';
  assert (select count(*) from public.umpan_temukan u where u.skor = 90 and u.nilai = 'kurang' and u.urut = 1 and u.preferensi is null) = 1, 'Potret umpan balik dibersihkan dan ditimpa.';
  assert (select segmen from public.umpan_temukan where lahan_id = 'L2') is null, 'Jenis usaha hanya disimpan untuk penilaian pengelola SPBU.';

  -- batas 300 peristiwa per sesi per hari
  insert into public.peristiwa_temukan (sesi, peran, peristiwa)
  select public.temukan_pseudonim((select id from public.sesi_temukan where token_hash = public.temukan_sidik(k))), 'tenant', 'recommendation_viewed' from generate_series(1, 300);
  set local role anon;
  assert not (public.temukan_peristiwa(k, 'tenant', 'recommendation_viewed') ->> 'ok')::boolean, 'Di atas 300 peristiwa per hari, sesi berhenti dicatat.';
  reset role;
  delete from public.peristiwa_temukan where id in (select id from public.peristiwa_temukan where peristiwa = 'recommendation_viewed' order by id desc limit 300);

  -- retensi 180 hari
  insert into public.peristiwa_temukan (waktu, sesi, peran, peristiwa) values (now() - interval '181 days', 'usang', 'tenant', 'discovery_started'), (now() - interval '179 days', 'belum-usang', 'tenant', 'discovery_started');
  insert into public.umpan_temukan (sesi, peran, lahan_id, nilai, diubah) values ('usang', 'tenant', 'L9', 'sesuai', now() - interval '181 days');
  assert public.temukan_retensi() = '{"peristiwa":1,"umpan":1}'::jsonb, 'Yang lebih tua dari 180 hari dihapus, yang belum tidak.';
  assert exists (select 1 from public.peristiwa_temukan where sesi = 'belum-usang');
end $$;

-- ---------------------------------------------------------------- minat dari akun dan dari formulir
do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000e1', 'tenant14@uji.invalid'); end $_$;
set local role authenticated;
do $$ begin
  perform public.temukan_simpan(null, 'tenant', '2026.11', null, '{"usaha":["fnb"]}'::jsonb);
  assert (public.temukan_minati((select lahan_id from uji_d)) ->> 'ok')::boolean;
  assert public.temukan_analitik(30) is null, 'Tenant tidak mendapat angka analitik.';
end $$;
reset role;
do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000e2', 'dealer14@uji.invalid'); end $_$;
set local role authenticated;
do $$ begin
  perform public.temukan_simpan(null, 'dealer', '2026.11', null, '{"tujuan":["kosong"]}'::jsonb);
  assert (public.temukan_minati_usaha((select spbu_id from uji_d), (select lahan_id from uji_d), 'F&B / Kuliner') ->> 'ok')::boolean;
  assert (public.temukan_umpan(null, 'dealer', (select lahan_id from uji_d), 'F&B / Kuliner', 'sesuai') ->> 'ok')::boolean, 'Pengelola menilai jenis usaha untuk satu ruang.';
  assert not (public.temukan_umpan(null, 'dealer', (select lahan_id from uji_d), 'Karangan', 'sesuai') ->> 'ok')::boolean, 'Jenis usaha yang dinilai harus dikenal.';
end $$;
reset role;
do $_$ begin perform pg_temp.sebagai(null, null); end $_$;
set local role anon;
do $$
declare k constant text := 'P' || repeat('p', 42); t uuid;
begin
  perform public.temukan_tandai(k, jsonb_build_array(jsonb_build_object('lahan_id', (select lahan_id from uji_d))));
  t := (public.daftar_calon('{"nama_usaha":"Kedai Uji 14","segmen":"F&B / Kuliner","kontak_nama":"Uji","kontak_email":"uji14@uji.invalid"}'::jsonb) ->> 'token')::uuid;
  assert (public.temukan_serahkan(k, t) ->> 'jumlah')::int = 1;
end $$;
reset role;

do $$
declare k constant text := 'P' || repeat('p', 42);
begin
  assert (select count(*) from pg_temp.peristiwa(k, 'tenant') p where p.peristiwa = 'tenant_interest_submitted' and p.data ->> 'sumber' = 'formulir') = 1,
    'Minat dari formulir tercatat atas sesi cookie asalnya.';
  assert (select count(*) from public.peristiwa_temukan e where e.peristiwa = 'tenant_interest_submitted' and e.data ->> 'sumber' = 'temukan'
          and e.sesi = public.temukan_pseudonim((select id from public.sesi_temukan where user_id = '00000000-0000-4000-a000-0000000000e1'))) = 1, 'Minat tenant berakun tercatat atas sesi akunnya.';
  assert (select count(*) from public.peristiwa_temukan e where e.peristiwa = 'dealer_interest_submitted' and e.data ->> 'segmen' = 'F&B / Kuliner'
          and e.sesi = public.temukan_pseudonim((select id from public.sesi_temukan where user_id = '00000000-0000-4000-a000-0000000000e2'))) = 1, 'Ketertarikan pengelola tercatat.';
  assert not exists (select 1 from public.peristiwa_temukan e where e.data::text ~* 'uji14|Kedai|@'), 'Nama usaha dan kontak tidak masuk ke peristiwa.';
end $$;

-- ---------------------------------------------------------------- angka gabungan untuk tim NFR
do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000e3', 'analis14@uji.invalid'); end $_$;
set local role authenticated;
do $$
declare v jsonb; t jsonb; d jsonb; t0 jsonb; d0 jsonb;
begin
  select tenant, dealer into t0, d0 from dasar_d;
  v := public.temukan_analitik(30);
  t := v -> 'tenant'; d := v -> 'dealer';
  assert (v ->> 'hari')::int = 30 and (v ->> 'retensi_hari')::int = 180, 'Jendela dan retensi ikut dikembalikan.';
  assert (public.temukan_analitik(9999) ->> 'hari')::int = 180 and (public.temukan_analitik(-5) ->> 'hari')::int = 1, 'Jendela dijepit antara 1 dan 180 hari.';
  assert (t ->> 'mulai')::int - (t0 ->> 'mulai')::int = 2 and (t ->> 'selesai')::int - (t0 ->> 'selesai')::int = 1, 'Dua sesi tenant mulai, satu selesai.';
  assert (d ->> 'mulai')::int - (d0 ->> 'mulai')::int = 1 and (d ->> 'selesai')::int - (d0 ->> 'selesai')::int = 0, 'Satu sesi pengelola mulai, belum selesai.';
  assert (t ->> 'detik_median') is not null, 'Median lama pengisian dihitung.';
  assert (select (x ->> 'dijawab')::int from jsonb_array_elements(t -> 'pertanyaan') x where x ->> 'langkah' = 'usaha')
       - coalesce((select (x ->> 'dijawab')::int from jsonb_array_elements(t0 -> 'pertanyaan') x where x ->> 'langkah' = 'usaha'), 0) = 2, 'Pertanyaan usaha dijawab dua sesi.';
  assert (select (x ->> 'dilewati')::int from jsonb_array_elements(t -> 'pertanyaan') x where x ->> 'langkah' = 'pelanggan')
       - coalesce((select (x ->> 'dilewati')::int from jsonb_array_elements(t0 -> 'pertanyaan') x where x ->> 'langkah' = 'pelanggan'), 0) = 1, 'Pertanyaan pelanggan dilewati satu sesi.';
  assert (select (x ->> 'sesi')::int from jsonb_array_elements(t -> 'berhenti') x where x ->> 'langkah' = 'usaha')
       - coalesce((select (x ->> 'sesi')::int from jsonb_array_elements(t0 -> 'berhenti') x where x ->> 'langkah' = 'usaha'), 0) = 1, 'Sesi yang belum selesai berhenti di pertanyaan terakhir yang dijawabnya.';
  assert (t -> 'rekomendasi' ->> 'dibuat')::int - (t0 -> 'rekomendasi' ->> 'dibuat')::int = 2
     and (t -> 'rekomendasi' ->> 'kosong')::int - (t0 -> 'rekomendasi' ->> 'kosong')::int = 1
     and (t -> 'rekomendasi' ->> 'sesi_melihat')::int - (t0 -> 'rekomendasi' ->> 'sesi_melihat')::int = 1
     and (t -> 'rekomendasi' ->> 'sesi_klik')::int - (t0 -> 'rekomendasi' ->> 'sesi_klik')::int = 1
     and (t -> 'rekomendasi' ->> 'sesi_minat')::int - (t0 -> 'rekomendasi' ->> 'sesi_minat')::int = 2
     and (t -> 'rekomendasi' ->> 'sesi_ubah')::int - (t0 -> 'rekomendasi' ->> 'sesi_ubah')::int = 1, format('Angka rekomendasi tidak sesuai: %s', t -> 'rekomendasi');
  assert (d -> 'rekomendasi' ->> 'sesi_minat')::int - (d0 -> 'rekomendasi' ->> 'sesi_minat')::int = 1, 'Ketertarikan pengelola terhitung.';
  -- pilihan memakai jawaban terakhir tiap sesi: sesi pertama berakhir di ritel, bukan fnb
  assert exists (select 1 from jsonb_array_elements(t -> 'pilihan') x where x ->> 'langkah' = 'usaha' and x ->> 'nilai' = 'ritel'), 'Pilihan terakhir tiap sesi yang dihitung.';
  assert (t -> 'umpan' ->> 'kurang')::int - (t0 -> 'umpan' ->> 'kurang')::int = 2 and (t -> 'umpan' ->> 'sesuai')::int - (t0 -> 'umpan' ->> 'sesuai')::int = 0, 'Umpan balik terhitung.';
  assert (d -> 'umpan' ->> 'sesuai')::int - (d0 -> 'umpan' ->> 'sesuai')::int = 1;
  assert v::text !~* 'uji14|tangerang|@|[0-9a-f]{16}', 'Angka gabungan tidak memuat pseudonim sesi, kota, atau kontak.';
  begin
    perform 1 from public.peristiwa_temukan;
    assert false, 'Tim NFR pun tidak membaca tabel peristiwa langsung.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji analitik Temukan peluang (peristiwa dari perubahan sesi, tanpa data pribadi, umpan balik, batas per sesi, retensi, angka gabungan hanya untuk NFR).'
