-- Bright Match · tahap 3: calon tenant, pipeline peluang dengan checklist persyaratan, kartu penawaran
--
-- Tahap ini pertama kalinya menulis data dari aplikasi dan membuka dua fungsi untuk umum:
--   daftar_calon(jsonb)  formulir "Jadi Bright Partner": menyimpan satu calon tenant
--   hasil_calon(uuid)    menampilkan lahan kosong yang cocok bagi pemegang token pendaftaran
-- Keduanya SECURITY DEFINER dengan keluaran sempit: tidak ada nama tenant lain, nilai kontrak, atau data calon lain.
-- Tabelnya sendiri tetap tertutup bagi role `anon`. Semua fungsi lain hanya untuk pengguna yang masuk.
--
-- Tabel tahap ini tidak punya foreign key ke spbu/lahan, karena `npm run db:seed` mengosongkan dan mengisi ulang
-- kedua tabel itu. Peluang menyimpan salinan identitas lahan agar tetap terbaca setelah data dimuat ulang.

-- ---------------------------------------------------------------- tabel

create table public.calon_tenant (
  id               uuid primary key default gen_random_uuid(),
  token            uuid not null unique default gen_random_uuid(),   -- kunci tautan hasil untuk pendaftar
  nama_usaha       text not null,
  segmen           text not null,
  deskripsi        text,
  target_pasar     text,
  asal             text not null default 'lokal' check (asal in ('lokal', 'internasional')),
  negara           text,
  jumlah_gerai     integer,
  kanal            text not null default 'formulir'
                     check (kanal in ('formulir', 'tenant_eksisting', 'waralaba', 'umkm_binaan', 'broker', 'pameran', 'lainnya')),
  kontak_nama      text not null,
  kontak_email     text,
  kontak_telepon   text,
  -- kebutuhan lokasi yang dinyatakan calon
  luas_min         numeric,
  luas_maks        numeric,
  posisi           text not null default 'bebas' check (posisi in ('dalam', 'luar', 'bebas')),
  daya_min         numeric,
  anggaran_tahunan numeric,
  provinsi_minat   text[] not null default '{}',
  catatan          text,
  bahasa           text not null default 'id' check (bahasa in ('id', 'en')),
  status           text not null default 'baru' check (status in ('baru', 'dikualifikasi', 'aktif', 'tidak_lanjut')),
  dibuat           timestamptz not null default now(),
  dibuat_oleh      text not null default 'publik'
);

comment on table public.calon_tenant is 'Calon tenant dari formulir publik atau dicatat tim NFR dari kanal lain.';

create table public.peluang (
  id           uuid primary key default gen_random_uuid(),
  -- salinan identitas lahan saat peluang dibuat
  lahan_id     text not null,
  lahan_kode   text not null,
  spbu_id      text not null,
  spbu_nomor   text not null,
  kota         text,
  provinsi     text,
  -- pihak: tepat satu dari calon tenant atau tenant eksisting
  calon_id     uuid references public.calon_tenant (id) on delete cascade,
  tenant_kunci text,
  tenant_nama  text,
  segmen       text,
  skor         integer,
  tahap        text not null default 'baru'
                 check (tahap in ('baru', 'dihubungi', 'survei', 'penawaran', 'negosiasi', 'kontrak', 'batal')),
  catatan      text,
  pemilik      text,
  dibuat       timestamptz not null default now(),
  diubah       timestamptz not null default now(),
  constraint peluang_satu_pihak check ((calon_id is not null) <> (tenant_kunci is not null))
);

create unique index peluang_lahan_calon on public.peluang (lahan_id, calon_id) where calon_id is not null;
create unique index peluang_lahan_tenant on public.peluang (lahan_id, tenant_kunci) where tenant_kunci is not null;
create index peluang_tahap_idx on public.peluang (tahap);

comment on table public.peluang is 'Satu peluang = satu lahan kosong yang ditawarkan ke satu pihak, dari kontak pertama sampai kontrak.';

create table public.peluang_syarat (
  id          bigint generated always as identity primary key,
  peluang_id  uuid not null references public.peluang (id) on delete cascade,
  pihak       text not null check (pihak in ('tenant', 'spbu', 'pertamina')),
  urut        integer not null,
  butir       text not null,
  terpenuhi   boolean not null default false,
  diubah      timestamptz,
  diubah_oleh text
);

create index peluang_syarat_peluang_idx on public.peluang_syarat (peluang_id);

create table public.peluang_riwayat (
  id          bigint generated always as identity primary key,
  peluang_id  uuid not null references public.peluang (id) on delete cascade,
  tahap_dari  text,
  tahap_ke    text not null,
  oleh        text,
  catatan     text,
  waktu       timestamptz not null default now()
);

create index peluang_riwayat_peluang_idx on public.peluang_riwayat (peluang_id);

alter table public.calon_tenant enable row level security;
alter table public.peluang enable row level security;
alter table public.peluang_syarat enable row level security;
alter table public.peluang_riwayat enable row level security;

-- Tim NFR (semua pengguna yang masuk) boleh membaca dan mengubah. Pembagian peran menyusul.
create policy "Pengguna masuk mengelola calon tenant" on public.calon_tenant
  for all to authenticated using (true) with check (true);
create policy "Pengguna masuk mengelola peluang" on public.peluang
  for all to authenticated using (true) with check (true);
create policy "Pengguna masuk mengelola syarat peluang" on public.peluang_syarat
  for all to authenticated using (true) with check (true);
create policy "Pengguna masuk mengelola riwayat peluang" on public.peluang_riwayat
  for all to authenticated using (true) with check (true);

revoke all on public.calon_tenant, public.peluang, public.peluang_syarat, public.peluang_riwayat from anon;
grant select, insert, update, delete on public.calon_tenant, public.peluang, public.peluang_syarat, public.peluang_riwayat
  to authenticated;

-- ---------------------------------------------------------------- mesin kecocokan: kini juga untuk calon tenant

-- Parameter baru p_calon_id: mencocokkan satu calon tenant dengan lahan kosong di provinsi yang ia minati.
-- Rumus skor sama dengan versi 2. Bedanya hanya pada syarat wajib: kebutuhan calon dinyatakan sendiri,
-- jadi dipakai apa adanya tanpa toleransi, dan anggarannya menjadi batas atas tarif.
drop function public.kecocokan(text, text, text, text, integer, integer);

create function public.kecocokan(
  p_lahan_id   text default null,
  p_tenant_id  text default null,
  p_provinsi   text default null,
  p_kota       text default null,
  p_per_segmen integer default null,
  p_batas      integer default 20,
  p_calon_id   uuid default null
)
returns table (
  lahan_id text, kode text, spbu_id text, spbu_nomor text, kota text, provinsi text,
  luas_m2 numeric, daya_w numeric, tarif_tahunan numeric, posisi text, lantai text,
  tenant_id text, tenant text, segmen text, tenant_lahan bigint, tenant_spbu bigint,
  lahan_di_kota bigint, lahan_di_provinsi bigint,
  tingkat text, n_segmen bigint, n_pembanding bigint, segmen_sudah_ada boolean,
  luas_ok boolean, daya_ok boolean, tarif_ok boolean,
  tenant_luas_p10 double precision, tenant_luas_p90 double precision,
  tenant_tarif_median double precision, tenant_tarif_p90 double precision,
  tipe_lokasi text, lift_tipe numeric, pct_di_tipe numeric, pct_semua numeric,
  penduduk_3km numeric, poi_1km integer, sejenis_500m integer,
  poin_jaringan numeric, poin_pelengkap numeric, poin_harga numeric, poin_kesiapan numeric,
  poin_tipe numeric, poin_permintaan numeric,
  skor integer, jumlah_kandidat bigint
)
-- plpgsql + force_custom_plan: kueri direncanakan dengan nilai parameter yang sebenarnya di setiap
-- panggilan, sehingga arah "satu lahan" dan arah "satu tenant" masing-masing mendapat rencana yang tepat.
-- enable_nestloop = off: tabel antara di sini tidak punya statistik, sehingga perencana kerap memilih
-- nested loop yang memindai ulang tabel itu ribuan kali (4,5 detik). Dengan hash join: 0,2 detik.
language plpgsql stable
set search_path = ''
set plan_cache_mode = force_custom_plan
set enable_nestloop = off
as $$
#variable_conflict use_column
begin
return query
with
sewa as materialized (
  select l.spbu_id, l.segmen, l.tenant_kunci as tenant, l.posisi, public.kelas_luas(l.luas_m2) as kelas, s.kota, s.provinsi
  from public.lahan l
  join public.spbu s on s.id = l.spbu_id
  where l.status = 'Tersewa' and not l.duplikat
),
lot as (
  select l.lahan_id, l.kode, l.spbu_id, s.nomor as spbu_nomor, s.kota, s.provinsi,
         nullif(l.luas_m2, 0) as luas_m2, l.daya_w, l.tarif_tahunan, l.posisi, l.lantai,
         public.kelas_luas(l.luas_m2) as kelas,
         cardinality(s.fasilitas) > 0 as ada_fasilitas,
         s.lat is not null and s.lng is not null as ada_koordinat,
         sl.tipe_lokasi, sl.pct_penduduk, sl.pct_aktivitas, sl.penduduk_3km, sl.poi_1km,
         sl.minimarket_500m, sl.fnb_500m, sl.bank_500m, sl.otomotif_500m, sl.logistik_500m, sl.apotek_500m, sl.ev_1km
  from public.lahan l
  join public.spbu s on s.id = l.spbu_id
  left join public.spbu_lingkungan sl on sl.spbu_id = s.id
  where l.status = 'Tersedia' and not l.duplikat
    and (p_lahan_id is not null or p_tenant_id is not null or p_calon_id is not null)
    and (p_lahan_id is null or l.lahan_id = p_lahan_id)
    and (p_provinsi is null or s.provinsi = p_provinsi)
    and (p_kota is null or s.kota = p_kota)
),
-- Pihak yang dicocokkan: tenant eksisting (profil turunan kontrak, dengan toleransi) atau satu calon tenant
-- (kebutuhan yang ia nyatakan sendiri, tanpa toleransi). Anggaran calon dipakai sebagai batas atas tarif;
-- tarif sampai 80% anggaran mendapat poin harga penuh.
ten as materialized (
  select t.id, t.kunci, t.nama, t.segmen_utama, t.lahan, t.spbu, t.lahan_dalam, t.lahan_luar,
         t.luas_p10, t.luas_p90, t.daya_median, t.tarif_median, t.tarif_p90,
         0.7::float8 as tol_luas_bawah, 1.3::float8 as tol_luas_atas, 0.8::float8 as tol_daya, 1.25::float8 as tol_tarif
  from public.v_tenant_profil t
  where p_calon_id is null and (p_tenant_id is null or t.id = p_tenant_id)
  union all
  select c.id::text, 'calon:' || c.id::text, c.nama_usaha, c.segmen, 0::bigint, 0::bigint,
         (c.posisi in ('dalam', 'bebas'))::int::bigint, (c.posisi in ('luar', 'bebas'))::int::bigint,
         c.luas_min::float8, c.luas_maks::float8, c.daya_min::float8,
         (c.anggaran_tahunan * 0.8)::float8, c.anggaran_tahunan::float8,
         1::float8, 1::float8, 1::float8, 1::float8
  from public.calon_tenant c
  where c.id = p_calon_id
),
afin as materialized (select a.tipe_lokasi, a.segmen, a.lift, a.pct_di_tipe, a.pct_semua from public.m_afinitas_tipe a),
jejak_prov as materialized (
  select tenant, provinsi, count(*) as n from sewa where tenant is not null group by 1, 2
  union all
  -- calon tenant belum punya jejak: wilayahnya adalah provinsi yang ia minati (semua bila tidak memilih)
  select 'calon:' || c.id::text, w.provinsi, 0::bigint
  from public.calon_tenant c
  cross join lateral (
    select distinct s.provinsi from public.spbu s
    where cardinality(c.provinsi_minat) = 0 or s.provinsi = any (c.provinsi_minat)
  ) w
  where c.id = p_calon_id
),
jejak_kota as materialized (select tenant, provinsi, kota, count(*) as n from sewa where tenant is not null group by 1, 2, 3),
hadir as materialized (select distinct spbu_id, tenant from sewa where tenant is not null),
segmen_spbu as materialized (select distinct spbu_id, segmen from sewa),
-- pembanding: lahan tersewa per (wilayah, kelas ukuran, posisi, jenis usaha)
pk as materialized (select provinsi, kota, kelas, posisi, segmen, count(*) as n from sewa where kelas is not null group by 1, 2, 3, 4, 5),
tk as materialized (select provinsi, kota, kelas, posisi, sum(n)::bigint as total, max(n) as maks from pk group by 1, 2, 3, 4),
pp as materialized (select provinsi, kelas, posisi, segmen, sum(n)::bigint as n from pk group by 1, 2, 3, 4),
tp as materialized (select provinsi, kelas, posisi, sum(n)::bigint as total, max(n) as maks from pp group by 1, 2, 3),
pasangan as (
  select
    lot.*,
    t.id as tenant_id, t.nama as tenant, t.segmen_utama as segmen, t.lahan as tenant_lahan, t.spbu as tenant_spbu,
    t.luas_p10 as tenant_luas_p10, t.luas_p90 as tenant_luas_p90,
    t.tarif_median as tenant_tarif_median, t.tarif_p90 as tenant_tarif_p90,
    coalesce(jk.n, 0) as lahan_di_kota,
    jp.n as lahan_di_provinsi,
    case when coalesce(tk.total, 0) >= 10 then 'kota' else 'provinsi' end as tingkat,
    case when coalesce(tk.total, 0) >= 10 then coalesce(pk.n, 0) else coalesce(pp.n, 0) end as n_segmen,
    case when coalesce(tk.total, 0) >= 10 then tk.total else coalesce(tp.total, 0) end as n_pembanding,
    case when coalesce(tk.total, 0) >= 10 then tk.maks else coalesce(tp.maks, 0) end as n_maks,
    ss.spbu_id is not null as segmen_sudah_ada,
    af.lift as lift_tipe, af.pct_di_tipe, af.pct_semua,
    case t.segmen_utama
      when 'Minimarket & Ritel' then lot.minimarket_500m
      when 'F&B / Kuliner' then lot.fnb_500m
      when 'Perbankan & ATM' then lot.bank_500m
      when 'Nitrogen & Perawatan' then lot.otomotif_500m
      when 'Pelumas & Oli' then lot.otomotif_500m
      when 'Logistik & Ekspedisi' then lot.logistik_500m
      when 'Kesehatan & Jasa' then lot.apotek_500m
      when 'Energi Baru (EV/PLTS)' then lot.ev_1km
    end as sejenis_500m,
    case when lot.luas_m2 is null or (t.luas_p10 is null and t.luas_p90 is null) then null
         else (t.luas_p10 is null or lot.luas_m2 >= t.luas_p10 * t.tol_luas_bawah)
          and (t.luas_p90 is null or lot.luas_m2 <= t.luas_p90 * t.tol_luas_atas) end as luas_ok,
    case when lot.daya_w is null or t.daya_median is null then null
         else lot.daya_w >= t.daya_median * t.tol_daya end as daya_ok,
    case when lot.tarif_tahunan is null or t.tarif_p90 is null then null
         else lot.tarif_tahunan <= t.tarif_p90 * t.tol_tarif end as tarif_ok,
    case lot.posisi when 'Didalam Bangunan' then t.lahan_dalam > 0
                    when 'Diluar Bangunan' then t.lahan_luar > 0 end as posisi_ok
  from lot
  join jejak_prov jp on jp.provinsi = lot.provinsi
  join ten t on t.kunci = jp.tenant
  left join jejak_kota jk on jk.tenant = t.kunci and jk.provinsi = lot.provinsi and jk.kota = lot.kota
  left join segmen_spbu ss on ss.spbu_id = lot.spbu_id and ss.segmen = t.segmen_utama
  left join hadir h on h.spbu_id = lot.spbu_id and h.tenant = t.kunci
  left join afin af on af.tipe_lokasi = lot.tipe_lokasi and af.segmen = t.segmen_utama
  left join tk on tk.provinsi = lot.provinsi and tk.kota = lot.kota and tk.kelas = lot.kelas and tk.posisi = lot.posisi
  left join pk on pk.provinsi = lot.provinsi and pk.kota = lot.kota and pk.kelas = lot.kelas and pk.posisi = lot.posisi
              and pk.segmen = t.segmen_utama
  left join tp on tp.provinsi = lot.provinsi and tp.kelas = lot.kelas and tp.posisi = lot.posisi
  left join pp on pp.provinsi = lot.provinsi and pp.kelas = lot.kelas and pp.posisi = lot.posisi
              and pp.segmen = t.segmen_utama
  where h.spbu_id is null
),
nilai as (
  select p.*,
    round(
      12 * (case when p.n_maks > 0 then p.n_segmen::numeric / p.n_maks else 0 end)
      + 8 * (case when p.lahan_di_kota >= 5 then 1.0 when p.lahan_di_kota >= 1 then 0.7
                  when p.lahan_di_provinsi >= 5 then 0.5 else 0.3 end), 1) as poin_jaringan,
    (case when p.segmen_sudah_ada then 5 else 15 end)::numeric as poin_pelengkap,
    round((case
      when p.tarif_tahunan is null or p.tenant_tarif_median is null then 5
      when p.tarif_tahunan <= p.tenant_tarif_median then 10
      when p.tarif_tahunan <= p.tenant_tarif_p90 and p.tenant_tarif_p90 > p.tenant_tarif_median
        then 10 - 5 * (p.tarif_tahunan - p.tenant_tarif_median) / (p.tenant_tarif_p90 - p.tenant_tarif_median)
      when p.tarif_tahunan <= p.tenant_tarif_p90 then 5
      else 2 end)::numeric, 1) as poin_harga,
    ((p.tarif_tahunan is not null)::int * 3 + (p.daya_w is not null)::int * 2 + (p.luas_m2 is not null)::int * 2
      + p.ada_fasilitas::int * 2 + p.ada_koordinat::int)::numeric as poin_kesiapan,
    -- tipe lokasi: lift 0,6 → 0 poin, lift 1,0 → 12,5, lift ≥ 1,4 → 25; tanpa data lingkungan → netral
    round((case when p.tipe_lokasi is null then 12.5
                else 25 * least(1, greatest(0, (coalesce(p.lift_tipe, 0) - 0.6) / 0.8)) end)::numeric, 1) as poin_tipe,
    -- permintaan: rata-rata peringkat penduduk 3 km dan keramaian 1 km di antara semua SPBU
    round((case when p.pct_penduduk is null then 10
                else 20 * (0.5 * p.pct_penduduk + 0.5 * p.pct_aktivitas) end)::numeric, 1) as poin_permintaan
  from pasangan p
  where coalesce(p.luas_ok, true) and coalesce(p.daya_ok, true)
    and coalesce(p.tarif_ok, true) and coalesce(p.posisi_ok, true)
    -- jenis usaha tenant harus terbukti dipakai di lahan sejenis (kecuali pembandingnya memang tidak ada)
    and (p.n_segmen > 0 or p.n_pembanding = 0)
),
peringkat as (
  select n.*,
    round(n.poin_jaringan + n.poin_pelengkap + n.poin_harga + n.poin_kesiapan + n.poin_tipe + n.poin_permintaan)::int as skor,
    count(*) over () as jumlah_kandidat
  from nilai n
),
urut as (
  select r.*,
    row_number() over (partition by r.lahan_id, r.segmen
                       order by r.skor desc, r.lahan_di_kota desc, r.tenant_spbu desc, r.tenant) as urut_segmen
  from peringkat r
)
select
  u.lahan_id, u.kode, u.spbu_id, u.spbu_nomor, u.kota, u.provinsi,
  u.luas_m2, u.daya_w, u.tarif_tahunan, u.posisi, u.lantai,
  u.tenant_id, u.tenant, u.segmen, u.tenant_lahan, u.tenant_spbu,
  u.lahan_di_kota, u.lahan_di_provinsi,
  u.tingkat, u.n_segmen, u.n_pembanding, u.segmen_sudah_ada,
  u.luas_ok, u.daya_ok, u.tarif_ok,
  u.tenant_luas_p10, u.tenant_luas_p90, u.tenant_tarif_median, u.tenant_tarif_p90,
  u.tipe_lokasi, u.lift_tipe, u.pct_di_tipe, u.pct_semua,
  u.penduduk_3km, u.poi_1km, u.sejenis_500m,
  u.poin_jaringan, u.poin_pelengkap, u.poin_harga, u.poin_kesiapan,
  u.poin_tipe, u.poin_permintaan,
  u.skor, u.jumlah_kandidat
from urut u
where p_per_segmen is null or u.urut_segmen <= p_per_segmen
order by u.skor desc, u.lahan_di_kota desc, u.tenant_spbu desc, u.tenant, u.lahan_id
limit greatest(1, least(coalesce(p_batas, 20), 200));
end
$$;


-- ---------------------------------------------------------------- calon tenant

create function public.segmen_calon() returns text[]
language sql immutable as $$
  select array['F&B / Kuliner', 'Minimarket & Ritel', 'Perbankan & ATM', 'Nitrogen & Perawatan', 'Logistik & Ekspedisi',
               'Kesehatan & Jasa', 'Pelumas & Oli', 'LPG & Bright Gas', 'Energi Baru (EV/PLTS)', 'Pameran & Promosi', 'Lainnya']
$$;

-- Memvalidasi dan menyimpan satu calon tenant. Dipanggil oleh formulir publik maupun tim NFR.
create function public.calon_sisip(p jsonb, p_kanal text, p_oleh text) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id      uuid;
  v_nama    text := btrim(coalesce(p ->> 'nama_usaha', ''));
  v_segmen  text := p ->> 'segmen';
  v_kontak  text := btrim(coalesce(p ->> 'kontak_nama', ''));
  v_email   text := nullif(btrim(coalesce(p ->> 'kontak_email', '')), '');
  v_telepon text := nullif(btrim(coalesce(p ->> 'kontak_telepon', '')), '');
  v_min     numeric := nullif(p ->> 'luas_min', '')::numeric;
  v_maks    numeric := nullif(p ->> 'luas_maks', '')::numeric;
  v_daya    numeric := nullif(p ->> 'daya_min', '')::numeric;
  v_biaya   numeric := nullif(p ->> 'anggaran_tahunan', '')::numeric;
  v_gerai   integer := nullif(p ->> 'jumlah_gerai', '')::integer;
  v_prov    text[];
begin
  if length(v_nama) < 2 or length(v_nama) > 120 then
    raise exception 'Nama usaha wajib diisi, 2 sampai 120 karakter.' using errcode = '22023';
  end if;
  if v_segmen is null or not (v_segmen = any (public.segmen_calon())) then
    raise exception 'Jenis usaha tidak dikenal.' using errcode = '22023';
  end if;
  if length(v_kontak) < 2 or length(v_kontak) > 120 then
    raise exception 'Nama kontak wajib diisi.' using errcode = '22023';
  end if;
  if v_email is null and v_telepon is null then
    raise exception 'Isi email atau nomor telepon.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Alamat email tidak sah.' using errcode = '22023';
  end if;
  if coalesce(v_min, 0) < 0 or coalesce(v_maks, 0) < 0 or coalesce(v_min, 0) > 100000 or coalesce(v_maks, 0) > 100000
     or (v_min is not null and v_maks is not null and v_min > v_maks) then
    raise exception 'Rentang luas tidak sah.' using errcode = '22023';
  end if;
  if coalesce(v_daya, 0) < 0 or coalesce(v_biaya, 0) < 0 or coalesce(v_gerai, 0) < 0 then
    raise exception 'Angka tidak boleh negatif.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_prov
  from (select btrim(x) as x from jsonb_array_elements_text(coalesce(p -> 'provinsi_minat', '[]'::jsonb)) x limit 40) q
  where x <> '' and exists (select 1 from public.spbu s where s.provinsi = q.x);

  insert into public.calon_tenant (
    nama_usaha, segmen, deskripsi, target_pasar, asal, negara, jumlah_gerai, kanal,
    kontak_nama, kontak_email, kontak_telepon,
    luas_min, luas_maks, posisi, daya_min, anggaran_tahunan, provinsi_minat, catatan, bahasa, dibuat_oleh
  ) values (
    v_nama, v_segmen,
    nullif(left(btrim(coalesce(p ->> 'deskripsi', '')), 600), ''),
    nullif(left(btrim(coalesce(p ->> 'target_pasar', '')), 600), ''),
    case when p ->> 'asal' = 'internasional' then 'internasional' else 'lokal' end,
    nullif(left(btrim(coalesce(p ->> 'negara', '')), 80), ''),
    v_gerai, p_kanal,
    v_kontak, v_email, left(v_telepon, 40),
    v_min, v_maks,
    case when p ->> 'posisi' in ('dalam', 'luar') then p ->> 'posisi' else 'bebas' end,
    v_daya, v_biaya, v_prov,
    nullif(left(btrim(coalesce(p ->> 'catatan', '')), 1000), ''),
    case when p ->> 'bahasa' = 'en' then 'en' else 'id' end,
    coalesce(nullif(btrim(p_oleh), ''), 'publik')
  ) returning id into v_id;

  return v_id;
end
$$;

-- Formulir publik "Jadi Bright Partner". Rem sederhana terhadap pendaftaran beruntun: 30 per jam.
create function public.daftar_calon(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if (select count(*) from public.calon_tenant c
      where c.dibuat_oleh = 'publik' and c.dibuat > now() - interval '1 hour') >= 30 then
    raise exception 'Pendaftaran sedang ramai. Coba lagi beberapa saat lagi.' using errcode = '54000';
  end if;
  v_id := public.calon_sisip(p, 'formulir', 'publik');
  return (select jsonb_build_object('token', c.token) from public.calon_tenant c where c.id = v_id);
end
$$;

-- Hasil untuk pendaftar: ringkasan kebutuhannya dan sepuluh lahan kosong yang paling cocok.
-- Hanya memuat data lahan yang memang ditawarkan ke umum.
create function public.hasil_calon(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
with c as (select * from public.calon_tenant where token = p_token),
k as (
  select x.* from c, public.kecocokan(p_calon_id => c.id, p_batas => 10) x
)
select case when not exists (select 1 from c) then null else jsonb_build_object(
  'calon', (select jsonb_build_object(
      'nama_usaha', c.nama_usaha, 'segmen', c.segmen, 'provinsi_minat', c.provinsi_minat,
      'luas_min', c.luas_min, 'luas_maks', c.luas_maks, 'posisi', c.posisi,
      'anggaran_tahunan', c.anggaran_tahunan, 'bahasa', c.bahasa) from c),
  'jumlah', coalesce((select max(k.jumlah_kandidat) from k), 0),
  'lahan', coalesce((select jsonb_agg(jsonb_build_object(
      'kode', k.kode, 'spbu_nomor', k.spbu_nomor, 'kota', k.kota, 'provinsi', k.provinsi,
      'luas_m2', k.luas_m2, 'posisi', k.posisi, 'daya_w', k.daya_w, 'tarif_tahunan', k.tarif_tahunan,
      'tipe_lokasi', k.tipe_lokasi, 'skor', k.skor) order by k.skor desc, k.lahan_id) from k), '[]'::jsonb)
) end
$$;

-- Dicatat tim NFR dari kanal selain formulir publik.
create function public.calon_simpan(p jsonb, p_oleh text) returns uuid
language sql set search_path = '' as $$
  select public.calon_sisip(
    p,
    case when p ->> 'kanal' in ('formulir', 'tenant_eksisting', 'waralaba', 'umkm_binaan', 'broker', 'pameran', 'lainnya')
         then p ->> 'kanal' else 'lainnya' end,
    coalesce(nullif(btrim(p_oleh), ''), 'tim')
  )
$$;

create function public.calon_daftar(
  p_cari text default null, p_status text default null, p_halaman integer default 1, p_per_halaman integer default 25
) returns jsonb
language sql stable set search_path = '' as $$
with
cocok as (
  select c.id, c.nama_usaha, c.segmen, c.asal, c.negara, c.kanal, c.status, c.kontak_nama, c.provinsi_minat, c.dibuat,
         (select count(*) from public.peluang p where p.calon_id = c.id) as peluang
  from public.calon_tenant c
  where (p_status is null or c.status = p_status)
    and (nullif(btrim(p_cari), '') is null or c.nama_usaha ilike '%' || btrim(p_cari) || '%'
         or c.kontak_nama ilike '%' || btrim(p_cari) || '%')
),
halaman as (
  select * from cocok order by dibuat desc, id
  limit greatest(1, least(coalesce(p_per_halaman, 25), 100))
  offset (greatest(coalesce(p_halaman, 1), 1) - 1) * greatest(1, least(coalesce(p_per_halaman, 25), 100))
)
select jsonb_build_object(
  'total', (select count(*) from cocok),
  'baris', coalesce((select jsonb_agg(to_jsonb(h) order by h.dibuat desc, h.id) from halaman h), '[]'::jsonb)
)
$$;

create function public.calon_ubah_status(p_id uuid, p_status text) returns boolean
language sql set search_path = '' as $$
  with u as (
    update public.calon_tenant set status = p_status
    where id = p_id and p_status in ('baru', 'dikualifikasi', 'aktif', 'tidak_lanjut')
    returning 1
  ) select exists (select 1 from u)
$$;

-- Profil satu calon tenant, lahan kosong yang cocok, dan peluang yang sudah dibuat untuknya.
create function public.kecocokan_calon(p_id uuid, p_provinsi text default null, p_kota text default null) returns jsonb
language sql stable set search_path = '' as $$
with c as (select * from public.calon_tenant where id = p_id)
select case when not exists (select 1 from c) then null else jsonb_build_object(
  'calon', (select to_jsonb(c) from c),
  'wilayah', coalesce((select jsonb_agg(jsonb_build_object('provinsi', x.provinsi, 'kota', x.kota) order by x.provinsi)
                       from (select s.provinsi, jsonb_agg(distinct s.kota order by s.kota) as kota
                             from public.spbu s, c
                             where s.kota is not null
                               and (cardinality(c.provinsi_minat) = 0 or s.provinsi = any (c.provinsi_minat))
                               and exists (select 1 from public.lahan l where l.spbu_id = s.id and l.status = 'Tersedia')
                             group by s.provinsi) x), '[]'::jsonb),
  'peluang', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'lahan_id', p.lahan_id, 'lahan_kode', p.lahan_kode, 'spbu_nomor', p.spbu_nomor,
        'kota', p.kota, 'tahap', p.tahap, 'skor', p.skor, 'diubah', p.diubah) order by p.diubah desc)
      from public.peluang p where p.calon_id = p_id), '[]'::jsonb),
  'lahan', coalesce((select jsonb_agg(to_jsonb(k) order by k.skor desc, k.lahan_id)
                     from public.kecocokan(p_calon_id => p_id, p_provinsi => p_provinsi, p_kota => p_kota, p_batas => 50) k),
                    '[]'::jsonb)
) end
$$;

-- ---------------------------------------------------------------- pipeline peluang

-- Membuat peluang untuk satu lahan kosong dan satu pihak, lengkap dengan checklist persyaratan.
-- Bila peluang yang sama sudah ada, mengembalikan yang lama.
create function public.peluang_buat(
  p_lahan_id text, p_calon_id uuid default null, p_tenant_id text default null,
  p_skor integer default null, p_oleh text default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id    uuid;
  v_lot   record;
  v_kunci text;
  v_nama  text;
  v_seg   text;
begin
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
          p_calon_id, v_kunci, v_nama, v_seg, p_skor, nullif(btrim(p_oleh), ''))
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

  insert into public.peluang_riwayat (peluang_id, tahap_dari, tahap_ke, oleh) values (v_id, null, 'baru', nullif(btrim(p_oleh), ''));
  return v_id;
end
$$;

create function public.peluang_daftar(
  p_tahap text default null, p_cari text default null, p_halaman integer default 1, p_per_halaman integer default 25
) returns jsonb
language sql stable set search_path = '' as $$
with
semua as (
  select p.id, p.lahan_id, p.lahan_kode, p.spbu_id, p.spbu_nomor, p.kota, p.provinsi, p.segmen, p.skor, p.tahap,
         p.pemilik, p.dibuat, p.diubah,
         case when p.calon_id is not null then 'calon' else 'tenant' end as jenis_pihak,
         coalesce(c.nama_usaha, p.tenant_nama) as pihak,
         (select count(*) from public.peluang_syarat s where s.peluang_id = p.id and s.terpenuhi) as syarat_terpenuhi,
         (select count(*) from public.peluang_syarat s where s.peluang_id = p.id) as syarat_total
  from public.peluang p
  left join public.calon_tenant c on c.id = p.calon_id
),
cari as (
  select * from semua s
  where nullif(btrim(p_cari), '') is null or s.pihak ilike '%' || btrim(p_cari) || '%'
     or s.lahan_kode ilike '%' || btrim(p_cari) || '%' or s.spbu_nomor ilike '%' || btrim(p_cari) || '%'
),
cocok as (select * from cari where p_tahap is null or tahap = p_tahap),
halaman as (
  select * from cocok order by diubah desc, id
  limit greatest(1, least(coalesce(p_per_halaman, 25), 100))
  offset (greatest(coalesce(p_halaman, 1), 1) - 1) * greatest(1, least(coalesce(p_per_halaman, 25), 100))
)
select jsonb_build_object(
  'total', (select count(*) from cocok),
  'per_tahap', coalesce((select jsonb_object_agg(x.tahap, x.n) from (select tahap, count(*) as n from cari group by tahap) x), '{}'::jsonb),
  'baris', coalesce((select jsonb_agg(to_jsonb(h) order by h.diubah desc, h.id) from halaman h), '[]'::jsonb)
)
$$;

create function public.peluang_rinci(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
with p as (select * from public.peluang where id = p_id)
select case when not exists (select 1 from p) then null else jsonb_build_object(
  'peluang', (select to_jsonb(p) from p),
  'calon', (select to_jsonb(c) from public.calon_tenant c, p where c.id = p.calon_id),
  'tenant', (select jsonb_build_object('id', t.id, 'nama', t.nama, 'segmen_utama', t.segmen_utama, 'spbu', t.spbu, 'lahan', t.lahan)
             from public.v_tenant_profil t, p where t.kunci = p.tenant_kunci),
  'lahan', (select jsonb_build_object(
        'status', l.status, 'luas_m2', nullif(l.luas_m2, 0), 'daya_w', l.daya_w, 'tarif_tahunan', l.tarif_tahunan,
        'posisi', l.posisi, 'lantai', l.lantai, 'alamat', s.alamat)
      from public.lahan l join public.spbu s on s.id = l.spbu_id, p
      where l.lahan_id = p.lahan_id and not l.duplikat limit 1),
  'syarat', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'pihak', s.pihak, 'urut', s.urut, 'butir', s.butir, 'terpenuhi', s.terpenuhi,
        'diubah', s.diubah, 'diubah_oleh', s.diubah_oleh) order by s.pihak, s.urut)
      from public.peluang_syarat s where s.peluang_id = p_id), '[]'::jsonb),
  'riwayat', coalesce((select jsonb_agg(jsonb_build_object(
        'tahap_dari', r.tahap_dari, 'tahap_ke', r.tahap_ke, 'oleh', r.oleh, 'catatan', r.catatan, 'waktu', r.waktu)
        order by r.waktu desc, r.id desc)
      from public.peluang_riwayat r where r.peluang_id = p_id), '[]'::jsonb)
) end
$$;

-- Memindahkan peluang ke tahap lain. Tahap "kontrak" hanya bisa dicapai bila semua persyaratan terpenuhi.
create function public.peluang_ubah_tahap(p_id uuid, p_tahap text, p_oleh text default null, p_catatan text default null)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_lama  text;
  v_belum integer;
begin
  if p_tahap not in ('baru', 'dihubungi', 'survei', 'penawaran', 'negosiasi', 'kontrak', 'batal') then
    return jsonb_build_object('ok', false, 'pesan', 'Tahap tidak dikenal.');
  end if;
  select tahap into v_lama from public.peluang where id = p_id;
  if v_lama is null then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang tidak ditemukan.');
  end if;
  if v_lama = p_tahap then
    return jsonb_build_object('ok', true, 'pesan', 'Tahap tidak berubah.');
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
  values (p_id, v_lama, p_tahap, nullif(btrim(p_oleh), ''), nullif(left(btrim(coalesce(p_catatan, '')), 500), ''));
  return jsonb_build_object('ok', true, 'pesan', 'Tahap diperbarui.');
end
$$;

create function public.peluang_set_syarat(p_syarat_id bigint, p_terpenuhi boolean, p_oleh text default null) returns boolean
language sql set search_path = '' as $$
  with u as (
    update public.peluang_syarat
    set terpenuhi = coalesce(p_terpenuhi, false), diubah = now(), diubah_oleh = nullif(btrim(p_oleh), '')
    where id = p_syarat_id
    returning peluang_id
  ), sentuh as (
    update public.peluang set diubah = now() where id in (select peluang_id from u) returning 1
  ) select exists (select 1 from u)
$$;

create function public.peluang_set_catatan(p_id uuid, p_catatan text) returns boolean
language sql set search_path = '' as $$
  with u as (
    update public.peluang set catatan = nullif(left(btrim(coalesce(p_catatan, '')), 2000), ''), diubah = now()
    where id = p_id returning 1
  ) select exists (select 1 from u)
$$;

-- ---------------------------------------------------------------- kartu penawaran

-- Bahan kartu penawaran satu lahan kosong. Sengaja tidak memuat nama tenant lain maupun nilai kontrak:
-- kartu ini ditujukan untuk dikirim ke pihak luar. Bila satu pihak disebut, alasan kecocokannya ikut.
create function public.penawaran(p_lahan_id text, p_tenant_id text default null, p_calon_id uuid default null) returns jsonb
language sql stable set search_path = '' as $$
with
lot as (
  select l.*, public.kelas_luas(l.luas_m2) as kelas
  from public.lahan l
  where l.lahan_id = p_lahan_id and l.status = 'Tersedia' and not l.duplikat
  limit 1
),
s as (select sp.* from public.spbu sp, lot where sp.id = lot.spbu_id),
lain as (select l.* from public.lahan l, lot where l.spbu_id = lot.spbu_id and not l.duplikat)
select case when not exists (select 1 from lot) then null else jsonb_build_object(
  'lahan', (select jsonb_build_object(
      'lahan_id', lot.lahan_id, 'kode', lot.kode, 'luas_m2', nullif(lot.luas_m2, 0), 'kelas', lot.kelas,
      'panjang_m', nullif(lot.panjang_m, 0), 'lebar_m', nullif(lot.lebar_m, 0), 'tinggi_m', nullif(lot.tinggi_m, 0),
      'daya_w', lot.daya_w, 'posisi', lot.posisi, 'lantai', lot.lantai,
      'tarif_tahunan', lot.tarif_tahunan, 'tarif_per_m2', lot.tarif_per_m2) from lot),
  'spbu', (select jsonb_build_object(
      'id', s.id, 'nomor', s.nomor, 'alamat', s.alamat, 'kota', s.kota, 'provinsi', s.provinsi,
      'lat', s.lat, 'lng', s.lng, 'fasilitas', s.fasilitas, 'jumlah_foto', s.jumlah_foto) from s),
  'ringkasan', (select jsonb_build_object(
      'lahan', count(*), 'lahan_tersewa', count(*) filter (where status = 'Tersewa'),
      'lahan_kosong', count(*) filter (where status = 'Tersedia')) from lain),
  'jenis_usaha_ada', coalesce((select jsonb_agg(x.segmen order by x.n desc, x.segmen)
      from (select segmen, count(*) as n from lain
            where status = 'Tersewa' and segmen not in ('Tidak terklasifikasi', 'Lainnya') group by segmen) x), '[]'::jsonb),
  'lingkungan', (select to_jsonb(sl) from public.spbu_lingkungan sl, lot where sl.spbu_id = lot.spbu_id),
  'poi', coalesce((select jsonb_agg(jsonb_build_object('nama', p.nama, 'jenis', p.jenis, 'jarak_m', p.jarak_m)
                              order by p.jarak_m, p.nama)
                   from public.poi_sekitar p, lot where p.spbu_id = lot.spbu_id), '[]'::jsonb),
  'pihak', case when p_tenant_id is null and p_calon_id is null then null else
    (select to_jsonb(k) from public.kecocokan(p_lahan_id => p_lahan_id, p_tenant_id => p_tenant_id,
                                              p_calon_id => p_calon_id, p_batas => 1) k limit 1) end,
  'nama_pihak', coalesce(
    (select t.nama from public.v_tenant_profil t where t.id = p_tenant_id),
    (select c.nama_usaha from public.calon_tenant c where c.id = p_calon_id))
) end
$$;

-- ---------------------------------------------------------------- hak akses fungsi

revoke execute on function
  public.kecocokan(text, text, text, text, integer, integer, uuid),
  public.segmen_calon(), public.calon_sisip(jsonb, text, text), public.calon_simpan(jsonb, text),
  public.calon_daftar(text, text, integer, integer), public.calon_ubah_status(uuid, text),
  public.kecocokan_calon(uuid, text, text),
  public.peluang_buat(text, uuid, text, integer, text), public.peluang_daftar(text, text, integer, integer),
  public.peluang_rinci(uuid), public.peluang_ubah_tahap(uuid, text, text, text),
  public.peluang_set_syarat(bigint, boolean, text), public.peluang_set_catatan(uuid, text),
  public.penawaran(text, text, uuid),
  public.daftar_calon(jsonb), public.hasil_calon(uuid)
from public, anon;

grant execute on function
  public.kecocokan(text, text, text, text, integer, integer, uuid),
  public.segmen_calon(), public.calon_sisip(jsonb, text, text), public.calon_simpan(jsonb, text),
  public.calon_daftar(text, text, integer, integer), public.calon_ubah_status(uuid, text),
  public.kecocokan_calon(uuid, text, text),
  public.peluang_buat(text, uuid, text, integer, text), public.peluang_daftar(text, text, integer, integer),
  public.peluang_rinci(uuid), public.peluang_ubah_tahap(uuid, text, text, text),
  public.peluang_set_syarat(bigint, boolean, text), public.peluang_set_catatan(uuid, text),
  public.penawaran(text, text, uuid),
  public.daftar_calon(jsonb), public.hasil_calon(uuid)
to authenticated;

-- Dua fungsi formulir publik: satu-satunya pintu bagi pengunjung yang tidak masuk.
grant execute on function public.daftar_calon(jsonb), public.hasil_calon(uuid) to anon;

notify pgrst, 'reload schema';
