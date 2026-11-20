-- Temukan peluang (Smart Discovery), fase A: sesi penemuan sebelum pengguna punya akun.
-- 1. Jawaban kuesioner disimpan per sesi. Kunci sesinya ada di cookie httpOnly peramban; basis data hanya
--    menyimpan sidik (SHA-256) kunci itu, jadi isi tabel ini tidak bisa dipakai untuk membuka sesi orang lain.
-- 2. Peran yang dipilih ("tenant" atau "dealer") hanyalah preferensi. Ia tidak memberi hak apa pun: semua hak
--    tetap berasal dari keanggotaan organisasi dan wewenang SPBU yang sudah dipastikan.
-- 3. Isi jawaban diperiksa aplikasi terhadap kuesioner berversi (src/lib/temukan). Di sini hanya batas bentuk dan
--    ukuran. Siapa pun yang memanggil fungsi ini langsung hanya bisa mengotori sesinya sendiri, jadi pemakai
--    jawaban (rekomendasi di fase B) wajib membersihkannya lagi sebelum dipakai.
-- 4. Fungsi untuk umum hanya membuka data yang memang tampil di daftar Brightspace: alamat SPBU dan ruang kosong.
--    Tanpa tarif, tanpa nama penyewa, tanpa nilai kontrak, tanpa ruang yang tersewa.

create table public.sesi_temukan (
  id               uuid primary key default gen_random_uuid(),
  token_hash       text not null,                                  -- SHA-256 kunci sesi; kuncinya sendiri tidak disimpan
  peran            text not null check (peran in ('tenant', 'dealer')),
  user_id          uuid references auth.users (id) on delete set null,
  versi_kuesioner  text not null,
  langkah          text,                                           -- pertanyaan terakhir yang dibuka
  status           text not null default 'berjalan' check (status in ('berjalan', 'selesai')),
  jawaban          jsonb not null default '{}'::jsonb check (jsonb_typeof(jawaban) = 'object'),
  dilewati         text[] not null default '{}',
  simpanan         integer not null default 0,                     -- berapa kali ditulis; rem per sesi
  dibuat           timestamptz not null default now(),
  diubah           timestamptz not null default now(),
  selesai          timestamptz,
  kedaluwarsa      timestamptz not null default now() + interval '30 days',
  unique (token_hash, peran)
);
create index sesi_temukan_dibuat_idx on public.sesi_temukan (dibuat);
create index sesi_temukan_kedaluwarsa_idx on public.sesi_temukan (kedaluwarsa);
comment on table public.sesi_temukan is 'Sesi kuesioner Temukan peluang. Anonim, dihapus 30 hari setelah terakhir diubah. Peran di sini preferensi, bukan hak.';

alter table public.sesi_temukan enable row level security;
revoke all on public.sesi_temukan from anon, authenticated;
-- Sengaja tanpa policy: tabel hanya dibaca dan ditulis lewat fungsi di bawah.

create function public.temukan_sidik(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;
revoke execute on function public.temukan_sidik(text) from public, anon, authenticated;

-- Kunci sesi: 32 byte acak dalam base64url (43 karakter) atau lebih panjang.
create function public.temukan_token_sah(p_token text) returns boolean
language sql immutable set search_path = '' as $$
  select p_token is not null and p_token ~ '^[A-Za-z0-9_-]{43,128}$'
$$;
revoke execute on function public.temukan_token_sah(text) from public, anon, authenticated;

-- Membuat sesi atau menimpa jawabannya. Selalu menerima seluruh jawaban, jadi aman diulang.
create function public.temukan_simpan(
  p_token text, p_peran text, p_versi text, p_langkah text, p_jawaban jsonb, p_dilewati text[] default '{}', p_selesai boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sidik     text;
  v_dilewati  text[] := coalesce(p_dilewati, '{}');
  s           public.sesi_temukan;
begin
  if not public.temukan_token_sah(p_token) then
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

  v_sidik := public.temukan_sidik(p_token);
  select * into s from public.sesi_temukan where token_hash = v_sidik and peran = p_peran for update;

  if s.id is null then
    -- Rem terhadap pembuatan sesi beruntun, sama sifatnya dengan rem formulir "Jadi Bright Partner".
    if (select count(*) from public.sesi_temukan where dibuat > now() - interval '1 hour') >= 600 then
      return jsonb_build_object('ok', false, 'kode', 'ramai', 'pesan', 'Penyimpanan sedang ramai. Jawaban Anda tetap bisa dilanjutkan di halaman ini.');
    end if;
    delete from public.sesi_temukan where kedaluwarsa < now();
    insert into public.sesi_temukan (token_hash, peran, user_id, versi_kuesioner, langkah, status, jawaban, dilewati, simpanan, selesai)
    values (v_sidik, p_peran, auth.uid(), p_versi, p_langkah, case when p_selesai then 'selesai' else 'berjalan' end,
            p_jawaban, v_dilewati, 1, case when p_selesai then now() end);
    return jsonb_build_object('ok', true, 'baru', true);
  end if;

  if s.simpanan >= 500 then
    return jsonb_build_object('ok', false, 'kode', 'batas', 'pesan', 'Sesi ini sudah terlalu sering diubah. Mulai ulang untuk melanjutkan.');
  end if;
  update public.sesi_temukan
  set versi_kuesioner = p_versi, langkah = p_langkah, jawaban = p_jawaban, dilewati = v_dilewati,
      status = case when p_selesai then 'selesai' else 'berjalan' end,
      selesai = case when p_selesai then coalesce(selesai, now()) else selesai end,
      user_id = coalesce(auth.uid(), user_id),
      simpanan = simpanan + 1, diubah = now(), kedaluwarsa = now() + interval '30 days'
  where id = s.id;
  return jsonb_build_object('ok', true, 'baru', false);
end
$$;

-- Sesi milik pemegang kunci, untuk kedua peran. Kosong bila tidak ada atau sudah kedaluwarsa.
create function public.temukan_sesi(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.temukan_token_sah(p_token) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'peran', s.peran, 'versi', s.versi_kuesioner, 'langkah', s.langkah, 'status', s.status,
             'jawaban', s.jawaban, 'dilewati', to_jsonb(s.dilewati), 'diubah', s.diubah) order by s.peran)
    from public.sesi_temukan s
    where s.token_hash = public.temukan_sidik(p_token) and s.kedaluwarsa >= now()), '[]'::jsonb) end
$$;

-- "Mulai ulang": menghapus jawaban satu peran. Tanpa p_peran: semua sesi pemegang kunci.
create function public.temukan_hapus(p_token text, p_peran text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_jumlah integer;
begin
  if not public.temukan_token_sah(p_token) then
    return jsonb_build_object('ok', false, 'pesan', 'Sesi tidak dikenal.');
  end if;
  delete from public.sesi_temukan
  where token_hash = public.temukan_sidik(p_token) and (p_peran is null or peran = p_peran);
  get diagnostics v_jumlah = row_count;
  return jsonb_build_object('ok', true, 'dihapus', v_jumlah);
end
$$;

-- ================================================================ data umum untuk kuesioner

-- Provinsi dan kota yang punya ruang kosong di daftar Brightspace. Tanpa jumlah.
create function public.temukan_wilayah() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('provinsi', x.provinsi, 'kota', x.kota) order by x.provinsi, x.kota), '[]'::jsonb)
  from (select distinct s.provinsi, s.kota
        from public.spbu s
        where s.kota is not null
          and exists (select 1 from public.lahan l where l.spbu_id = s.id and l.status = 'Tersedia' and not l.duplikat)) x
$$;

-- Mencari SPBU dari nomor, alamat, atau kota. Paling banyak 8 hasil, paling sedikit 3 huruf.
create function public.temukan_cari_spbu(p_cari text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (select lower(btrim(left(coalesce(p_cari, ''), 60))) as k)
  select case when length((select k from q)) < 3 then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'nomor', x.nomor, 'alamat', x.alamat, 'kota', x.kota, 'provinsi', x.provinsi)
                     order by x.urut, x.nomor)
    from (select s.id, s.nomor, s.alamat, s.kota, s.provinsi,
                 case when strpos(s.nomor, (select k from q)) = 1 then 0 else 1 end as urut
          from public.spbu s
          where strpos(s.nomor, (select k from q)) = 1
             or strpos(lower(coalesce(s.alamat, '')), (select k from q)) > 0
             or strpos(lower(coalesce(s.kota, '')), (select k from q)) > 0
          order by urut, s.nomor
          limit 8) x), '[]'::jsonb) end
$$;

-- Satu SPBU dengan ruang kosongnya yang tidak ditahan. null bila SPBU tidak ada.
-- Status data disederhanakan untuk umum: terverifikasi di lokasi atau belum. Sengketa dan penolakan tidak dibuka.
create function public.temukan_spbu(p_spbu_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'nomor', s.nomor, 'alamat', s.alamat, 'kota', s.kota, 'provinsi', s.provinsi, 'fasilitas', to_jsonb(s.fasilitas),
    'ruang', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lahan_id', l.lahan_id, 'kode', l.kode, 'luas_m2', nullif(l.luas_m2, 0), 'posisi', l.posisi, 'lantai', l.lantai,
               'daya_w', l.daya_w, 'terverifikasi', v.status_data = 'terverifikasi') order by l.kode)
      from public.lahan l
      join public.v_status_lahan v on v.spbu_id = l.spbu_id and v.lahan_id = l.lahan_id
      where l.spbu_id = s.id and l.status = 'Tersedia' and not l.duplikat and v.status_ruang = 'tersedia'), '[]'::jsonb))
  from public.spbu s
  where s.id = left(coalesce(p_spbu_id, ''), 80)
$$;

revoke execute on function public.temukan_simpan(text, text, text, text, jsonb, text[], boolean), public.temukan_sesi(text),
  public.temukan_hapus(text, text), public.temukan_wilayah(), public.temukan_cari_spbu(text), public.temukan_spbu(text) from public;
grant execute on function public.temukan_simpan(text, text, text, text, jsonb, text[], boolean), public.temukan_sesi(text),
  public.temukan_hapus(text, text), public.temukan_wilayah(), public.temukan_cari_spbu(text), public.temukan_spbu(text) to anon, authenticated;

notify pgrst, 'reload schema';
