-- Uji otomatis sesi Temukan peluang: kunci sesi, batas isi, pemisahan antar pemegang kunci, dan data umum
-- yang tidak membocorkan tarif, penyewa, atau ruang tersewa. Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values ('00000000-0000-4000-a000-000000000091', 'dealer9@uji.invalid');

-- ---------------------------------------------------------------- pengunjung tanpa akun
set local role anon;
do $$
declare
  v        jsonb;
  k_a      constant text := 'A' || repeat('a', 42);
  k_b      constant text := 'B' || repeat('b', 42);
  v_spbu   text;
  v_nomor  text;
begin
  -- kunci dan isi yang tidak sah ditolak tanpa menulis apa pun
  v := public.temukan_simpan('pendek', 'tenant', '2026.11', 'usaha', '{}'::jsonb);
  assert not (v ->> 'ok')::boolean and v ->> 'kode' = 'token', 'Kunci sesi yang terlalu pendek harus ditolak.';
  v := public.temukan_simpan(k_a, 'nfr', '2026.11', 'usaha', '{}'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Peran selain tenant dan dealer harus ditolak.';
  v := public.temukan_simpan(k_a, 'tenant', '2026.11', 'DROP TABLE', '{}'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Nama langkah yang tidak sah harus ditolak.';
  v := public.temukan_simpan(k_a, 'tenant', '2026.11', 'usaha', '[1,2]'::jsonb);
  assert not (v ->> 'ok')::boolean, 'Jawaban yang bukan objek harus ditolak.';
  v := public.temukan_simpan(k_a, 'tenant', '2026.11', 'usaha', jsonb_build_object('x', repeat('y', 13000)));
  assert not (v ->> 'ok')::boolean, 'Jawaban yang terlalu besar harus ditolak.';
  v := public.temukan_simpan(k_a, 'tenant', '2026.11', 'usaha', '{}'::jsonb, array['ok', 'Tidak Sah']);
  assert not (v ->> 'ok')::boolean, 'Daftar langkah dilewati yang tidak sah harus ditolak.';
  assert jsonb_array_length(public.temukan_sesi(k_a)) = 0, 'Penolakan tidak boleh meninggalkan sesi.';

  -- membuat, menimpa, dan menyelesaikan
  v := public.temukan_simpan(k_a, 'tenant', '2026.11', 'usaha', '{"usaha":["fnb"]}'::jsonb);
  assert (v ->> 'ok')::boolean and (v ->> 'baru')::boolean, 'Simpanan pertama membuat sesi.';
  v := public.temukan_simpan(k_a, 'tenant', '2026.11', 'wilayah', '{"usaha":["fnb"],"wilayah":{"terbuka":true}}'::jsonb, array['pelanggan']);
  assert (v ->> 'ok')::boolean and not (v ->> 'baru')::boolean, 'Simpanan berikutnya menimpa sesi yang sama.';
  v := public.temukan_sesi(k_a);
  assert jsonb_array_length(v) = 1 and v -> 0 ->> 'langkah' = 'wilayah' and v -> 0 ->> 'status' = 'berjalan'
     and v -> 0 -> 'jawaban' -> 'wilayah' ->> 'terbuka' = 'true' and v -> 0 -> 'dilewati' ->> 0 = 'pelanggan',
    'Sesi terbaca utuh oleh pemegang kuncinya.';
  v := public.temukan_simpan(k_a, 'tenant', '2026.11', 'wilayah', '{"usaha":["fnb"]}'::jsonb, '{}', true);
  assert public.temukan_sesi(k_a) -> 0 ->> 'status' = 'selesai', 'Sesi bisa ditandai selesai.';
  v := public.temukan_simpan(k_a, 'tenant', '2026.11', 'usaha', '{"usaha":["ritel"]}'::jsonb);
  assert public.temukan_sesi(k_a) -> 0 ->> 'status' = 'berjalan', 'Mengubah jawaban membuka kembali sesi.';

  -- satu kunci, dua peran; kunci lain tidak melihat apa pun
  v := public.temukan_simpan(k_a, 'dealer', '2026.11', 'spbu', '{}'::jsonb);
  assert jsonb_array_length(public.temukan_sesi(k_a)) = 2, 'Satu pemegang kunci boleh punya sesi tenant dan dealer.';
  assert jsonb_array_length(public.temukan_sesi(k_b)) = 0, 'Kunci lain tidak boleh membaca sesi ini.';
  v := public.temukan_hapus(k_b);
  assert (v ->> 'dihapus')::int = 0 and jsonb_array_length(public.temukan_sesi(k_a)) = 2, 'Kunci lain tidak boleh menghapus sesi ini.';

  -- tabelnya tertutup, dan memilih peran dealer tidak memberi hak dealer
  begin
    perform 1 from public.sesi_temukan;
    assert false, 'Tabel sesi tidak boleh bisa dibaca langsung.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.dealer_ringkasan();
    assert false, 'Pengunjung yang memilih peran dealer tidak boleh memanggil fungsi dealer.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.tenant_minati('x', null);
    assert false, 'Pengunjung tanpa akun tidak boleh menyatakan minat resmi.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.lahan limit 1;
    assert false, 'Pengunjung tanpa akun tidak boleh membaca tabel lahan.';
  exception when insufficient_privilege then null;
  end;

  -- mulai ulang
  v := public.temukan_hapus(k_a, 'dealer');
  assert (v ->> 'dihapus')::int = 1 and jsonb_array_length(public.temukan_sesi(k_a)) = 1, 'Mulai ulang menghapus satu peran saja.';

  -- data umum
  v := public.temukan_wilayah();
  assert jsonb_array_length(v) > 0 and v -> 0 ? 'provinsi' and v -> 0 ? 'kota' and (select count(*) from jsonb_object_keys(v -> 0)) = 2,
    'Daftar wilayah hanya memuat provinsi dan kota.';
  assert jsonb_array_length(public.temukan_cari_spbu('ab')) = 0, 'Pencarian di bawah tiga huruf tidak mengembalikan apa pun.';
  assert jsonb_array_length(public.temukan_cari_spbu('%%%')) = 0, 'Tanda persen tidak boleh berlaku sebagai pola.';
  v := public.temukan_cari_spbu('jakarta');
  assert jsonb_array_length(v) between 1 and 8, 'Pencarian mengembalikan paling banyak delapan SPBU.';
  assert (select array_agg(x order by x) from jsonb_object_keys(v -> 0) x) = array['alamat', 'id', 'kota', 'nomor', 'provinsi'],
    'Hasil pencarian hanya memuat alamat SPBU.';
  v_spbu := v -> 0 ->> 'id';
  v_nomor := v -> 0 ->> 'nomor';
  assert public.temukan_cari_spbu(left(v_nomor, 4)) -> 0 ->> 'nomor' like left(v_nomor, 4) || '%', 'Awalan nomor didahulukan.';
  assert public.temukan_spbu('tidak-ada') is null, 'SPBU yang tidak ada mengembalikan null.';
  v := public.temukan_spbu(v_spbu);
  assert v ->> 'nomor' = v_nomor and jsonb_typeof(v -> 'ruang') = 'array', 'Rincian SPBU memuat daftar ruangnya.';
  assert v::text !~* 'tarif|harga|tenant|kontrak|penyewa', 'Rincian SPBU untuk umum tidak boleh memuat tarif, penyewa, atau kontrak.';
end $$;
reset role;

-- Ruang yang tampil untuk umum hanya yang kosong, tidak ganda, dan tidak ditahan.
do $$
declare v_spbu text; v jsonb;
begin
  select l.spbu_id into v_spbu from public.lahan l
  where l.status = 'Tersedia' and not l.duplikat
    and exists (select 1 from public.lahan t where t.spbu_id = l.spbu_id and t.status = 'Tersewa')
  limit 1;
  assert v_spbu is not null, 'Butuh satu SPBU yang punya ruang kosong dan ruang tersewa.';
  set local role anon;
  v := public.temukan_spbu(v_spbu);
  reset role;
  assert jsonb_array_length(v -> 'ruang') > 0, 'Ruang kosong harus tampil.';
  assert not exists (
    select 1 from jsonb_array_elements(v -> 'ruang') r
    join public.lahan l on l.spbu_id = v_spbu and l.lahan_id = r ->> 'lahan_id'
    where l.status <> 'Tersedia'), 'Ruang tersewa tidak boleh tampil untuk umum.';
  assert jsonb_array_length(v -> 'ruang') <= (select count(*) from public.lahan l where l.spbu_id = v_spbu and l.status = 'Tersedia' and not l.duplikat),
    'Jumlah ruang tidak boleh melebihi ruang kosong yang tercatat.';
  assert (select array_agg(x order by x) from jsonb_object_keys(v -> 'ruang' -> 0) x)
       = array['daya_w', 'kode', 'lahan_id', 'lantai', 'luas_m2', 'posisi', 'terverifikasi'], 'Kolom ruang untuk umum terbatas.';
end $$;

-- ---------------------------------------------------------------- pengguna yang sudah masuk
do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000091","email":"dealer9@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb; k constant text := 'C' || repeat('c', 42);
begin
  v := public.temukan_simpan(k, 'dealer', '2026.11', 'spbu', '{}'::jsonb);
  assert (v ->> 'ok')::boolean, 'Pengguna yang masuk juga bisa menyimpan sesi.';
  begin
    perform 1 from public.sesi_temukan;
    assert false, 'Pengguna yang masuk pun tidak boleh membaca tabel sesi langsung.';
  exception when insufficient_privilege then null;
  end;
  -- memilih peran dealer di kuesioner tidak menjadikan akun ini pengelola SPBU mana pun
  assert jsonb_array_length(public.dealer_ringkasan() -> 'spbu') = 0, 'Peran di kuesioner tidak memberi wewenang atas SPBU.';
end $$;
reset role;

do $$
begin
  assert (select user_id from public.sesi_temukan where token_hash = public.temukan_sidik('C' || repeat('c', 42))) is null,
    'Akun tanpa organisasi tenant atau dealer tetap memakai sesi cookie, bukan preferensi akun.';
  assert (select user_id from public.sesi_temukan where token_hash = public.temukan_sidik('A' || repeat('a', 42))) is null,
    'Sesi pengunjung tanpa akun tidak punya pemilik akun.';
  assert not exists (select 1 from public.sesi_temukan where token_hash like 'A%' or token_hash like 'C%' or length(token_hash) <> 64),
    'Yang disimpan adalah sidik kunci, bukan kuncinya.';

  -- rem per sesi dan pembersihan sesi kedaluwarsa
  update public.sesi_temukan set simpanan = 500 where token_hash = public.temukan_sidik('A' || repeat('a', 42));
  assert public.temukan_simpan('A' || repeat('a', 42), 'tenant', '2026.11', 'usaha', '{}'::jsonb) ->> 'kode' = 'batas', 'Sesi yang ditulis 500 kali berhenti menerima tulisan.';
  update public.sesi_temukan set kedaluwarsa = now() - interval '1 day' where token_hash = public.temukan_sidik('A' || repeat('a', 42));
  assert jsonb_array_length(public.temukan_sesi('A' || repeat('a', 42))) = 0, 'Sesi kedaluwarsa tidak terbaca lagi.';
  perform public.temukan_simpan('D' || repeat('d', 42), 'tenant', '2026.11', 'usaha', '{}'::jsonb);
  assert not exists (select 1 from public.sesi_temukan where kedaluwarsa < now()), 'Sesi kedaluwarsa dihapus saat sesi baru dibuat.';

  -- rem pembuatan sesi beruntun
  insert into public.sesi_temukan (token_hash, peran, versi_kuesioner)
  select public.temukan_sidik('E' || lpad(i::text, 42, '0')), 'tenant', '2026.11' from generate_series(1, 600) i;
  assert public.temukan_simpan('F' || repeat('f', 42), 'tenant', '2026.11', 'usaha', '{}'::jsonb) ->> 'kode' = 'ramai', 'Pembuatan sesi direm di 600 per jam.';
  assert (public.temukan_simpan('D' || repeat('d', 42), 'tenant', '2026.11', 'wilayah', '{}'::jsonb) ->> 'ok')::boolean, 'Rem itu tidak menghalangi sesi yang sudah ada.';
end $$;

rollback;
\echo 'LULUS: semua uji sesi Temukan peluang (kunci, batas isi, pemisahan sesi, peran bukan hak, data umum tanpa tarif dan penyewa).'
