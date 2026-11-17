-- Bright Match 2.0 · irisan pertama: fondasi kepercayaan data dan alur komersial.
--
-- 1. Organisasi dan peran. Sebelum ini semua pengguna yang masuk boleh membaca dan mengubah semuanya.
--    Kini data hanya terbuka bagi anggota organisasi NFR; akun tenant dan dealer tidak melihat apa pun
--    sampai portalnya dibangun.
-- 2. Jejak audit yang tidak bisa diubah atau dihapus.
-- 3. Pusat validasi data: temuan konflik dari data nyata, dengan peninjau, keputusan, dan riwayat.
--    Data sumber tidak pernah ditimpa; yang dicatat adalah keputusan manusia atas temuan itu.
-- 4. Alur peluang dijaga di basis data: tabel tidak lagi bisa ditulis langsung, perpindahan tahap
--    mengikuti aturan, pelaku diambil dari sesi (bukan dari isian klien), dan lahan dengan konflik
--    kritis yang belum selesai tidak bisa masuk tahap penawaran.
--
-- Aman dipasang di atas data yang ada: tidak ada tabel atau baris lama yang dihapus.

-- ================================================================ 1. organisasi dan peran

create table public.organisasi (
  id            uuid primary key default gen_random_uuid(),
  nama          text not null,
  jenis         text not null check (jenis in ('nfr', 'tenant', 'dealer')),
  tenant_kunci  text,                                  -- organisasi tenant: tautan ke lahan.tenant_kunci
  demo          boolean not null default false,        -- true = organisasi uji, bukan pihak nyata
  dibuat        timestamptz not null default now()
);

comment on table public.organisasi is 'Pihak yang memakai Bright Match: tim NFR Pertamina, tenant, dan pemilik atau pengelola SPBU.';
comment on column public.organisasi.demo is 'Organisasi untuk pengujian. Tidak boleh dipakai sebagai fakta bisnis.';

create table public.keanggotaan (
  user_id        uuid not null references auth.users (id) on delete cascade,
  organisasi_id  uuid not null references public.organisasi (id) on delete cascade,
  peran          text not null check (peran in (
                   'nfr_admin', 'nfr_analis', 'nfr_penyetuju', 'auditor',
                   'tenant_admin', 'tenant_perwakilan', 'dealer_admin', 'dealer_operator')),
  dibuat         timestamptz not null default now(),
  primary key (user_id, organisasi_id)
);

create index keanggotaan_organisasi_idx on public.keanggotaan (organisasi_id);

comment on table public.keanggotaan is 'Peran seorang pengguna di satu organisasi. Peran harus sesuai jenis organisasinya.';

create function public.keanggotaan_periksa() returns trigger
language plpgsql set search_path = '' as $$
declare v_jenis text;
begin
  select jenis into v_jenis from public.organisasi where id = new.organisasi_id;
  if (v_jenis = 'nfr' and new.peran not in ('nfr_admin', 'nfr_analis', 'nfr_penyetuju', 'auditor'))
     or (v_jenis = 'tenant' and new.peran not in ('tenant_admin', 'tenant_perwakilan'))
     or (v_jenis = 'dealer' and new.peran not in ('dealer_admin', 'dealer_operator')) then
    raise exception 'Peran % tidak berlaku untuk organisasi berjenis %.', new.peran, v_jenis using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger keanggotaan_periksa before insert or update on public.keanggotaan
  for each row execute function public.keanggotaan_periksa();

-- Peran pengguna yang sedang masuk di organisasi NFR; null bila bukan anggota NFR.
create function public.peran_nfr() returns text
language sql stable security definer set search_path = '' as $$
  select k.peran from public.keanggotaan k join public.organisasi o on o.id = k.organisasi_id
  where k.user_id = auth.uid() and o.jenis = 'nfr'
  order by case k.peran when 'nfr_admin' then 1 when 'nfr_penyetuju' then 2 when 'nfr_analis' then 3 else 4 end
  limit 1
$$;

create function public.adalah_nfr() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.peran_nfr() is not null
$$;

-- Auditor hanya membaca; tiga peran lain boleh mengubah data kerja.
create function public.boleh_ubah_nfr() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.peran_nfr() in ('nfr_admin', 'nfr_analis', 'nfr_penyetuju'), false)
$$;

create function public.email_saya() returns text
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() ->> 'email', '')
$$;

alter table public.organisasi enable row level security;
alter table public.keanggotaan enable row level security;

create policy "Anggota membaca organisasinya, NFR membaca semua" on public.organisasi for select to authenticated
  using ((select public.adalah_nfr()) or id in (select k.organisasi_id from public.keanggotaan k where k.user_id = (select auth.uid())));
create policy "Pengguna membaca keanggotaannya, NFR membaca semua" on public.keanggotaan for select to authenticated
  using (user_id = (select auth.uid()) or (select public.adalah_nfr()));

revoke all on public.organisasi, public.keanggotaan from anon, authenticated;
grant select on public.organisasi, public.keanggotaan to authenticated;

-- Organisasi NFR, dan semua pengguna yang sudah ada menjadi adminnya: mereka sudah memegang akses penuh
-- sebelum pembagian peran ini, jadi tidak ada yang kehilangan akses.
insert into public.organisasi (nama, jenis) values ('Pertamina Patra Niaga · Non Fuel Retail', 'nfr');
insert into public.keanggotaan (user_id, organisasi_id, peran)
select u.id, o.id, 'nfr_admin' from auth.users u cross join public.organisasi o where o.jenis = 'nfr';

-- Profil pengguna yang sedang masuk, untuk kerangka aplikasi.
create function public.profil_saya() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', public.email_saya(),
    'peran_nfr', public.peran_nfr(),
    'keanggotaan', coalesce((
      select jsonb_agg(jsonb_build_object('organisasi', o.nama, 'jenis', o.jenis, 'peran', k.peran, 'demo', o.demo)
                       order by o.jenis, o.nama)
      from public.keanggotaan k join public.organisasi o on o.id = k.organisasi_id
      where k.user_id = auth.uid()), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------- data lama: hanya untuk anggota NFR

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('spbu', 'lahan', 'area_sekitar', 'spbu_lingkungan', 'poi_sekitar', 'tempat_peta', 'gambar',
                        'calon_tenant', 'peluang', 'peluang_syarat', 'peluang_riwayat')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end
$$;

create policy "Tim NFR membaca SPBU" on public.spbu for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca lahan" on public.lahan for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca area sekitar" on public.area_sekitar for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca lingkungan SPBU" on public.spbu_lingkungan for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca tempat sekitar" on public.poi_sekitar for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca peta sekitar" on public.tempat_peta for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca gambar" on public.gambar for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca calon tenant" on public.calon_tenant for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca peluang" on public.peluang for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca syarat peluang" on public.peluang_syarat for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca riwayat peluang" on public.peluang_riwayat for select to authenticated using ((select public.adalah_nfr()));

-- Tabel alur komersial tidak lagi bisa ditulis langsung lewat API: semua penulisan lewat fungsi di bawah.
revoke insert, update, delete on public.calon_tenant, public.peluang, public.peluang_syarat, public.peluang_riwayat
  from authenticated;
-- Fungsi sisip mentah hanya untuk formulir publik (dipanggil daftar_calon) dan calon_simpan.
revoke execute on function public.calon_sisip(jsonb, text, text) from authenticated;

-- ================================================================ 2. jejak audit

create table public.audit_peristiwa (
  id           bigint generated always as identity primary key,
  waktu        timestamptz not null default now(),
  aktor        uuid,                                   -- null = proses sistem (mis. muat data)
  aktor_email  text,
  peristiwa    text not null,                          -- mis. tahap_diubah, masalah_diputuskan
  entitas      text not null,                          -- peluang, masalah_data, lahan, sistem
  entitas_id   text,
  data         jsonb not null default '{}'::jsonb
);

create index audit_entitas_idx on public.audit_peristiwa (entitas, entitas_id, waktu desc);
create index audit_waktu_idx on public.audit_peristiwa (waktu desc);

comment on table public.audit_peristiwa is 'Jejak audit peristiwa komersial dan keputusan data. Hanya bertambah: baris tidak bisa diubah atau dihapus.';

create function public.audit_tolak_ubah() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Jejak audit tidak bisa diubah atau dihapus.' using errcode = '42501';
end
$$;

create trigger audit_tetap before update or delete on public.audit_peristiwa
  for each row execute function public.audit_tolak_ubah();
create trigger audit_tetap_kosongkan before truncate on public.audit_peristiwa
  for each statement execute function public.audit_tolak_ubah();

alter table public.audit_peristiwa enable row level security;
create policy "Tim NFR membaca jejak audit" on public.audit_peristiwa for select to authenticated
  using ((select public.adalah_nfr()));
revoke all on public.audit_peristiwa from anon, authenticated;
grant select on public.audit_peristiwa to authenticated;

-- Hanya dipanggil dari fungsi lain di berkas ini (tidak dibuka untuk pengguna).
create function public.audit_catat(p_peristiwa text, p_entitas text, p_entitas_id text, p_data jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_peristiwa (aktor, aktor_email, peristiwa, entitas, entitas_id, data)
  values (auth.uid(), public.email_saya(), p_peristiwa, p_entitas, p_entitas_id, coalesce(p_data, '{}'::jsonb))
$$;

revoke execute on function public.audit_catat(text, text, text, jsonb) from public, anon, authenticated;

-- ================================================================ 3. pusat validasi data

create table public.sumber_data (
  kunci       text primary key,
  nama        text not null,
  keterangan  text,
  per_tanggal date                                     -- tanggal data sumber; null bila tidak tercatat
);

comment on table public.sumber_data is 'Asal data yang dimuat ke Bright Match dan tanggal datanya.';

insert into public.sumber_data (kunci, nama, keterangan, per_tanggal) values
  ('brightspace', 'Brightspace', 'Halaman detail SPBU di brightspace.pertamina.com: status lahan, luas, daya, tarif, outlet.', date '2026-11-14'),
  ('master', 'File NFR Master Lahan', 'Daftar kontrak sewa per kode lahan: tenant, masa kontrak, nilai. Ditautkan ke lahan lewat kode lahan.', date '2026-11-02');

alter table public.sumber_data enable row level security;
create policy "Tim NFR membaca sumber data" on public.sumber_data for select to authenticated using ((select public.adalah_nfr()));
revoke all on public.sumber_data from anon, authenticated;
grant select on public.sumber_data to authenticated;

create table public.masalah_data (
  id                   bigint generated always as identity primary key,
  kunci                text not null unique,           -- mis. kode_dobel:3415138-IN-006; stabil antar muat data
  jenis                text not null check (jenis in (
                         'kode_dobel', 'kosong_kontrak_aktif', 'tersewa_tanpa_kontrak', 'kontrak_lewat',
                         'lahan_id_dobel', 'tarif_tak_wajar', 'luas_tak_valid', 'spbu_tanpa_koordinat', 'spbu_tanpa_kota')),
  tingkat              text not null check (tingkat in ('kritis', 'sedang', 'rendah')),
  entitas              text not null check (entitas in ('lahan', 'spbu')),
  -- salinan identitas, tanpa foreign key: muat ulang data (db:seed) tidak boleh menghapus keputusan
  spbu_id              text not null,
  spbu_nomor           text not null,
  kota                 text,
  provinsi             text,
  lahan_kode           text,
  lahan_ids            text[] not null default '{}',   -- semua lahan yang terdampak (id Brightspace)
  ada_lahan_kosong     boolean not null default false,
  ringkasan            text not null,
  bukti                jsonb not null,                 -- rekaman yang bertentangan, apa adanya dari sumber
  sidik                text not null,                  -- md5 bukti; berubah = bukti berubah
  status               text not null default 'terbuka' check (status in ('terbuka', 'ditinjau', 'selesai', 'diabaikan')),
  peninjau             uuid references auth.users (id) on delete set null,
  peninjau_email       text,
  keputusan            text,
  diputuskan           timestamptz,
  diputuskan_oleh      text,
  pertama_terdeteksi   timestamptz not null,
  terakhir_terdeteksi  timestamptz not null,
  dibuka_kembali       timestamptz,
  constraint masalah_keputusan_wajib check (status not in ('selesai', 'diabaikan') or keputusan is not null)
);

create index masalah_status_idx on public.masalah_data (status, tingkat);
create index masalah_jenis_idx on public.masalah_data (jenis);
create index masalah_spbu_idx on public.masalah_data (spbu_id);
create index masalah_lahan_idx on public.masalah_data using gin (lahan_ids);

comment on table public.masalah_data is 'Temuan kualitas data dari deteksi_masalah_data(). Data sumber tidak diubah; yang disimpan keputusan peninjau.';
comment on column public.masalah_data.tingkat is 'kritis = lahan terkait tidak boleh ditawarkan resmi sebelum temuan diputuskan.';

alter table public.masalah_data enable row level security;
create policy "Tim NFR membaca temuan data" on public.masalah_data for select to authenticated using ((select public.adalah_nfr()));
revoke all on public.masalah_data from anon, authenticated;
grant select on public.masalah_data to authenticated;

-- Mencari temuan dari data yang sedang dimuat. Aman diulang:
--   temuan baru ditambahkan; temuan lama diperbarui buktinya tanpa mengubah keputusan;
--   temuan yang sudah diputuskan dibuka kembali bila buktinya berubah;
--   temuan terbuka yang tidak lagi muncul ditutup otomatis dengan catatan.
-- Dipanggil scripts/db.sh setelah muat data, atau oleh tim NFR dari halaman Validasi data.
create function public.deteksi_masalah_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_kini   timestamptz := clock_timestamp();
  v_tutup  integer;
  v_hasil  jsonb;
begin
  if auth.uid() is not null and not public.boleh_ubah_nfr() then
    raise exception 'Hanya tim NFR yang boleh memeriksa ulang data.' using errcode = '42501';
  end if;

  with
  dobel as (select kode from public.lahan where not duplikat group by kode having count(*) > 1),
  l as (
    select l.*, s.nomor as spbu_nomor, s.kota, s.provinsi, (d.kode is not null) as kode_dobel
    from public.lahan l join public.spbu s on s.id = l.spbu_id left join dobel d on d.kode = l.kode
    where not l.duplikat
  ),
  kontrak as (  -- kontrak master sebagai jsonb, untuk bukti
    select l.lahan_id, l.spbu_id, case when l.tenant is null then null else jsonb_build_object(
      'tenant', l.tenant, 'mulai', l.kontrak_mulai, 'akhir', l.kontrak_akhir, 'nilai', l.kontrak_nilai,
      'status', l.kontrak_status, 'baris', l.kontrak_baris) end as k
    from l
  ),
  rekaman as (  -- satu lahan menurut Brightspace, sebagai jsonb
    select l.lahan_id, l.spbu_id, jsonb_build_object(
      'lahan_id', l.lahan_id, 'kode', l.kode, 'status', l.status, 'outlet', l.outlet, 'segmen', l.segmen,
      'luas_m2', l.luas_m2, 'daya_w', l.daya_w, 'harga', l.harga, 'periode', l.periode, 'tarif_tahunan', l.tarif_tahunan,
      'posisi', l.posisi) as r
    from l
  ),
  temuan as (
    -- 1. Satu kode lahan dipakai beberapa lahan: kontrak di file master (ditautkan lewat kode) tidak bisa
    --    dipastikan milik lahan yang mana. Kritis bila ada lahan kosong di kelompok itu.
    select 'kode_dobel:' || l.kode as kunci, 'kode_dobel' as jenis,
           case when bool_or(l.status = 'Tersedia') then 'kritis' else 'sedang' end as tingkat, 'lahan' as entitas,
           min(l.spbu_id) as spbu_id, min(l.spbu_nomor) as spbu_nomor, min(l.kota) as kota, min(l.provinsi) as provinsi,
           l.kode as lahan_kode, array_agg(l.lahan_id order by l.lahan_id) as lahan_ids,
           bool_or(l.status = 'Tersedia') as ada_lahan_kosong,
           format('Kode %s dipakai %s lahan: %s tersewa, %s kosong', l.kode, count(*),
                  count(*) filter (where l.status = 'Tersewa'), count(*) filter (where l.status = 'Tersedia')) as ringkasan,
           jsonb_build_object(
             'rekaman', jsonb_agg(r.r order by l.lahan_id),
             'kontrak', (array_agg(k.k order by l.lahan_id) filter (where k.k is not null))[1]) as bukti
    from l join rekaman r on r.lahan_id = l.lahan_id and r.spbu_id = l.spbu_id
           join kontrak k on k.lahan_id = l.lahan_id and k.spbu_id = l.spbu_id
    where l.kode_dobel
    group by l.kode

    union all
    -- 2. Kosong di Brightspace, tetapi file master mencatat kontrak yang masih berjalan.
    select 'kosong_kontrak_aktif:' || l.lahan_id, 'kosong_kontrak_aktif', 'kritis', 'lahan',
           l.spbu_id, l.spbu_nomor, l.kota, l.provinsi, l.kode, array[l.lahan_id], true,
           format('Lahan %s kosong di Brightspace, tetapi file master mencatat kontrak %s sampai %s',
                  l.kode, l.tenant, to_char(l.kontrak_akhir, 'DD-MM-YYYY')),
           jsonb_build_object('rekaman', jsonb_build_array(r.r), 'kontrak', k.k)
    from l join rekaman r on r.lahan_id = l.lahan_id and r.spbu_id = l.spbu_id
           join kontrak k on k.lahan_id = l.lahan_id and k.spbu_id = l.spbu_id
    where not l.kode_dobel and l.status = 'Tersedia' and l.tenant is not null and l.kontrak_akhir >= current_date

    union all
    -- 3. Tersewa di Brightspace, tetapi tidak ada kontraknya di file master.
    select 'tersewa_tanpa_kontrak:' || l.lahan_id, 'tersewa_tanpa_kontrak', 'sedang', 'lahan',
           l.spbu_id, l.spbu_nomor, l.kota, l.provinsi, l.kode, array[l.lahan_id], false,
           format('Lahan %s tersewa di Brightspace (%s), tetapi kontraknya tidak ada di file master',
                  l.kode, coalesce(nullif(l.outlet, ''), 'outlet tidak tercatat')),
           jsonb_build_object('rekaman', jsonb_build_array(r.r), 'kontrak', null)
    from l join rekaman r on r.lahan_id = l.lahan_id and r.spbu_id = l.spbu_id
    where not l.kode_dobel and l.status = 'Tersewa' and l.tenant is null

    union all
    -- 4. Tersewa di Brightspace, tetapi kontrak di file master sudah lewat tanggal.
    select 'kontrak_lewat:' || l.lahan_id, 'kontrak_lewat', 'rendah', 'lahan',
           l.spbu_id, l.spbu_nomor, l.kota, l.provinsi, l.kode, array[l.lahan_id], false,
           format('Lahan %s masih tersewa di Brightspace, tetapi kontrak %s berakhir %s',
                  l.kode, l.tenant, to_char(l.kontrak_akhir, 'DD-MM-YYYY')),
           jsonb_build_object('rekaman', jsonb_build_array(r.r), 'kontrak', k.k)
    from l join rekaman r on r.lahan_id = l.lahan_id and r.spbu_id = l.spbu_id
           join kontrak k on k.lahan_id = l.lahan_id and k.spbu_id = l.spbu_id
    where not l.kode_dobel and l.status = 'Tersewa' and l.kontrak_akhir < current_date

    union all
    -- 5. Satu id lahan muncul lebih dari sekali di sumber.
    select 'lahan_id_dobel:' || x.lahan_id, 'lahan_id_dobel', 'sedang', 'lahan',
           min(x.spbu_id), min(s.nomor), min(s.kota), min(s.provinsi), min(x.kode), array[x.lahan_id],
           bool_or(x.status = 'Tersedia'),
           format('Id lahan yang sama muncul %s kali di Brightspace (kode %s)', count(*), string_agg(distinct x.kode, ', ')),
           jsonb_build_object('rekaman', jsonb_agg(jsonb_build_object(
             'lahan_id', x.lahan_id, 'kode', x.kode, 'status', x.status, 'outlet', x.outlet, 'segmen', x.segmen,
             'luas_m2', x.luas_m2, 'daya_w', x.daya_w, 'tarif_tahunan', x.tarif_tahunan, 'posisi', x.posisi) order by x.id),
             'kontrak', null)
    from public.lahan x join public.spbu s on s.id = x.spbu_id
    group by x.lahan_id having count(*) > 1

    union all
    -- 6. Lahan kosong dengan harga tercatat tetapi di luar rentang wajar, sehingga tarif tahunannya tidak dihitung.
    select 'tarif_tak_wajar:' || l.lahan_id, 'tarif_tak_wajar', 'sedang', 'lahan',
           l.spbu_id, l.spbu_nomor, l.kota, l.provinsi, l.kode, array[l.lahan_id], true,
           format('Harga lahan kosong %s (Rp %s per %s) di luar rentang wajar', l.kode,
                  replace(to_char(l.harga, 'FM999,999,999,999,999'), ',', '.'), lower(coalesce(l.periode, 'periode'))),
           jsonb_build_object('rekaman', jsonb_build_array(r.r), 'kontrak', null)
    from l join rekaman r on r.lahan_id = l.lahan_id and r.spbu_id = l.spbu_id
    where l.status = 'Tersedia' and l.harga is not null and l.tarif_tahunan is null

    union all
    -- 7. Lahan kosong tanpa luas yang bisa dipakai.
    select 'luas_tak_valid:' || l.lahan_id, 'luas_tak_valid', 'sedang', 'lahan',
           l.spbu_id, l.spbu_nomor, l.kota, l.provinsi, l.kode, array[l.lahan_id], true,
           format('Luas lahan kosong %s tercatat %s', l.kode, coalesce(l.luas_m2::text || ' m²', 'kosong')),
           jsonb_build_object('rekaman', jsonb_build_array(r.r), 'kontrak', null)
    from l join rekaman r on r.lahan_id = l.lahan_id and r.spbu_id = l.spbu_id
    where l.status = 'Tersedia' and (l.luas_m2 is null or l.luas_m2 <= 0)

    union all
    -- 8. SPBU tanpa koordinat: tidak punya data lingkungan, peta, maupun tipe lokasi.
    select 'spbu_tanpa_koordinat:' || s.id, 'spbu_tanpa_koordinat', 'sedang', 'spbu',
           s.id, s.nomor, s.kota, s.provinsi, null, '{}'::text[],
           exists (select 1 from public.lahan x where x.spbu_id = s.id and x.status = 'Tersedia'),
           format('SPBU %s tidak punya koordinat', s.nomor),
           jsonb_build_object('spbu', jsonb_build_object('id', s.id, 'nomor', s.nomor, 'nama', s.nama, 'alamat', s.alamat,
                                                         'kota', s.kota, 'provinsi', s.provinsi))
    from public.spbu s where s.lat is null or s.lng is null

    union all
    -- 9. SPBU tanpa kota: tidak ikut perbandingan sekota.
    select 'spbu_tanpa_kota:' || s.id, 'spbu_tanpa_kota', 'rendah', 'spbu',
           s.id, s.nomor, s.kota, s.provinsi, null, '{}'::text[],
           exists (select 1 from public.lahan x where x.spbu_id = s.id and x.status = 'Tersedia'),
           format('SPBU %s tidak punya nama kota', s.nomor),
           jsonb_build_object('spbu', jsonb_build_object('id', s.id, 'nomor', s.nomor, 'nama', s.nama, 'alamat', s.alamat,
                                                         'kota', s.kota, 'provinsi', s.provinsi))
    from public.spbu s where s.kota is null
  )
  insert into public.masalah_data as m (kunci, jenis, tingkat, entitas, spbu_id, spbu_nomor, kota, provinsi, lahan_kode,
                                        lahan_ids, ada_lahan_kosong, ringkasan, bukti, sidik, pertama_terdeteksi, terakhir_terdeteksi)
  select t.kunci, t.jenis, t.tingkat, t.entitas, t.spbu_id, t.spbu_nomor, t.kota, t.provinsi, t.lahan_kode,
         t.lahan_ids, t.ada_lahan_kosong, t.ringkasan, t.bukti, md5(t.bukti::text), v_kini, v_kini
  from temuan t
  on conflict (kunci) do update set
    tingkat = excluded.tingkat, spbu_nomor = excluded.spbu_nomor, kota = excluded.kota, provinsi = excluded.provinsi,
    lahan_kode = excluded.lahan_kode, lahan_ids = excluded.lahan_ids, ada_lahan_kosong = excluded.ada_lahan_kosong,
    ringkasan = excluded.ringkasan, bukti = excluded.bukti, terakhir_terdeteksi = excluded.terakhir_terdeteksi,
    -- keputusan lama tetap tersimpan (kolom keputusan dan jejak audit); statusnya dibuka lagi bila bukti berubah
    status = case when m.status in ('selesai', 'diabaikan') and m.sidik <> excluded.sidik then 'terbuka' else m.status end,
    dibuka_kembali = case when m.status in ('selesai', 'diabaikan') and m.sidik <> excluded.sidik
                          then excluded.terakhir_terdeteksi else m.dibuka_kembali end,
    sidik = excluded.sidik;

  -- Temuan yang belum diputuskan dan tidak lagi muncul di data: ditutup otomatis, dengan catatan.
  update public.masalah_data
  set status = 'selesai', diputuskan = v_kini, diputuskan_oleh = 'sistem',
      keputusan = 'Tidak terdeteksi lagi setelah data diperbarui.'
  where terakhir_terdeteksi < v_kini and status in ('terbuka', 'ditinjau');
  get diagnostics v_tutup = row_count;

  v_hasil := jsonb_build_object(
    'baru', (select count(*) from public.masalah_data where pertama_terdeteksi = v_kini),
    'masih_ada', (select count(*) from public.masalah_data where terakhir_terdeteksi = v_kini and pertama_terdeteksi < v_kini),
    'dibuka_kembali', (select count(*) from public.masalah_data where dibuka_kembali = v_kini),
    'ditutup_otomatis', v_tutup,
    'waktu', v_kini);
  perform public.audit_catat('deteksi_dijalankan', 'sistem', 'masalah_data', v_hasil);
  return v_hasil;
end
$$;

-- Ringkasan untuk kepala halaman Validasi data.
create function public.masalah_ringkasan() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'per_jenis', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.urut, x.jenis)
      from (select m.jenis, min(case m.tingkat when 'kritis' then 1 when 'sedang' then 2 else 3 end) as urut,
                   count(*) filter (where m.status in ('terbuka', 'ditinjau')) as belum,
                   count(*) filter (where m.status in ('terbuka', 'ditinjau') and m.tingkat = 'kritis') as kritis,
                   count(*) filter (where m.status in ('selesai', 'diabaikan')) as diputuskan,
                   count(*) as total
            from public.masalah_data m group by m.jenis) x), '[]'::jsonb),
    'kritis_belum', (select count(*) from public.masalah_data where tingkat = 'kritis' and status in ('terbuka', 'ditinjau')),
    'belum', (select count(*) from public.masalah_data where status in ('terbuka', 'ditinjau')),
    'diputuskan', (select count(*) from public.masalah_data where status in ('selesai', 'diabaikan')),
    -- lahan kosong yang belum boleh ditawarkan resmi karena temuan kritis
    'lahan_kosong_tertahan', (
      select count(distinct l.lahan_id)
      from public.masalah_data m join public.lahan l on l.lahan_id = any (m.lahan_ids)
      where m.tingkat = 'kritis' and m.status in ('terbuka', 'ditinjau') and l.status = 'Tersedia' and not l.duplikat),
    'lahan_kosong', (select count(*) from public.lahan where status = 'Tersedia' and not duplikat),
    'terakhir_diperiksa', (select max(terakhir_terdeteksi) from public.masalah_data),
    'sumber', coalesce((select jsonb_agg(to_jsonb(s) order by s.kunci) from public.sumber_data s), '[]'::jsonb)
  )
$$;

create function public.masalah_daftar(
  p_status text default 'belum', p_tingkat text default null, p_jenis text default null,
  p_cari text default null, p_halaman integer default 1
) returns jsonb
language sql stable set search_path = '' as $$
with
cocok as (
  select m.id, m.jenis, m.tingkat, m.entitas, m.spbu_id, m.spbu_nomor, m.kota, m.provinsi, m.lahan_kode,
         m.ada_lahan_kosong, m.ringkasan, m.status, m.peninjau_email, m.terakhir_terdeteksi, m.diputuskan
  from public.masalah_data m
  where (case coalesce(p_status, 'belum')
           when 'belum' then m.status in ('terbuka', 'ditinjau')
           when 'diputuskan' then m.status in ('selesai', 'diabaikan')
           when 'semua' then true
           else m.status = p_status end)
    and (p_tingkat is null or m.tingkat = p_tingkat)
    and (p_jenis is null or m.jenis = p_jenis)
    and (nullif(btrim(p_cari), '') is null
         or m.spbu_nomor ilike '%' || btrim(p_cari) || '%' or m.lahan_kode ilike '%' || btrim(p_cari) || '%'
         or m.kota ilike '%' || btrim(p_cari) || '%')
),
halaman as (
  select * from cocok
  order by case tingkat when 'kritis' then 1 when 'sedang' then 2 else 3 end, spbu_nomor, lahan_kode nulls first, id
  limit 25 offset (greatest(coalesce(p_halaman, 1), 1) - 1) * 25
)
select jsonb_build_object(
  'total', (select count(*) from cocok),
  'baris', coalesce((select jsonb_agg(to_jsonb(h) order by case h.tingkat when 'kritis' then 1 when 'sedang' then 2 else 3 end,
                                                          h.spbu_nomor, h.lahan_kode nulls first, h.id) from halaman h), '[]'::jsonb)
)
$$;

-- Satu temuan lengkap: bukti, sumber, keputusan, riwayat audit, dan peluang yang menyangkut lahannya.
create function public.masalah_rinci(p_id bigint) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(m) || jsonb_build_object(
    'sumber', coalesce((select jsonb_agg(to_jsonb(s) order by s.kunci) from public.sumber_data s), '[]'::jsonb),
    'riwayat', coalesce((
      select jsonb_agg(jsonb_build_object('waktu', a.waktu, 'oleh', a.aktor_email, 'peristiwa', a.peristiwa, 'data', a.data)
                       order by a.waktu desc, a.id desc)
      from public.audit_peristiwa a where a.entitas = 'masalah_data' and a.entitas_id = m.id::text), '[]'::jsonb),
    'peluang', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'lahan_kode', p.lahan_kode, 'tahap', p.tahap,
                                          'pihak', coalesce(c.nama_usaha, p.tenant_nama)) order by p.dibuat)
      from public.peluang p left join public.calon_tenant c on c.id = p.calon_id
      where p.lahan_id = any (m.lahan_ids)), '[]'::jsonb)
  )
  from public.masalah_data m where m.id = p_id
$$;

-- Temuan yang belum diputuskan untuk satu lahan, untuk peringatan di halaman lahan, penawaran, dan peluang.
create function public.masalah_lahan(p_lahan_id text) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'jenis', m.jenis, 'tingkat', m.tingkat, 'ringkasan', m.ringkasan,
                                               'status', m.status)
                            order by case m.tingkat when 'kritis' then 1 when 'sedang' then 2 else 3 end, m.id), '[]'::jsonb)
  from public.masalah_data m
  where p_lahan_id = any (m.lahan_ids) and m.status in ('terbuka', 'ditinjau')
$$;

-- Mengambil satu temuan untuk ditinjau.
create function public.masalah_tinjau(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda hanya bisa membaca temuan data.');
  end if;
  select status into v_status from public.masalah_data where id = p_id for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'pesan', 'Temuan tidak ditemukan.');
  end if;
  if v_status not in ('terbuka', 'ditinjau') then
    return jsonb_build_object('ok', false, 'pesan', 'Temuan ini sudah diputuskan. Buka kembali dulu bila perlu ditinjau lagi.');
  end if;
  update public.masalah_data set status = 'ditinjau', peninjau = auth.uid(), peninjau_email = public.email_saya() where id = p_id;
  perform public.audit_catat('masalah_ditinjau', 'masalah_data', p_id::text, jsonb_build_object('status_dari', v_status));
  return jsonb_build_object('ok', true, 'pesan', 'Temuan ini sekarang Anda tinjau.');
end
$$;

-- Memutuskan satu temuan: selesai (sudah dipastikan), diabaikan (bukan masalah), atau terbuka (buka kembali).
-- Keputusan wajib beralasan. Bukti saat keputusan diambil ikut disimpan di jejak audit.
create function public.masalah_putuskan(p_id bigint, p_status text, p_keputusan text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v       public.masalah_data;
  v_alasan text := nullif(left(btrim(coalesce(p_keputusan, '')), 1000), '');
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda hanya bisa membaca temuan data.');
  end if;
  if p_status not in ('selesai', 'diabaikan', 'terbuka') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan keputusan tidak dikenal.');
  end if;
  select * into v from public.masalah_data where id = p_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Temuan tidak ditemukan.');
  end if;
  if v_alasan is null or length(v_alasan) < 10 then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis dasar keputusannya, paling sedikit 10 huruf: apa yang dipastikan dan dari siapa.');
  end if;
  if p_status = 'terbuka' and v.status in ('terbuka', 'ditinjau') then
    return jsonb_build_object('ok', false, 'pesan', 'Temuan ini memang belum diputuskan.');
  end if;

  if p_status = 'terbuka' then
    update public.masalah_data
    set status = 'terbuka', dibuka_kembali = now(), peninjau = null, peninjau_email = null where id = p_id;
  else
    update public.masalah_data
    set status = p_status, keputusan = v_alasan, diputuskan = now(), diputuskan_oleh = public.email_saya(),
        peninjau = coalesce(peninjau, auth.uid()), peninjau_email = coalesce(peninjau_email, public.email_saya())
    where id = p_id;
  end if;
  perform public.audit_catat(
    case p_status when 'terbuka' then 'masalah_dibuka_kembali' else 'masalah_diputuskan' end,
    'masalah_data', p_id::text,
    jsonb_build_object('status_dari', v.status, 'status_ke', p_status, 'alasan', v_alasan, 'sidik', v.sidik, 'bukti', v.bukti));
  return jsonb_build_object('ok', true, 'pesan',
    case p_status when 'selesai' then 'Keputusan disimpan. Temuan ditandai selesai.'
                  when 'diabaikan' then 'Keputusan disimpan. Temuan diabaikan.'
                  else 'Temuan dibuka kembali.' end);
end
$$;

-- ================================================================ 4. alur peluang dijaga di basis data

-- true bila lahan masih punya temuan kritis yang belum diputuskan.
create function public.lahan_tertahan(p_lahan_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.masalah_data m
                 where m.tingkat = 'kritis' and m.status in ('terbuka', 'ditinjau') and p_lahan_id = any (m.lahan_ids))
$$;

create or replace function public.calon_simpan(p jsonb, p_oleh text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.boleh_ubah_nfr() then
    raise exception 'Peran Anda tidak bisa mencatat calon tenant.' using errcode = '42501';
  end if;
  -- pencatat diambil dari sesi; p_oleh dipertahankan hanya agar tanda tangan fungsi tidak berubah
  v_id := public.calon_sisip(
    p,
    case when p ->> 'kanal' in ('formulir', 'tenant_eksisting', 'waralaba', 'umkm_binaan', 'broker', 'pameran', 'lainnya')
         then p ->> 'kanal' else 'lainnya' end,
    coalesce(public.email_saya(), 'tim'));
  perform public.audit_catat('calon_dicatat', 'calon_tenant', v_id::text, jsonb_build_object('kanal', p ->> 'kanal'));
  return v_id;
end
$$;

create or replace function public.calon_ubah_status(p_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_lama text;
begin
  if not public.boleh_ubah_nfr() then
    raise exception 'Peran Anda tidak bisa mengubah calon tenant.' using errcode = '42501';
  end if;
  if p_status not in ('baru', 'dikualifikasi', 'aktif', 'tidak_lanjut') then
    return false;
  end if;
  select status into v_lama from public.calon_tenant where id = p_id for update;
  if v_lama is null then
    return false;
  end if;
  update public.calon_tenant set status = p_status where id = p_id;
  perform public.audit_catat('calon_status_diubah', 'calon_tenant', p_id::text, jsonb_build_object('dari', v_lama, 'ke', p_status));
  return true;
end
$$;

create or replace function public.peluang_buat(
  p_lahan_id text, p_calon_id uuid default null, p_tenant_id text default null,
  p_skor integer default null, p_oleh text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id    uuid;
  v_lot   record;
  v_kunci text;
  v_nama  text;
  v_seg   text;
  v_oleh  text := public.email_saya();
begin
  if not public.boleh_ubah_nfr() then
    raise exception 'Peran Anda tidak bisa membuat peluang.' using errcode = '42501';
  end if;
  if (p_calon_id is null) = (p_tenant_id is null) then
    raise exception 'Pilih tepat satu pihak: calon tenant atau tenant eksisting.' using errcode = '22023';
  end if;

  select l.lahan_id, l.kode, l.spbu_id, s.nomor, s.kota, s.provinsi into v_lot
  from public.lahan l join public.spbu s on s.id = l.spbu_id
  where l.lahan_id = p_lahan_id and l.status = 'Tersedia' and not l.duplikat
  limit 1;
  if not found then
    raise exception 'Lahan kosong tidak ditemukan.' using errcode = '22023';
  end if;

  if p_tenant_id is not null then
    select t.kunci, t.nama, t.segmen_utama into v_kunci, v_nama, v_seg from public.v_tenant_profil t where t.id = p_tenant_id;
    if v_kunci is null then
      raise exception 'Tenant tidak ditemukan.' using errcode = '22023';
    end if;
    select p.id into v_id from public.peluang p where p.lahan_id = p_lahan_id and p.tenant_kunci = v_kunci;
  else
    select c.segmen into v_seg from public.calon_tenant c where c.id = p_calon_id;
    if v_seg is null then
      raise exception 'Calon tenant tidak ditemukan.' using errcode = '22023';
    end if;
    select p.id into v_id from public.peluang p where p.lahan_id = p_lahan_id and p.calon_id = p_calon_id;
  end if;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.peluang (lahan_id, lahan_kode, spbu_id, spbu_nomor, kota, provinsi,
                              calon_id, tenant_kunci, tenant_nama, segmen, skor, pemilik)
  values (v_lot.lahan_id, v_lot.kode, v_lot.spbu_id, v_lot.nomor, v_lot.kota, v_lot.provinsi,
          p_calon_id, v_kunci, v_nama, v_seg, case when p_skor between 0 and 100 then p_skor end, v_oleh)
  returning id into v_id;

  insert into public.peluang_syarat (peluang_id, pihak, urut, butir)
  select v_id, x.pihak, x.urut, x.butir
  from (values
    ('tenant', 1, 'Legalitas usaha diterima (NIB, akta, atau izin sejenis)'),
    ('tenant', 2, 'Profil dan rekam jejak usaha diterima'),
    ('tenant', 3, 'Kebutuhan lokasi dikonfirmasi: luas, daya, dan posisi'),
    ('tenant', 4, 'Kesanggupan investasi dan sewa dikonfirmasi'),
    ('tenant', 5, 'Bersedia mengikuti standar keselamatan SPBU'),
    ('spbu', 1, 'Pemilik atau pengelola SPBU menyetujui jenis usaha'),
    ('spbu', 2, 'Lahan siap: daya listrik, air, dan akses'),
    ('spbu', 3, 'Jam operasi disepakati'),
    ('spbu', 4, 'Skema sewa atau bagi hasil disetujui'),
    ('pertamina', 1, 'Tenant lolos kurasi'),
    ('pertamina', 2, 'Persetujuan keselamatan (HSSE) terbit'),
    ('pertamina', 3, 'Tarif acuan ditetapkan'),
    ('pertamina', 4, 'Draf kontrak standar disiapkan'),
    ('pertamina', 5, 'Penerima sewa dipastikan (SPBU COCO atau DODO)')
  ) as x (pihak, urut, butir);

  insert into public.peluang_riwayat (peluang_id, tahap_dari, tahap_ke, oleh) values (v_id, null, 'baru', v_oleh);
  perform public.audit_catat('peluang_dibuat', 'peluang', v_id::text, jsonb_build_object(
    'lahan_id', v_lot.lahan_id, 'lahan_kode', v_lot.kode, 'pihak', coalesce(v_nama, p_calon_id::text), 'skor', p_skor,
    'lahan_tertahan', public.lahan_tertahan(v_lot.lahan_id)));
  return v_id;
end
$$;

-- Aturan perpindahan tahap:
--   maju satu tahap; mundur satu tahap dengan alasan; batal dari tahap mana pun dengan alasan;
--   peluang yang batal hanya bisa dibuka kembali ke tahap sebelum dibatalkan, dengan alasan.
--   Tahap penawaran ke atas ditolak selama lahannya punya temuan data kritis yang belum diputuskan.
--   Tahap kontrak ditolak selama masih ada persyaratan yang belum terpenuhi.
create or replace function public.peluang_ubah_tahap(p_id uuid, p_tahap text, p_oleh text default null, p_catatan text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_urutan  constant text[] := array['baru', 'dihubungi', 'survei', 'penawaran', 'negosiasi', 'kontrak'];
  v         public.peluang;
  v_dari    integer;
  v_ke      integer;
  v_belum   integer;
  v_sebelum text;
  v_alasan  text := nullif(left(btrim(coalesce(p_catatan, '')), 500), '');
  v_oleh    text := public.email_saya();
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa mengubah tahap peluang.');
  end if;
  if p_tahap <> 'batal' and array_position(v_urutan, p_tahap) is null then
    return jsonb_build_object('ok', false, 'pesan', 'Tahap tidak dikenal.');
  end if;
  select * into v from public.peluang where id = p_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang tidak ditemukan.');
  end if;
  if v.tahap = p_tahap then
    return jsonb_build_object('ok', true, 'pesan', 'Tahap tidak berubah.');
  end if;

  if p_tahap = 'batal' then
    if v_alasan is null then
      return jsonb_build_object('ok', false, 'pesan', 'Tulis alasan pembatalan di kolom alasan.');
    end if;
  elsif v.tahap = 'batal' then
    select r.tahap_dari into v_sebelum from public.peluang_riwayat r
    where r.peluang_id = p_id and r.tahap_ke = 'batal' order by r.waktu desc, r.id desc limit 1;
    if p_tahap is distinct from coalesce(v_sebelum, 'baru') then
      return jsonb_build_object('ok', false, 'pesan',
        'Peluang yang batal hanya bisa dibuka kembali ke tahap sebelum dibatalkan.');
    end if;
    if v_alasan is null then
      return jsonb_build_object('ok', false, 'pesan', 'Tulis alasan membuka kembali peluang ini.');
    end if;
  else
    v_dari := array_position(v_urutan, v.tahap);
    v_ke := array_position(v_urutan, p_tahap);
    if v_ke > v_dari + 1 then
      return jsonb_build_object('ok', false, 'pesan', 'Tahap tidak bisa dilompati. Pindahkan satu tahap demi satu tahap.');
    end if;
    if v_ke < v_dari - 1 then
      return jsonb_build_object('ok', false, 'pesan', 'Peluang hanya bisa dimundurkan satu tahap setiap kali.');
    end if;
    if v_ke < v_dari and v_alasan is null then
      return jsonb_build_object('ok', false, 'pesan', 'Tulis alasan memundurkan tahap di kolom alasan.');
    end if;
  end if;

  if p_tahap in ('penawaran', 'negosiasi', 'kontrak') and public.lahan_tertahan(v.lahan_id) then
    return jsonb_build_object('ok', false, 'pesan',
      'Lahan ini masih punya temuan data kritis yang belum diputuskan. Selesaikan dulu di Validasi data sebelum penawaran resmi.');
  end if;
  if p_tahap = 'kontrak' then
    select count(*) into v_belum from public.peluang_syarat where peluang_id = p_id and not terpenuhi;
    if v_belum > 0 then
      return jsonb_build_object('ok', false, 'pesan',
        v_belum || ' persyaratan belum terpenuhi. Lengkapi dulu sebelum masuk tahap kontrak.');
    end if;
  end if;

  update public.peluang set tahap = p_tahap, diubah = now() where id = p_id;
  insert into public.peluang_riwayat (peluang_id, tahap_dari, tahap_ke, oleh, catatan)
  values (p_id, v.tahap, p_tahap, v_oleh, v_alasan);
  perform public.audit_catat('tahap_diubah', 'peluang', p_id::text,
    jsonb_build_object('dari', v.tahap, 'ke', p_tahap, 'alasan', v_alasan, 'lahan_kode', v.lahan_kode));
  return jsonb_build_object('ok', true, 'pesan', 'Tahap diperbarui.');
end
$$;

create or replace function public.peluang_set_syarat(p_syarat_id bigint, p_terpenuhi boolean, p_oleh text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  if not public.boleh_ubah_nfr() then
    raise exception 'Peran Anda tidak bisa mengubah persyaratan.' using errcode = '42501';
  end if;
  select s.peluang_id, s.pihak, s.butir, s.terpenuhi into v from public.peluang_syarat s where s.id = p_syarat_id for update;
  if not found then
    return false;
  end if;
  update public.peluang_syarat
  set terpenuhi = coalesce(p_terpenuhi, false), diubah = now(), diubah_oleh = public.email_saya() where id = p_syarat_id;
  update public.peluang set diubah = now() where id = v.peluang_id;
  perform public.audit_catat('syarat_diubah', 'peluang', v.peluang_id::text, jsonb_build_object(
    'syarat_id', p_syarat_id, 'pihak', v.pihak, 'butir', v.butir, 'dari', v.terpenuhi, 'ke', coalesce(p_terpenuhi, false)));
  return true;
end
$$;

create or replace function public.peluang_set_catatan(p_id uuid, p_catatan text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.boleh_ubah_nfr() then
    raise exception 'Peran Anda tidak bisa mengubah catatan peluang.' using errcode = '42501';
  end if;
  update public.peluang set catatan = nullif(left(btrim(coalesce(p_catatan, '')), 2000), ''), diubah = now() where id = p_id;
  if not found then
    return false;
  end if;
  perform public.audit_catat('catatan_diubah', 'peluang', p_id::text, '{}'::jsonb);
  return true;
end
$$;

-- ---------------------------------------------------------------- hak panggil

revoke execute on function
  public.keanggotaan_periksa(), public.audit_tolak_ubah(),
  public.peran_nfr(), public.adalah_nfr(), public.boleh_ubah_nfr(), public.email_saya(), public.profil_saya(),
  public.deteksi_masalah_data(), public.masalah_ringkasan(), public.masalah_daftar(text, text, text, text, integer),
  public.masalah_rinci(bigint), public.masalah_lahan(text), public.masalah_tinjau(bigint),
  public.masalah_putuskan(bigint, text, text), public.lahan_tertahan(text)
from public, anon;

grant execute on function
  public.peran_nfr(), public.adalah_nfr(), public.boleh_ubah_nfr(), public.email_saya(), public.profil_saya(),
  public.deteksi_masalah_data(), public.masalah_ringkasan(), public.masalah_daftar(text, text, text, text, integer),
  public.masalah_rinci(bigint), public.masalah_lahan(text), public.masalah_tinjau(bigint),
  public.masalah_putuskan(bigint, text, text), public.lahan_tertahan(text)
to authenticated;

-- Temuan pertama dari data yang sedang dimuat.
select public.deteksi_masalah_data();

notify pgrst, 'reload schema';
