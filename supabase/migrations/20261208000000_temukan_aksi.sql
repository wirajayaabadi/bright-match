-- Temukan peluang, fase C: tindakan dari rekomendasi.
-- 1. Preferensi per akun. Akun tenant dan akun pengelola SPBU menyimpan jawabannya atas akunnya (terbaca di
--    perangkat mana pun), bukan atas cookie. Sesi tanpa akun yang dibuat sebelum masuk diambil alih saat masuk.
-- 2. Minat tetap satu pintu: tabel minat_lokasi dan halaman Minat lokasi tim NFR yang sudah ada. Yang bertambah
--    hanya asalnya: tenant dari rekomendasi, calon tenant dari formulir "Jadi Bright Partner", dan pengelola SPBU
--    yang berminat menghadirkan satu jenis usaha. Minat tidak mengikat dan tidak membuat peluang; peluang tetap
--    dibuat tim NFR dari kartu lahan atau halaman calon tenant.
-- 3. Tindakan resmi butuh hak yang nyata: keanggotaan organisasi tenant, atau wewenang atas SPBU (hak_spbu).
--    Peran yang dipilih di kuesioner tidak pernah cukup.
-- 4. Potret rekomendasi (skor dan alasan yang dilihat saat minat dinyatakan) disimpan bersama minatnya sebagai
--    keterangan. Ia dikirim aplikasi, jadi dibersihkan di sini dan tidak dipakai untuk keputusan: skor resmi
--    dihitung ulang saat peluang dibuat.

-- ================================================================ preferensi per akun

alter table public.sesi_temukan
  add column diminati jsonb not null default '[]'::jsonb check (jsonb_typeof(diminati) = 'array');
-- Baris akun: user_id terisi, token_hash = 'akun:<user_id>', tidak kedaluwarsa. Baris tanpa akun: user_id kosong.
update public.sesi_temukan set user_id = null where token_hash not like 'akun:%';
create unique index sesi_temukan_akun_idx on public.sesi_temukan (user_id, peran) where user_id is not null;
comment on column public.sesi_temukan.diminati is 'Lokasi yang ditandai pengunjung tanpa akun untuk diteruskan saat mendaftar sebagai Bright Partner.';

-- Peran yang boleh disimpan atas akun: mengikuti keanggotaan organisasi, bukan pilihan di kuesioner.
create function public.temukan_peran_akun() returns text
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null
              when public.organisasi_tenant_saya() is not null then 'tenant'
              when public.adalah_dealer() then 'dealer' end
$$;
revoke execute on function public.temukan_peran_akun() from public, anon, authenticated;

create or replace function public.temukan_simpan(
  p_token text, p_peran text, p_versi text, p_langkah text, p_jawaban jsonb, p_dilewati text[] default '{}', p_selesai boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sidik     text;
  v_dilewati  text[] := coalesce(p_dilewati, '{}');
  v_akun      boolean := coalesce(public.temukan_peran_akun() = p_peran, false);
  s           public.sesi_temukan;
begin
  if not v_akun and not public.temukan_token_sah(p_token) then
    return jsonb_build_object('ok', false, 'kode', 'token', 'pesan', 'Sesi tidak dikenal.');
  end if;
  if p_peran is null or p_peran not in ('tenant', 'dealer') then
    return jsonb_build_object('ok', false, 'kode', 'isi', 'pesan', 'Peran tidak dikenal.');
  end if;
  if p_versi is null or p_versi !~ '^[0-9a-z.-]{1,24}$' or (p_langkah is not null and p_langkah !~ '^[a-z0-9_]{1,40}$') then
    return jsonb_build_object('ok', false, 'kode', 'isi', 'pesan', 'Kuesioner tidak dikenal.');
  end if;
  if p_jawaban is null or jsonb_typeof(p_jawaban) <> 'object' or octet_length(p_jawaban::text) > 12000 then
    return jsonb_build_object('ok', false, 'kode', 'isi', 'pesan', 'Jawaban tidak bisa disimpan.');
  end if;
  if cardinality(v_dilewati) > 40 or exists (select 1 from unnest(v_dilewati) x where x is null or x !~ '^[a-z0-9_]{1,40}$') then
    return jsonb_build_object('ok', false, 'kode', 'isi', 'pesan', 'Jawaban tidak bisa disimpan.');
  end if;

  if v_akun then
    select * into s from public.sesi_temukan where user_id = auth.uid() and peran = p_peran for update;
  else
    v_sidik := public.temukan_sidik(p_token);
    select * into s from public.sesi_temukan where token_hash = v_sidik and peran = p_peran and user_id is null for update;
  end if;

  if s.id is null then
    -- Rem terhadap pembuatan sesi beruntun, sama sifatnya dengan rem formulir "Jadi Bright Partner".
    if not v_akun and (select count(*) from public.sesi_temukan where dibuat > now() - interval '1 hour' and user_id is null) >= 600 then
      return jsonb_build_object('ok', false, 'kode', 'ramai', 'pesan', 'Penyimpanan sedang ramai. Jawaban Anda tetap bisa dilanjutkan di halaman ini.');
    end if;
    delete from public.sesi_temukan where kedaluwarsa < now();
    insert into public.sesi_temukan (token_hash, peran, user_id, versi_kuesioner, langkah, status, jawaban, dilewati, simpanan, selesai, kedaluwarsa)
    values (case when v_akun then 'akun:' || auth.uid()::text else v_sidik end, p_peran, case when v_akun then auth.uid() end,
            p_versi, p_langkah, case when p_selesai then 'selesai' else 'berjalan' end,
            p_jawaban, v_dilewati, 1, case when p_selesai then now() end,
            case when v_akun then 'infinity'::timestamptz else now() + interval '30 days' end);
    return jsonb_build_object('ok', true, 'baru', true, 'akun', v_akun);
  end if;

  if s.simpanan >= (case when v_akun then 5000 else 500 end) then
    return jsonb_build_object('ok', false, 'kode', 'batas', 'pesan', 'Sesi ini sudah terlalu sering diubah. Mulai ulang untuk melanjutkan.');
  end if;
  update public.sesi_temukan
  set versi_kuesioner = p_versi, langkah = p_langkah, jawaban = p_jawaban, dilewati = v_dilewati,
      status = case when p_selesai then 'selesai' else 'berjalan' end,
      selesai = case when p_selesai then coalesce(selesai, now()) else selesai end,
      simpanan = simpanan + 1, diubah = now(),
      kedaluwarsa = case when v_akun then 'infinity'::timestamptz else now() + interval '30 days' end
  where id = s.id;
  return jsonb_build_object('ok', true, 'baru', false, 'akun', v_akun);
end
$$;

-- Sesi yang berlaku untuk pemanggil: baris akun didahulukan; untuk peran yang tidak punya baris akun, baris cookie.
create or replace function public.temukan_sesi(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with akun as (
    select s.* from public.sesi_temukan s
    where auth.uid() is not null and s.user_id = auth.uid() and s.peran = public.temukan_peran_akun()
  ),
  kuki as (
    select s.* from public.sesi_temukan s
    where public.temukan_token_sah(p_token) and s.token_hash = public.temukan_sidik(p_token) and s.user_id is null and s.kedaluwarsa >= now()
      and not exists (select 1 from akun a where a.peran = s.peran)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'peran', s.peran, 'versi', s.versi_kuesioner, 'langkah', s.langkah, 'status', s.status,
           'jawaban', s.jawaban, 'dilewati', to_jsonb(s.dilewati), 'diubah', s.diubah,
           'akun', s.user_id is not null, 'diminati', s.diminati) order by s.peran), '[]'::jsonb)
  from (select * from akun union all select * from kuki) s
$$;

create or replace function public.temukan_hapus(p_token text, p_peran text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_jumlah integer := 0; v_n integer;
begin
  if auth.uid() is not null then
    delete from public.sesi_temukan
    where user_id = auth.uid() and peran = public.temukan_peran_akun() and (p_peran is null or peran = p_peran);
    get diagnostics v_jumlah = row_count;
  end if;
  if public.temukan_token_sah(p_token) then
    delete from public.sesi_temukan
    where token_hash = public.temukan_sidik(p_token) and user_id is null and (p_peran is null or peran = p_peran);
    get diagnostics v_n = row_count;
    v_jumlah := v_jumlah + v_n;
  elsif auth.uid() is null then
    return jsonb_build_object('ok', false, 'pesan', 'Sesi tidak dikenal.');
  end if;
  return jsonb_build_object('ok', true, 'dihapus', v_jumlah);
end
$$;

-- Saat masuk: jawaban yang diisi sebelum masuk menjadi preferensi akun, bila akun itu belum punya preferensi sendiri.
create function public.temukan_klaim(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_peran  text := public.temukan_peran_akun();
  v_sidik  text;
  v_n      integer;
begin
  if v_peran is null or not public.temukan_token_sah(p_token) then
    return jsonb_build_object('ok', true, 'diklaim', false);
  end if;
  v_sidik := public.temukan_sidik(p_token);
  if exists (select 1 from public.sesi_temukan where user_id = auth.uid() and peran = v_peran) then
    -- Preferensi akun yang sudah ada tidak ditimpa. Lokasi yang ditandai sebelum masuk tetap ikut.
    return jsonb_build_object('ok', true, 'diklaim', false);
  end if;
  update public.sesi_temukan
  set user_id = auth.uid(), token_hash = 'akun:' || auth.uid()::text, kedaluwarsa = 'infinity'::timestamptz, diubah = now()
  where token_hash = v_sidik and peran = v_peran and user_id is null and kedaluwarsa >= now();
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'diklaim', v_n > 0, 'peran', v_peran);
end
$$;

-- Potret rekomendasi dari aplikasi: hanya kolom yang dikenal, dengan batas ukuran. Keterangan, bukan dasar keputusan.
create function public.temukan_potret_bersih(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) is distinct from 'object' then null else jsonb_strip_nulls(jsonb_build_object(
    'skor', public.temukan_angka(p ->> 'skor', 0, 100),
    'preferensi', public.temukan_angka(p ->> 'preferensi', 0, 100),
    'versi_model', left(p ->> 'versi_model', 12),
    'versi_preferensi', left(p ->> 'versi_preferensi', 12),
    'alasan', (select jsonb_agg(left(x, 300)) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p -> 'alasan') = 'array' then p -> 'alasan' else '[]'::jsonb end) x limit 3) q),
    'preferensi_ringkas', (select jsonb_agg(left(x, 200)) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p -> 'preferensi_ringkas') = 'array' then p -> 'preferensi_ringkas' else '[]'::jsonb end) x limit 12) q)
  )) end
$$;
revoke execute on function public.temukan_potret_bersih(jsonb) from public, anon, authenticated;

-- Daftar lokasi yang ditandai (paling banyak 10) pada sesi pencarian lokasi. Hanya menyimpan; diperiksa lagi saat diteruskan.
create function public.temukan_tandai(p_token text, p_diminati jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_bersih jsonb;
  v_n      integer;
begin
  if jsonb_typeof(p_diminati) is distinct from 'array' or jsonb_array_length(p_diminati) > 10 then
    return jsonb_build_object('ok', false, 'pesan', 'Paling banyak sepuluh lokasi bisa ditandai.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'lahan_id', left(x ->> 'lahan_id', 80), 'kode', left(coalesce(x ->> 'kode', ''), 40), 'spbu_nomor', left(coalesce(x ->> 'spbu_nomor', ''), 20),
           'potret', public.temukan_potret_bersih(x -> 'potret'))), '[]'::jsonb) into v_bersih
  from jsonb_array_elements(p_diminati) x
  where jsonb_typeof(x) = 'object' and coalesce(x ->> 'lahan_id', '') <> '';

  if public.temukan_peran_akun() = 'tenant' then
    update public.sesi_temukan set diminati = v_bersih, diubah = now() where user_id = auth.uid() and peran = 'tenant';
  elsif public.temukan_token_sah(p_token) then
    update public.sesi_temukan set diminati = v_bersih, diubah = now()
    where token_hash = public.temukan_sidik(p_token) and peran = 'tenant' and user_id is null and kedaluwarsa >= now();
  else
    return jsonb_build_object('ok', false, 'pesan', 'Sesi tidak dikenal.');
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'pesan', 'Jawab dulu pertanyaan pencarian lokasi.');
  end if;
  return jsonb_build_object('ok', true, 'jumlah', jsonb_array_length(v_bersih));
end
$$;

-- ================================================================ minat: satu tabel, empat asal

alter table public.minat_lokasi
  alter column organisasi_id drop not null,
  add column calon_id uuid references public.calon_tenant (id) on delete cascade,
  add column sumber   text not null default 'jelajah' check (sumber in ('jelajah', 'temukan', 'formulir', 'pengelola')),
  add column segmen   text,                 -- jenis usaha yang ingin dihadirkan pengelola SPBU; kosong untuk minat tenant
  add column potret   jsonb,                -- rekomendasi yang dilihat saat minat dinyatakan; keterangan saja
  add constraint minat_satu_pihak check ((organisasi_id is not null) <> (calon_id is not null)),
  add constraint minat_segmen_pengelola check ((sumber = 'pengelola') = (segmen is not null));
drop index public.minat_lokasi_satu_baru;
create unique index minat_lokasi_satu_baru on public.minat_lokasi (coalesce(organisasi_id, calon_id), lahan_id, coalesce(segmen, '')) where status = 'baru';
create index minat_lokasi_calon_idx on public.minat_lokasi (calon_id) where calon_id is not null;
comment on column public.minat_lokasi.sumber is 'jelajah: tenant dari penjelajah lokasi. temukan: tenant dari rekomendasi. formulir: calon tenant saat mendaftar. pengelola: pengelola SPBU yang berminat pada satu jenis usaha.';

-- Tenant yang sudah punya akun: minat pada satu lokasi dari rekomendasinya. Tidak mengikat.
create function public.temukan_minati(p_lahan_id text, p_catatan text default null, p_potret jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' set enable_nestloop = off as $$
declare
  v_org      uuid := public.organisasi_tenant_saya();
  v_catatan  text := nullif(left(btrim(coalesce(p_catatan, '')), 500), '');
  l          record;
  v_id       uuid;
begin
  if v_org is null then
    return jsonb_build_object('ok', false, 'kode', 'akun', 'pesan', 'Minat dinyatakan dari akun yang terhubung ke organisasi tenant.');
  end if;
  select r.lahan_id, r.spbu_id, x.kode, s.nomor into l
  from public.temukan_ruang_tampil() r
  join public.lahan x on x.spbu_id = r.spbu_id and x.lahan_id = r.lahan_id and not x.duplikat
  join public.spbu s on s.id = r.spbu_id
  where r.lahan_id = p_lahan_id;
  if not found then
    return jsonb_build_object('ok', false, 'kode', 'hilang', 'pesan', 'Lokasi ini tidak lagi tersedia. Muat ulang halaman untuk melihat yang terbaru.');
  end if;
  if exists (select 1 from public.minat_lokasi m where m.organisasi_id = v_org and m.lahan_id = p_lahan_id and m.segmen is null and m.status in ('baru', 'ditindaklanjuti')) then
    return jsonb_build_object('ok', false, 'kode', 'sudah', 'pesan', 'Minat organisasi Anda pada lokasi ini sudah tercatat. Tim Non Fuel Retail akan menghubungi Anda.');
  end if;
  insert into public.minat_lokasi (organisasi_id, spbu_id, lahan_id, lahan_kode, spbu_nomor, catatan, dibuat_oleh, sumber, potret)
  values (v_org, l.spbu_id, l.lahan_id, l.kode, l.nomor, v_catatan, public.email_saya(), 'temukan', public.temukan_potret_bersih(p_potret))
  returning id into v_id;
  perform public.audit_catat('minat_lokasi_dicatat', 'lahan', p_lahan_id,
    jsonb_build_object('minat_id', v_id, 'organisasi_id', v_org, 'lahan_kode', l.kode, 'sumber', 'temukan'));
  return jsonb_build_object('ok', true, 'pesan', 'Minat Anda tercatat dan tidak mengikat. Tim Non Fuel Retail akan menghubungi Anda.');
end
$$;

-- Pengelola SPBU yang wewenangnya tercatat: ingin menghadirkan satu jenis usaha di satu ruang. Tidak mengikat.
create function public.temukan_minati_usaha(p_spbu_id text, p_lahan_id text, p_segmen text, p_catatan text default null, p_potret jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' set enable_nestloop = off as $$
declare
  v_org      uuid;
  v_catatan  text := nullif(left(btrim(coalesce(p_catatan, '')), 500), '');
  l          record;
  v_id       uuid;
begin
  if auth.uid() is null or not public.dealer_kelola_spbu(p_spbu_id) then
    return jsonb_build_object('ok', false, 'kode', 'wewenang', 'pesan', 'Ketertarikan diajukan dari akun pengelola yang wewenangnya atas SPBU ini sudah tercatat.');
  end if;
  if p_segmen is null or not (p_segmen = any (public.segmen_calon())) or p_segmen = 'Lainnya' then
    return jsonb_build_object('ok', false, 'kode', 'isi', 'pesan', 'Jenis usaha tidak dikenal.');
  end if;
  select h.organisasi_dealer into v_org
  from public.hak_spbu h join public.keanggotaan k on k.organisasi_id = h.organisasi_dealer and k.user_id = auth.uid()
  where h.spbu_id = p_spbu_id limit 1;
  select r.lahan_id, r.spbu_id, x.kode, s.nomor into l
  from public.temukan_ruang_tampil(p_spbu_id) r
  join public.lahan x on x.spbu_id = r.spbu_id and x.lahan_id = r.lahan_id and not x.duplikat
  join public.spbu s on s.id = r.spbu_id
  where r.lahan_id = p_lahan_id;
  if not found then
    return jsonb_build_object('ok', false, 'kode', 'hilang', 'pesan', 'Ruang ini tidak lagi tercatat kosong. Muat ulang halaman untuk melihat yang terbaru.');
  end if;
  if exists (select 1 from public.minat_lokasi m where m.organisasi_id = v_org and m.lahan_id = p_lahan_id and m.segmen = p_segmen and m.status in ('baru', 'ditindaklanjuti')) then
    return jsonb_build_object('ok', false, 'kode', 'sudah', 'pesan', 'Ketertarikan pada jenis usaha ini untuk ruang ini sudah tercatat. Tim Non Fuel Retail akan menghubungi Anda.');
  end if;
  insert into public.minat_lokasi (organisasi_id, spbu_id, lahan_id, lahan_kode, spbu_nomor, catatan, dibuat_oleh, sumber, segmen, potret)
  values (v_org, l.spbu_id, l.lahan_id, l.kode, l.nomor, v_catatan, public.email_saya(), 'pengelola', p_segmen, public.temukan_potret_bersih(p_potret))
  returning id into v_id;
  perform public.audit_catat('minat_usaha_dicatat', 'lahan', p_lahan_id,
    jsonb_build_object('minat_id', v_id, 'organisasi_id', v_org, 'lahan_kode', l.kode, 'segmen', p_segmen));
  return jsonb_build_object('ok', true, 'pesan', 'Ketertarikan Anda tercatat dan tidak mengikat. Tim Non Fuel Retail akan menindaklanjutinya.');
end
$$;

-- Minat yang masih berjalan milik organisasi pemanggil, untuk menandai kartu yang sudah diminati.
create function public.temukan_minat_saya() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('lahan_id', m.lahan_id, 'segmen', m.segmen, 'status', m.status, 'dibuat', m.dibuat) order by m.dibuat desc), '[]'::jsonb)
  from public.minat_lokasi m
  where auth.uid() is not null and m.status in ('baru', 'ditindaklanjuti')
    and m.organisasi_id in (select k.organisasi_id from public.keanggotaan k join public.organisasi o on o.id = k.organisasi_id
                            where k.user_id = auth.uid() and o.jenis in ('tenant', 'dealer'))
$$;

-- Setelah formulir "Jadi Bright Partner" terkirim: lokasi yang ditandai di sesi diteruskan sebagai minat calon itu.
-- Hanya untuk pendaftaran publik yang baru saja dibuat, dan tiap lokasi diperiksa lagi terhadap data saat ini.
create function public.temukan_serahkan(p_token text, p_calon_token uuid) returns jsonb
language plpgsql security definer set search_path = '' set enable_nestloop = off as $$
declare
  c        public.calon_tenant;
  s        public.sesi_temukan;
  v_n      integer;
begin
  if not public.temukan_token_sah(p_token) then
    return jsonb_build_object('ok', false, 'jumlah', 0);
  end if;
  select * into c from public.calon_tenant where token = p_calon_token and dibuat_oleh = 'publik' and dibuat > now() - interval '10 minutes';
  select * into s from public.sesi_temukan
  where token_hash = public.temukan_sidik(p_token) and peran = 'tenant' and user_id is null and kedaluwarsa >= now() for update;
  if c.id is null or s.id is null or jsonb_array_length(s.diminati) = 0 then
    return jsonb_build_object('ok', true, 'jumlah', 0);
  end if;
  insert into public.minat_lokasi (calon_id, spbu_id, lahan_id, lahan_kode, spbu_nomor, dibuat_oleh, sumber, potret)
  select c.id, r.spbu_id, r.lahan_id, x.kode, sp.nomor, 'publik', 'formulir', public.temukan_potret_bersih(d.potret)
  from (select distinct on (q ->> 'lahan_id') q ->> 'lahan_id' as lahan_id, q -> 'potret' as potret from jsonb_array_elements(s.diminati) q limit 10) d
  join public.temukan_ruang_tampil() r on r.lahan_id = d.lahan_id
  join public.lahan x on x.spbu_id = r.spbu_id and x.lahan_id = r.lahan_id and not x.duplikat
  join public.spbu sp on sp.id = r.spbu_id
  on conflict do nothing;
  get diagnostics v_n = row_count;
  update public.sesi_temukan set diminati = '[]'::jsonb where id = s.id;
  if v_n > 0 then
    perform public.audit_catat('minat_lokasi_dari_formulir', 'calon_tenant', c.id::text, jsonb_build_object('jumlah', v_n));
  end if;
  return jsonb_build_object('ok', true, 'jumlah', v_n);
end
$$;

-- Daftar minat untuk tim NFR, kini dengan asal, jenis usaha, potret, dan calon tenant.
create or replace function public.minat_daftar(p_status text default 'baru') returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.dibuat desc), '[]'::jsonb)
  from (
    select m.id, m.status, m.lahan_id, m.lahan_kode, m.spbu_id, m.spbu_nomor, m.catatan, m.dibuat, m.dibuat_oleh, m.ditangani, m.ditangani_oleh, m.catatan_nfr,
           m.sumber, m.segmen, m.potret, m.calon_id,
           o.id as organisasi_id, coalesce(o.nama, c.nama_usaha, 'Tidak dikenal') as organisasi, coalesce(o.demo, false) as demo,
           s.kota, s.provinsi, nullif(l.luas_m2, 0) as luas_m2,
           (select p.id from public.peluang p
            where p.lahan_id = m.lahan_id and ((m.organisasi_id is not null and p.organisasi_tenant = m.organisasi_id) or (m.calon_id is not null and p.calon_id = m.calon_id))
            order by p.dibuat desc limit 1) as peluang_id
    from public.minat_lokasi m
    left join public.organisasi o on o.id = m.organisasi_id
    left join public.calon_tenant c on c.id = m.calon_id
    left join public.spbu s on s.id = m.spbu_id
    left join public.lahan l on l.spbu_id = m.spbu_id and l.lahan_id = m.lahan_id and not l.duplikat
    where p_status is null or m.status = p_status
  ) x
$$;

revoke execute on function public.temukan_klaim(text), public.temukan_tandai(text, jsonb), public.temukan_minati(text, text, jsonb),
  public.temukan_minati_usaha(text, text, text, text, jsonb), public.temukan_minat_saya(), public.temukan_serahkan(text, uuid) from public, anon;
grant execute on function public.temukan_klaim(text), public.temukan_minati(text, text, jsonb),
  public.temukan_minati_usaha(text, text, text, text, jsonb), public.temukan_minat_saya() to authenticated;
grant execute on function public.temukan_tandai(text, jsonb), public.temukan_serahkan(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
