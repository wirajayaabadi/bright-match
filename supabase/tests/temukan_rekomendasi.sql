-- Uji otomatis rekomendasi Temukan peluang (fase B): syarat wajib tidak pernah dilanggar, wilayah, ruang yang
-- ditahan tidak tampil, tidak ada nama penyewa untuk umum, dan profil calon hanya untuk pengelola yang berwenang.
-- Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '90s';
set lock_timeout = '45s';
begin;

-- ---------------------------------------------------------------- aturan ruang tampil = aturan tim NFR
do $$
declare v_beda integer;
begin
  select count(*) into v_beda
  from (select v.lahan_id, v.spbu_id, v.status_data = 'terverifikasi' as terverifikasi
        from public.v_status_lahan v
        where v.status_sumber = 'Tersedia' and v.status_ruang = 'tersedia' and v.status_data <> 'disengketakan'
          and not exists (select 1 from public.peluang p where p.lahan_id = v.lahan_id and p.tahap in ('persetujuan', 'kontrak', 'aktivasi', 'pemantauan'))) a
  full join (select r.lahan_id, r.spbu_id, r.terverifikasi from public.temukan_ruang_tampil() r) b
    on a.lahan_id = b.lahan_id and a.spbu_id = b.spbu_id
  where a.lahan_id is null or b.lahan_id is null or a.terverifikasi is distinct from b.terverifikasi;
  assert v_beda = 0, format('Ruang tampil harus sama persis dengan aturan v_status_lahan; berbeda %s ruang.', v_beda);
end $$;

-- ---------------------------------------------------------------- mesin dengan profil sementara
do $$
declare v record;
begin
  -- syarat wajib: tidak ada baris yang melanggar; data kosong lolos dengan tanda null
  select count(*) as n,
         count(*) filter (where k.luas_m2 < 20) as luas_langgar,
         count(*) filter (where k.daya_w < 2200) as daya_langgar,
         count(*) filter (where k.tarif_tahunan > 30000000) as tarif_langgar,
         count(*) filter (where k.posisi = 'Diluar Bangunan') as posisi_langgar,
         count(*) filter (where k.luas_m2 is null and k.luas_ok is not null) as tanda_salah,
         count(*) filter (where k.segmen <> 'F&B / Kuliner' or k.tenant_id <> 'profil') as pihak_salah
  into v
  from public.kecocokan(p_profil => '{"segmen":"F&B / Kuliner","luas_min":20,"daya_min":2200,"anggaran":30000000,"posisi":"dalam","provinsi":[]}'::jsonb, p_batas => 6000) k;
  assert v.n > 0, 'Profil yang wajar harus menghasilkan kandidat.';
  assert v.luas_langgar = 0 and v.daya_langgar = 0 and v.tarif_langgar = 0 and v.posisi_langgar = 0,
    format('Syarat wajib dilanggar: luas %s, daya %s, tarif %s, posisi %s.', v.luas_langgar, v.daya_langgar, v.tarif_langgar, v.posisi_langgar);
  assert v.tanda_salah = 0 and v.pihak_salah = 0, 'Tanda syarat dan pihak yang dicocokkan harus benar.';

  -- anggaran fleksibel: boleh sampai 1,25 kali, tidak lebih
  select count(*) filter (where k.tarif_tahunan > 30000000) as di_atas, count(*) filter (where k.tarif_tahunan > 37500000) as terlalu_jauh into v
  from public.kecocokan(p_profil => '{"segmen":"F&B / Kuliner","anggaran":30000000,"anggaran_fleksibel":true,"provinsi":[]}'::jsonb, p_batas => 6000) k;
  assert v.di_atas > 0 and v.terlalu_jauh = 0, 'Anggaran fleksibel memberi kelonggaran 25 persen, tidak lebih.';

  -- provinsi membatasi wilayah
  assert not exists (select 1 from public.kecocokan(p_profil => '{"segmen":"F&B / Kuliner","provinsi":["Banten"]}'::jsonb, p_batas => 6000) k where k.provinsi <> 'Banten'),
    'Profil dengan provinsi hanya boleh mengembalikan provinsi itu.';
  -- profil tidak bercampur dengan arah lain
  assert (select count(distinct k.tenant_id) from public.kecocokan(p_lahan_id => (select lahan_id from public.temukan_ruang_tampil() limit 1), p_batas => 200) k where k.tenant_id = 'profil') = 0,
    'Arah satu lahan tidak boleh memuat profil sementara.';
end $$;

-- ---------------------------------------------------------------- pengunjung tanpa akun
create temporary table uji_b on commit drop as
select l.lahan_id, l.spbu_id, l.kode, s.kota, s.provinsi
from public.temukan_ruang_tampil() r
join public.lahan l on l.spbu_id = r.spbu_id and l.lahan_id = r.lahan_id and not l.duplikat
join public.spbu s on s.id = l.spbu_id
where l.segmen is not null and s.kota is not null
  and exists (select 1 from public.kecocokan(p_profil => jsonb_build_object('segmen', 'F&B / Kuliner', 'provinsi', jsonb_build_array(s.provinsi)), p_provinsi => s.provinsi, p_kota => s.kota, p_batas => 6000) k where k.lahan_id = l.lahan_id)
limit 1;
grant select on uji_b to anon, authenticated;

set local role anon;
do $$
declare
  v      jsonb;
  u      record;
  v_n    integer;
begin
  select * into u from uji_b;
  assert u.lahan_id is not null, 'Butuh satu ruang yang lolos untuk F&B.';

  -- masukan yang salah tidak pernah melempar galat
  assert public.temukan_lokasi(null) ->> 'ok' = 'false' and public.temukan_lokasi('[]'::jsonb) ->> 'ok' = 'false', 'Tanpa jenis usaha yang sah, tidak ada hasil.';
  assert public.temukan_lokasi('{"segmen":["Tidak Ada"]}'::jsonb) ->> 'ok' = 'false', 'Jenis usaha yang tidak dikenal ditolak.';
  v := public.temukan_lokasi(jsonb_build_object('segmen', jsonb_build_array('F&B / Kuliner'), 'luas_min', '1; drop table', 'anggaran', '-5', 'daya_min', '1e9',
         'wilayah', jsonb_build_array(jsonb_build_object('provinsi', u.provinsi, 'kota', u.kota)), 'batas', '99999'));
  assert (v ->> 'ok')::boolean and jsonb_array_length(v -> 'lokasi') between 1 and 300, 'Angka yang tidak sah diabaikan, batas dijepit di 300.';

  -- wilayah adalah syarat; kolom yang keluar tidak memuat penyewa atau kontrak
  assert not exists (select 1 from jsonb_array_elements(v -> 'lokasi') x where x ->> 'provinsi' <> u.provinsi or x ->> 'kota' <> u.kota or not (x ->> 'di_wilayah')::boolean),
    'Tanpa izin wilayah lain, hasil hanya dari wilayah yang dipilih.';
  assert exists (select 1 from jsonb_array_elements(v -> 'lokasi') x where x ->> 'lahan_id' = u.lahan_id), 'Ruang uji harus ada di hasil.';
  assert (v ->> 'jumlah')::int >= jsonb_array_length(v -> 'lokasi') and (v ->> 'jumlah_lain')::int = 0, 'Jumlah harus konsisten.';
  assert not exists (select 1 from jsonb_array_elements(v -> 'lokasi') x, jsonb_object_keys(x) k where k ~ 'tenant|kontrak|outlet' or k = 'harga'),
    'Hasil untuk umum tidak boleh memuat kolom penyewa atau kontrak.';
  assert coalesce(v ->> 'versi_model', '') <> '' and jsonb_array_length(v -> 'sumber') > 0, 'Versi model dan sumber data ikut dikembalikan.';
  assert (select bool_and((x ->> 'skor')::int = round((x ->> 'poin_jaringan')::numeric + (x ->> 'poin_pelengkap')::numeric + (x ->> 'poin_harga')::numeric
            + (x ->> 'poin_kesiapan')::numeric + (x ->> 'poin_tipe')::numeric + (x ->> 'poin_permintaan')::numeric)) from jsonb_array_elements(v -> 'lokasi') x),
    'Skor adalah jumlah enam komponen mesin, tanpa tambahan.';

  -- urutan dari mesin: skor menurun
  assert (select bool_and(a.skor >= b.skor) from (select (x ->> 'skor')::int as skor, i from jsonb_array_elements(v -> 'lokasi') with ordinality t (x, i)) a
          join (select (x ->> 'skor')::int as skor, i from jsonb_array_elements(v -> 'lokasi') with ordinality t (x, i)) b on b.i = a.i + 1), 'Urutan awal menurut skor mesin.';

  -- wilayah lain hanya bila diizinkan, dan ditandai
  v := public.temukan_lokasi(jsonb_build_object('segmen', jsonb_build_array('F&B / Kuliner'), 'wilayah', jsonb_build_array(jsonb_build_object('provinsi', u.provinsi, 'kota', u.kota)), 'lain', true, 'hanya_jumlah', true));
  assert (v ->> 'jumlah_lain')::int > 0 and jsonb_array_length(v -> 'lokasi') = 0, 'Dengan izin, wilayah lain dihitung terpisah; hanya_jumlah tidak mengirim daftar.';
  v_n := (v ->> 'jumlah')::int;
  v := public.temukan_lokasi(jsonb_build_object('segmen', jsonb_build_array('F&B / Kuliner'), 'wilayah', jsonb_build_array(jsonb_build_object('provinsi', u.provinsi)), 'hanya_jumlah', true));
  assert (v ->> 'jumlah')::int >= v_n, 'Seluruh provinsi memuat paling sedikit kota di dalamnya.';

  -- syarat yang mustahil: kosong, bukan dilonggarkan diam-diam
  v := public.temukan_lokasi(jsonb_build_object('segmen', jsonb_build_array('F&B / Kuliner'), 'luas_min', '90000'));
  assert (v ->> 'jumlah')::int = 0 or not exists (select 1 from jsonb_array_elements(v -> 'lokasi') x where (x ->> 'luas_m2')::numeric < 90000),
    'Syarat luas tidak boleh dilonggarkan untuk sekadar menampilkan hasil.';

  -- keyakinan data: hanya untuk ruang yang boleh tampil
  v := public.temukan_keyakinan(array[u.lahan_id, 'tidak-ada']);
  assert v ? u.lahan_id and not v ? 'tidak-ada' and v -> u.lahan_id ->> 'tingkat' in ('tinggi', 'sedang', 'rendah') and jsonb_array_length(v -> u.lahan_id -> 'butir') = 7,
    'Keyakinan data memakai tujuh butir yang sama dengan tim NFR.';

  -- pengelola SPBU tanpa akun: jenis usaha dan jumlah calon, tanpa profil calon
  assert public.temukan_peluang_spbu('tidak-ada') is null, 'SPBU yang tidak ada mengembalikan null.';
  v := public.temukan_peluang_spbu(u.spbu_id);
  assert not (v ->> 'berwenang')::boolean and jsonb_array_length(v -> 'ruang') between 1 and 6, 'Tanpa akun: tidak berwenang, paling banyak enam ruang.';
  assert not exists (select 1 from jsonb_array_elements(v -> 'ruang') r, jsonb_array_elements(r -> 'kategori') c where c -> 'calon' <> 'null'::jsonb),
    'Tanpa wewenang, profil calon tidak dikirim.';
  assert not exists (select 1 from jsonb_array_elements(v -> 'ruang') r, jsonb_array_elements(r -> 'kategori') c, jsonb_object_keys(c) k where k ~ 'tenant|kontrak|nama|tarif')
     and not exists (select 1 from jsonb_array_elements(v -> 'ruang') r, jsonb_object_keys(r) k where k ~ 'tenant|kontrak|tarif|harga'),
    'Hasil pengelola SPBU tidak boleh memuat nama penyewa, tarif, atau kontrak.';
  v := public.temukan_peluang_spbu(u.spbu_id, array[u.lahan_id]);
  assert jsonb_array_length(v -> 'ruang') = 1 and v -> 'ruang' -> 0 ->> 'lahan_id' = u.lahan_id, 'Daftar ruang bisa dipersempit.';

  -- mesin dan tabelnya tetap tertutup bagi pengunjung
  begin
    perform 1 from public.kecocokan(p_profil => '{"segmen":"F&B / Kuliner"}'::jsonb);
    assert false, 'Mesin kecocokan tidak boleh dipanggil langsung tanpa akun.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.temukan_ruang_tampil();
    assert false, 'Fungsi pembantu tidak boleh dipanggil langsung.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- ruang yang ditahan hilang dari hasil
insert into public.status_lahan (spbu_id, lahan_id, lahan_kode, status_ruang, alasan_ruang)
select spbu_id, lahan_id, kode, 'ditahan', 'Uji: ditahan sementara' from uji_b
on conflict (spbu_id, lahan_id) do update set status_ruang = 'ditahan', alasan_ruang = 'Uji: ditahan sementara';
set local role anon;
do $$
declare v jsonb; u record;
begin
  select * into u from uji_b;
  v := public.temukan_lokasi(jsonb_build_object('segmen', jsonb_build_array('F&B / Kuliner'), 'wilayah', jsonb_build_array(jsonb_build_object('provinsi', u.provinsi, 'kota', u.kota))));
  assert not exists (select 1 from jsonb_array_elements(v -> 'lokasi') x where x ->> 'lahan_id' = u.lahan_id) and (v ->> 'tertahan')::int >= 1,
    'Ruang yang ditahan tidak tampil dan dihitung sebagai tertahan.';
  assert not public.temukan_keyakinan(array[u.lahan_id]) ? u.lahan_id, 'Keyakinan data ruang yang ditahan tidak dibuka.';
  assert not exists (select 1 from jsonb_array_elements(public.temukan_peluang_spbu(u.spbu_id) -> 'ruang') r where r ->> 'lahan_id' = u.lahan_id),
    'Ruang yang ditahan tidak tampil bagi pengelola SPBU tanpa akun.';
end $$;
reset role;
delete from public.status_lahan s using uji_b u where s.spbu_id = u.spbu_id and s.lahan_id = u.lahan_id and s.alasan_ruang = 'Uji: ditahan sementara';

-- ---------------------------------------------------------------- pengelola yang wewenangnya tercatat
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000c1', 'dealer12a@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000c2', 'dealer12b@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-0000000000c1', 'Dealer Uji 12A', 'dealer', true),
  ('00000000-0000-4000-b000-0000000000c2', 'Dealer Uji 12B', 'dealer', true);
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-b000-0000000000c1', 'dealer_admin'),
  ('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-b000-0000000000c2', 'dealer_admin');
delete from public.hak_spbu h using uji_b u where h.spbu_id = u.spbu_id;
insert into public.hak_spbu (spbu_id, spbu_nomor, organisasi_dealer)
select u.spbu_id, s.nomor, '00000000-0000-4000-b000-0000000000c1' from uji_b u join public.spbu s on s.id = u.spbu_id;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","email":"dealer12a@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; u record;
begin
  select * into u from uji_b;
  v := public.temukan_peluang_spbu(u.spbu_id, array[u.lahan_id]);
  assert (v ->> 'berwenang')::boolean, 'Pengelola yang wewenangnya tercatat dikenali.';
  assert exists (select 1 from jsonb_array_elements(v -> 'ruang' -> 0 -> 'kategori') c where jsonb_typeof(c -> 'calon') = 'array' and jsonb_array_length(c -> 'calon') between 1 and 5),
    'Pengelola berwenang melihat paling banyak lima profil calon per jenis usaha.';
  assert (select array_agg(distinct k order by k) from jsonb_array_elements(v -> 'ruang' -> 0 -> 'kategori') c, jsonb_array_elements(c -> 'calon') x, jsonb_object_keys(x) k)
       = array['daya_ok', 'di_kota', 'di_provinsi', 'luas_ok', 'poin_harga', 'poin_jaringan', 'skala', 'skor', 'tarif_ok'],
    'Profil calon tanpa nama, tanpa id, tanpa nilai kontrak.';
  assert (select bool_and((c ->> 'jumlah_calon')::int >= jsonb_array_length(c -> 'calon')) from jsonb_array_elements(v -> 'ruang' -> 0 -> 'kategori') c), 'Jumlah calon konsisten.';
end $$;
reset role;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c2","email":"dealer12b@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; u record;
begin
  select * into u from uji_b;
  v := public.temukan_peluang_spbu(u.spbu_id, array[u.lahan_id]);
  assert not (v ->> 'berwenang')::boolean
     and not exists (select 1 from jsonb_array_elements(v -> 'ruang' -> 0 -> 'kategori') c where c -> 'calon' <> 'null'::jsonb),
    'Pengelola SPBU lain tidak melihat profil calon untuk SPBU ini.';
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji rekomendasi Temukan peluang (syarat wajib, wilayah, ruang ditahan, tanpa nama penyewa, profil calon hanya bagi yang berwenang).'
