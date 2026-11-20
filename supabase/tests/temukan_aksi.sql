-- Uji otomatis tindakan Temukan peluang (fase C): preferensi per akun, pengambilalihan sesi saat masuk,
-- minat tenant, ketertarikan pengelola SPBU, penerusan minat calon dari formulir, dan tampilan tim NFR.
-- Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
set idle_in_transaction_session_timeout = '90s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000d1', 'tenant13a@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000d2', 'tenant13b@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000d3', 'dealer13a@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000d4', 'dealer13b@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000d5', 'analis13@uji.invalid'),
  ('00000000-0000-4000-a000-0000000000d6', 'tanpaorg13@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values
  ('00000000-0000-4000-b000-0000000000d1', 'Tenant Uji 13A', 'tenant', true),
  ('00000000-0000-4000-b000-0000000000d2', 'Tenant Uji 13B', 'tenant', true),
  ('00000000-0000-4000-b000-0000000000d3', 'Dealer Uji 13A', 'dealer', true),
  ('00000000-0000-4000-b000-0000000000d4', 'Dealer Uji 13B', 'dealer', true);
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-0000000000d1', '00000000-0000-4000-b000-0000000000d1', 'tenant_admin'),
  ('00000000-0000-4000-a000-0000000000d2', '00000000-0000-4000-b000-0000000000d2', 'tenant_perwakilan'),
  ('00000000-0000-4000-a000-0000000000d3', '00000000-0000-4000-b000-0000000000d3', 'dealer_admin'),
  ('00000000-0000-4000-a000-0000000000d4', '00000000-0000-4000-b000-0000000000d4', 'dealer_admin');
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-0000000000d5', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';

-- Dua ruang yang boleh tampil di satu SPBU; SPBU itu dikelola Dealer 13A.
create temporary table uji_c on commit drop as
select r.lahan_id, r.spbu_id, l.kode, row_number() over (order by l.kode) as urut
from public.temukan_ruang_tampil() r
join public.lahan l on l.spbu_id = r.spbu_id and l.lahan_id = r.lahan_id and not l.duplikat
where r.spbu_id = (select x.spbu_id from public.temukan_ruang_tampil() x group by x.spbu_id having count(*) >= 2 order by x.spbu_id limit 1)
order by l.kode limit 2;
grant select on uji_c to anon, authenticated;
delete from public.hak_spbu h using uji_c u where h.spbu_id = u.spbu_id;
insert into public.hak_spbu (spbu_id, spbu_nomor, organisasi_dealer)
select distinct u.spbu_id, s.nomor, '00000000-0000-4000-b000-0000000000d3'::uuid from uji_c u join public.spbu s on s.id = u.spbu_id;
delete from public.minat_lokasi m using uji_c u where m.lahan_id = u.lahan_id;

create function pg_temp.sebagai(p_sub text, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims', case when p_sub is null then '' else json_build_object('sub', p_sub, 'email', p_email, 'role', 'authenticated')::text end, true)
$$;

-- ---------------------------------------------------------------- preferensi per akun
do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d1', 'tenant13a@uji.invalid'); end $_$;
set local role authenticated;
do $$
declare v jsonb; k constant text := 'K' || repeat('k', 42);
begin
  v := public.temukan_simpan(null, 'tenant', '2026.11', 'usaha', '{"usaha":["fnb"]}'::jsonb);
  assert (v ->> 'ok')::boolean and (v ->> 'akun')::boolean, 'Akun tenant menyimpan pencarian lokasi atas akunnya, tanpa kunci cookie.';
  v := public.temukan_sesi(null);
  assert jsonb_array_length(v) = 1 and (v -> 0 ->> 'akun')::boolean and v -> 0 -> 'jawaban' -> 'usaha' ->> 0 = 'fnb', 'Preferensi akun terbaca tanpa cookie.';
  v := public.temukan_simpan(k, 'dealer', '2026.11', 'spbu', '{}'::jsonb);
  assert (v ->> 'ok')::boolean and not (v ->> 'akun')::boolean, 'Peran yang bukan milik akun tetap disimpan sebagai sesi cookie.';
  assert public.temukan_simpan(null, 'dealer', '2026.11', 'spbu', '{}'::jsonb) ->> 'kode' = 'token', 'Sesi cookie tetap butuh kunci yang sah.';
  assert jsonb_array_length(public.temukan_sesi(k)) = 2, 'Akun melihat preferensi akunnya dan sesi cookie untuk peran lain.';
end $$;
reset role;

do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d2', 'tenant13b@uji.invalid'); end $_$;
set local role authenticated;
do $$ begin
  assert jsonb_array_length(public.temukan_sesi(null)) = 0, 'Akun lain tidak melihat preferensi akun ini.';
end $$;
reset role;

-- ---------------------------------------------------------------- pengambilalihan sesi saat masuk
do $_$ begin perform pg_temp.sebagai(null, null); end $_$;
set local role anon;
do $$
declare v jsonb;
begin
  v := public.temukan_simpan('M' || repeat('m', 42), 'tenant', '2026.11', 'wilayah', '{"usaha":["ritel"]}'::jsonb);
  assert (v ->> 'ok')::boolean and not (v ->> 'akun')::boolean, 'Pengunjung tanpa akun memakai sesi cookie.';
  v := public.temukan_simpan('M' || repeat('m', 42), 'dealer', '2026.11', 'spbu', '{}'::jsonb);
  begin
    perform public.temukan_klaim('M' || repeat('m', 42));
    assert false, 'Pengambilalihan sesi hanya untuk pengguna yang masuk.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d6', 'tanpaorg13@uji.invalid'); end $_$;
set local role authenticated;
do $$ begin
  assert not (public.temukan_klaim('M' || repeat('m', 42)) ->> 'diklaim')::boolean, 'Akun tanpa organisasi tidak mengambil alih sesi.';
end $$;
reset role;

do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d1', 'tenant13a@uji.invalid'); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  assert not (public.temukan_klaim('M' || repeat('m', 42)) ->> 'diklaim')::boolean, 'Akun yang sudah punya preferensi tidak ditimpa sesi cookie.';
  assert public.temukan_sesi('M' || repeat('m', 42)) -> 1 -> 'jawaban' -> 'usaha' ->> 0 = 'fnb', 'Preferensi akun tetap yang lama.';
end $$;
reset role;

do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d2', 'tenant13b@uji.invalid'); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  v := public.temukan_klaim('M' || repeat('m', 42));
  assert (v ->> 'diklaim')::boolean and v ->> 'peran' = 'tenant', 'Akun tenant tanpa preferensi mengambil alih sesi pencarian lokasinya.';
  v := public.temukan_sesi(null);
  assert jsonb_array_length(v) = 1 and (v -> 0 ->> 'akun')::boolean and v -> 0 -> 'jawaban' -> 'usaha' ->> 0 = 'ritel', 'Jawaban sebelum masuk kini menjadi preferensi akun.';
  assert not (public.temukan_klaim('M' || repeat('m', 42)) ->> 'diklaim')::boolean, 'Pengambilalihan tidak berulang.';
end $$;
reset role;

do $_$ begin perform pg_temp.sebagai(null, null); end $_$;
set local role anon;
do $$
declare v jsonb;
begin
  v := public.temukan_sesi('M' || repeat('m', 42));
  assert jsonb_array_length(v) = 1 and v -> 0 ->> 'peran' = 'dealer', 'Setelah diambil alih, pemegang cookie tidak lagi membaca jawaban itu; sesi peran lain tidak ikut.';
end $$;
reset role;

do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d2', 'tenant13b@uji.invalid'); end $_$;
set local role authenticated;
do $$ begin
  assert (public.temukan_hapus(null, 'tenant') ->> 'dihapus')::int = 1, 'Mulai ulang menghapus preferensi akun.';
  assert jsonb_array_length(public.temukan_sesi(null)) = 0, 'Setelah dihapus, akun tidak punya preferensi lagi.';
end $$;
reset role;

-- ---------------------------------------------------------------- minat tenant dari rekomendasi
do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d1', 'tenant13a@uji.invalid'); end $_$;
set local role authenticated;
do $$
declare v jsonb; a text; b text;
begin
  select lahan_id into a from uji_c where urut = 1;
  select lahan_id into b from uji_c where urut = 2;
  v := public.temukan_minati(a, '  Ingin survei bulan depan  ',
         '{"skor":"88","preferensi":"140","versi_model":"2","versi_preferensi":"p1","alasan":["satu","dua","tiga","empat"],"jahat":"<script>","preferensi_ringkas":["F&B"]}'::jsonb);
  assert (v ->> 'ok')::boolean, 'Tenant berakun bisa menyatakan minat pada lokasi yang boleh tampil.';
  assert public.temukan_minati(a) ->> 'kode' = 'sudah', 'Minat yang sama tidak dicatat dua kali.';
  assert public.temukan_minati('tidak-ada') ->> 'kode' = 'hilang', 'Lokasi yang tidak tampil tidak bisa diminati.';
  assert (public.temukan_minati(b) ->> 'ok')::boolean, 'Minat tanpa catatan dan tanpa potret tetap diterima.';
  v := public.temukan_minat_saya();
  assert jsonb_array_length(v) = 2 and v -> 0 ->> 'status' = 'baru', 'Minat sendiri terbaca untuk menandai kartu.';
  assert (select count(*) from public.minat_lokasi) = 0, 'Tabel minat tertutup bagi tenant: hanya tim NFR yang membacanya langsung.';
  assert public.temukan_minati_usaha((select spbu_id from uji_c limit 1), a, 'F&B / Kuliner') ->> 'kode' = 'wewenang', 'Tenant tidak bisa mengajukan ketertarikan sebagai pengelola SPBU.';
end $$;
reset role;

do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d2', 'tenant13b@uji.invalid'); end $_$;
set local role authenticated;
do $$ begin
  assert jsonb_array_length(public.temukan_minat_saya()) = 0, 'Tenant lain tidak melihat minat ini.';
end $$;
reset role;

do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d6', 'tanpaorg13@uji.invalid'); end $_$;
set local role authenticated;
do $$ begin
  assert public.temukan_minati((select lahan_id from uji_c where urut = 1)) ->> 'kode' = 'akun', 'Akun tanpa organisasi tenant tidak bisa menyatakan minat resmi.';
end $$;
reset role;

-- ---------------------------------------------------------------- ketertarikan pengelola SPBU
do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d3', 'dealer13a@uji.invalid'); end $_$;
set local role authenticated;
do $$
declare v jsonb; a text; sp text;
begin
  select lahan_id, spbu_id into a, sp from uji_c where urut = 1;
  v := public.temukan_minati_usaha(sp, a, 'F&B / Kuliner', 'Dekat pintu keluar', '{"skor":"80"}'::jsonb);
  assert (v ->> 'ok')::boolean, 'Pengelola berwenang bisa mengajukan ketertarikan pada satu jenis usaha.';
  assert public.temukan_minati_usaha(sp, a, 'F&B / Kuliner') ->> 'kode' = 'sudah', 'Ketertarikan yang sama tidak dicatat dua kali.';
  assert (public.temukan_minati_usaha(sp, a, 'Perbankan & ATM') ->> 'ok')::boolean, 'Jenis usaha lain untuk ruang yang sama boleh.';
  assert public.temukan_minati_usaha(sp, a, 'Lainnya') ->> 'kode' = 'isi' and public.temukan_minati_usaha(sp, a, 'Karangan') ->> 'kode' = 'isi', 'Jenis usaha harus dikenal.';
  assert public.temukan_minati_usaha(sp, 'tidak-ada', 'F&B / Kuliner') ->> 'kode' = 'hilang', 'Ruang harus masih boleh tampil.';
  assert public.temukan_minati(a) ->> 'kode' = 'akun', 'Pengelola SPBU tidak bisa menyatakan minat sebagai tenant.';
  assert jsonb_array_length(public.temukan_minat_saya()) = 2, 'Ketertarikan sendiri terbaca.';
end $$;
reset role;

do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d4', 'dealer13b@uji.invalid'); end $_$;
set local role authenticated;
do $$ begin
  assert public.temukan_minati_usaha((select spbu_id from uji_c limit 1), (select lahan_id from uji_c where urut = 1), 'F&B / Kuliner') ->> 'kode' = 'wewenang',
    'Pengelola SPBU lain tidak bisa mengajukan ketertarikan untuk SPBU ini.';
end $$;
reset role;

-- ---------------------------------------------------------------- pengunjung tanpa akun: tandai, lalu teruskan lewat formulir
do $_$ begin perform pg_temp.sebagai(null, null); end $_$;
set local role anon;
do $$
declare v jsonb; a text; k constant text := 'S' || repeat('s', 42); t uuid;
begin
  select lahan_id into a from uji_c where urut = 2;
  begin
    perform public.temukan_minati(a);
    assert false, 'Pengunjung tanpa akun tidak boleh menyatakan minat resmi.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.temukan_minati_usaha('x', a, 'F&B / Kuliner');
    assert false, 'Pengunjung tanpa akun tidak boleh mengajukan ketertarikan pengelola.';
  exception when insufficient_privilege then null;
  end;
  assert not (public.temukan_tandai(k, '[]'::jsonb) ->> 'ok')::boolean, 'Menandai butuh sesi pencarian lokasi.';
  perform public.temukan_simpan(k, 'tenant', '2026.11', 'usaha', '{"usaha":["fnb"]}'::jsonb);
  assert not (public.temukan_tandai(k, (select jsonb_agg(jsonb_build_object('lahan_id', i::text)) from generate_series(1, 11) i)) ->> 'ok')::boolean, 'Paling banyak sepuluh lokasi.';
  v := public.temukan_tandai(k, jsonb_build_array(
         jsonb_build_object('lahan_id', a, 'kode', 'KODE-PALSU', 'spbu_nomor', '000', 'potret', '{"skor":"91","rahasia":"x"}'::jsonb),
         jsonb_build_object('lahan_id', 'tidak-ada', 'kode', 'X'), 'bukan objek'));
  assert (v ->> 'ok')::boolean and (v ->> 'jumlah')::int = 2, 'Daftar yang ditandai tersimpan di sesi.';
  assert jsonb_array_length(public.temukan_sesi(k) -> 0 -> 'diminati') = 2 and not (public.temukan_sesi(k) -> 0 -> 'diminati' -> 0 -> 'potret') ? 'rahasia', 'Potret dibersihkan saat disimpan.';

  assert (public.temukan_serahkan(k, gen_random_uuid()) ->> 'jumlah')::int = 0, 'Tanpa pendaftaran yang cocok, tidak ada yang diteruskan.';
  t := (public.daftar_calon('{"nama_usaha":"Kedai Uji 13","segmen":"F&B / Kuliner","kontak_nama":"Uji","kontak_email":"uji13@uji.invalid"}'::jsonb) ->> 'token')::uuid;
  v := public.temukan_serahkan(k, t);
  assert (v ->> 'jumlah')::int = 1, 'Hanya lokasi yang masih boleh tampil yang diteruskan.';
  assert jsonb_array_length(public.temukan_sesi(k) -> 0 -> 'diminati') = 0, 'Daftar dikosongkan setelah diteruskan.';
  assert (public.temukan_serahkan(k, t) ->> 'jumlah')::int = 0, 'Penerusan tidak berulang.';
end $$;
reset role;

do $$
declare m public.minat_lokasi; u record;
begin
  select * into u from uji_c where urut = 2;
  select * into m from public.minat_lokasi where sumber = 'formulir' and lahan_id = u.lahan_id;
  assert m.calon_id = (select id from public.calon_tenant where nama_usaha = 'Kedai Uji 13') and m.organisasi_id is null, 'Minat dari formulir tercatat atas calon tenant, bukan organisasi.';
  assert m.lahan_kode = u.kode, 'Kode ruang diambil dari basis data, bukan dari kiriman peramban.';
  assert m.potret = '{"skor":91}'::jsonb, 'Potret yang tersimpan hanya memuat kolom yang dikenal.';
  select * into m from public.minat_lokasi where sumber = 'temukan' and lahan_id = (select lahan_id from uji_c where urut = 1);
  assert m.catatan = 'Ingin survei bulan depan' and m.potret ->> 'skor' = '88' and not m.potret ? 'preferensi' and not m.potret ? 'jahat'
     and jsonb_array_length(m.potret -> 'alasan') = 3, 'Potret minat tenant dibersihkan: angka di luar batas dan kolom asing dibuang, alasan paling banyak tiga.';
  assert (select count(*) from public.audit_peristiwa where peristiwa in ('minat_lokasi_dicatat', 'minat_usaha_dicatat', 'minat_lokasi_dari_formulir')
          and (entitas_id in (select lahan_id from uji_c) or entitas_id = m.calon_id::text or entitas = 'calon_tenant')) >= 5, 'Tiap minat meninggalkan jejak audit.';
  begin
    insert into public.minat_lokasi (spbu_id, lahan_id, lahan_kode, spbu_nomor) values ('x', 'x', 'x', 'x');
    assert false, 'Minat harus punya tepat satu pihak.';
  exception when check_violation then null;
  end;

  -- pendaftaran yang sudah lama tidak bisa ditempeli minat
  update public.calon_tenant set dibuat = now() - interval '1 hour' where nama_usaha = 'Kedai Uji 13';
  update public.sesi_temukan set diminati = jsonb_build_array(jsonb_build_object('lahan_id', (select lahan_id from uji_c where urut = 1)))
  where token_hash = public.temukan_sidik('S' || repeat('s', 42));
  assert (public.temukan_serahkan('S' || repeat('s', 42), (select token from public.calon_tenant where nama_usaha = 'Kedai Uji 13')) ->> 'jumlah')::int = 0,
    'Minat hanya diteruskan ke pendaftaran yang baru dibuat.';
end $$;

-- ---------------------------------------------------------------- tim NFR: satu kotak kerja untuk semua asal
do $_$ begin perform pg_temp.sebagai('00000000-0000-4000-a000-0000000000d5', 'analis13@uji.invalid'); end $_$;
set local role authenticated;
do $$
declare v jsonb; x jsonb;
begin
  select coalesce(jsonb_agg(m), '[]'::jsonb) into v from jsonb_array_elements(public.minat_daftar('baru')) m where m ->> 'lahan_id' in (select lahan_id from uji_c);
  assert jsonb_array_length(v) = 5, format('Lima minat uji harus tampil untuk tim NFR, tampil %s.', jsonb_array_length(v));
  assert (select array_agg(distinct m ->> 'sumber' order by m ->> 'sumber') from jsonb_array_elements(v) m) = array['formulir', 'pengelola', 'temukan'], 'Asal minat ikut tampil.';
  select m into x from jsonb_array_elements(v) m where m ->> 'sumber' = 'formulir';
  assert x ->> 'organisasi' = 'Kedai Uji 13' and x ->> 'calon_id' is not null and x ->> 'organisasi_id' is null, 'Minat calon tampil dengan nama usahanya dan tautan ke calonnya.';
  assert (select count(*) from jsonb_array_elements(v) m where m ->> 'sumber' = 'pengelola' and m ->> 'segmen' in ('F&B / Kuliner', 'Perbankan & ATM') and m ->> 'organisasi' = 'Dealer Uji 13A') = 2,
    'Ketertarikan pengelola tampil dengan jenis usahanya.';
  assert (public.minat_tangani((x ->> 'id')::uuid, 'ditindaklanjuti') ->> 'ok')::boolean, 'Minat calon ditindaklanjuti dengan alur yang sama.';
  assert jsonb_array_length(public.temukan_sesi(null)) = 0 and jsonb_array_length(public.temukan_minat_saya()) = 0, 'Akun NFR tidak punya preferensi atau minat sendiri.';
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji tindakan Temukan peluang (preferensi akun, ambil alih sesi, minat tenant, ketertarikan pengelola, minat dari formulir, kotak kerja NFR).'
