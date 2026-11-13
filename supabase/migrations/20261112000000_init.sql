-- Bright Match · skema awal (versi 1: data internal Brightspace + master kontrak)
--
-- Sumber: hasil scraping Brightspace dan file NFR Master Lahan, yang sudah
-- dibersihkan oleh pipeline Python (eksplorasi.py). Lihat scripts/export_seed.py.
--
-- Keamanan: semua tabel memakai Row Level Security. Hanya pengguna yang sudah
-- masuk (role `authenticated`) yang boleh membaca; role `anon` tidak punya akses.
-- Data kontrak (tenant, nilai sewa) tidak boleh terbuka untuk umum.

-- ---------------------------------------------------------------- tabel

create table public.spbu (
  id                    text primary key,            -- id SPBU di Brightspace
  nomor                 text not null,               -- nomor SPBU, mis. 3415138
  nama                  text not null,
  alamat                text,
  kota                  text,                        -- kosong pada 3 entri uji di sumber
  provinsi              text not null,
  lat                   double precision,
  lng                   double precision,
  koordinat_diperbaiki  boolean not null default false,
  fasilitas             text[] not null default '{}',
  jumlah_foto           integer not null default 0,
  punya_tur_360         boolean not null default false,
  status_listing        text
);

comment on table public.spbu is 'SPBU yang tampil di Brightspace (scraping 3 Nov 2026).';
comment on column public.spbu.koordinat_diperbaiki is 'true bila lat/lng di sumber tertukar atau salah skala lalu diperbaiki pipeline.';

create table public.lahan (
  id              bigint generated always as identity primary key,
  lahan_id        text not null,                     -- id lahan di Brightspace (ada 6 yang dobel di sumber)
  spbu_id         text not null references public.spbu (id) on delete cascade,
  kode            text not null,                     -- kode lahan, mis. 4450129-IN-002
  status          text not null check (status in ('Tersedia', 'Tersewa')),
  segmen          text not null,                     -- hasil klasifikasi analytics.py
  luas_m2         numeric,
  daya_w          numeric,
  harga           numeric,                           -- harga listing apa adanya
  periode         text,                              -- 'Tahun' atau 'Bulan'
  tarif_tahunan   numeric,                           -- harga disetahunkan; null bila tidak valid
  tarif_per_m2    numeric,
  outlet          text,
  deskripsi       text,
  tinggi_m        numeric,
  panjang_m       numeric,
  lebar_m         numeric,
  lantai          text,
  posisi          text,                              -- 'Didalam Bangunan' / 'Diluar Bangunan'
  duplikat        boolean not null default false,    -- true pada kemunculan kedua lahan_id yang sama
  -- kontrak terakhir dari file master (null bila kode tidak ditemukan di master)
  tenant          text,
  kontrak_mulai   date,
  kontrak_akhir   date,
  kontrak_nilai   numeric,
  kontrak_status  text,
  kontrak_baris   integer
);

comment on table public.lahan is 'Lahan NFR per SPBU, digabung dengan kontrak terakhir dari file master.';
comment on column public.lahan.tarif_tahunan is 'Hanya terisi bila harga setahun berada di rentang wajar (aturan outlier pipeline).';
comment on column public.lahan.duplikat is 'Sumber memuat 6 lahan dua kali. Baris kedua ditandai agar tidak tampil ganda di daftar.';

create table public.area_sekitar (
  id          bigint generated always as identity primary key,
  spbu_id     text not null references public.spbu (id) on delete cascade,
  nama        text not null,
  kategori    text,
  keterangan  text,
  jarak_km    numeric
);

comment on table public.area_sekitar is 'Titik keramaian di sekitar SPBU menurut Brightspace (baru 18% SPBU).';

-- ---------------------------------------------------------------- indeks

create index spbu_wilayah_idx on public.spbu (provinsi, kota);
create index lahan_spbu_idx on public.lahan (spbu_id);
create index lahan_status_idx on public.lahan (status);
create index lahan_segmen_idx on public.lahan (segmen);
create index lahan_tenant_idx on public.lahan (tenant) where tenant is not null;
create index lahan_kode_idx on public.lahan (kode);
create index area_spbu_idx on public.area_sekitar (spbu_id);

-- ---------------------------------------------------------------- view
-- security_invoker = true: view tunduk pada RLS pengguna yang memanggil.

create view public.v_ringkasan with (security_invoker = true) as
select
  (select count(*) from public.spbu)                                              as spbu,
  count(*)                                                                         as lahan,
  count(*) filter (where status = 'Tersewa')                                       as lahan_tersewa,
  count(*) filter (where status = 'Tersedia')                                      as lahan_kosong,
  round(100.0 * count(*) filter (where status = 'Tersewa') / nullif(count(*), 0), 1) as okupansi_pct,
  count(*) filter (where status = 'Tersedia' and tarif_tahunan is not null)        as kosong_bertarif,
  coalesce(sum(tarif_tahunan) filter (where status = 'Tersedia'), 0)               as potensi_sewa_bertarif,
  count(distinct spbu_id) filter (where status = 'Tersedia')                       as spbu_dengan_kosong,
  count(distinct tenant)                                                           as tenant
from public.lahan;

create view public.v_peluang_provinsi with (security_invoker = true) as
select
  s.provinsi,
  count(distinct s.id)                                                             as spbu,
  count(l.id)                                                                      as lahan,
  count(l.id) filter (where l.status = 'Tersedia')                                 as lahan_kosong,
  round(100.0 * count(l.id) filter (where l.status = 'Tersewa') / nullif(count(l.id), 0), 1) as okupansi_pct,
  count(l.id) filter (where l.status = 'Tersedia' and l.tarif_tahunan is not null) as kosong_bertarif,
  coalesce(sum(l.tarif_tahunan) filter (where l.status = 'Tersedia'), 0)           as potensi_sewa_bertarif,
  count(distinct s.id) filter (where l.status = 'Tersedia')                        as spbu_dengan_kosong
from public.spbu s
left join public.lahan l on l.spbu_id = s.id
group by s.provinsi;

create view public.v_peluang_kota with (security_invoker = true) as
select
  s.provinsi,
  s.kota,
  count(distinct s.id)                                                             as spbu,
  count(l.id)                                                                      as lahan,
  count(l.id) filter (where l.status = 'Tersedia')                                 as lahan_kosong,
  round(100.0 * count(l.id) filter (where l.status = 'Tersewa') / nullif(count(l.id), 0), 1) as okupansi_pct,
  count(l.id) filter (where l.status = 'Tersedia' and l.tarif_tahunan is not null) as kosong_bertarif,
  coalesce(sum(l.tarif_tahunan) filter (where l.status = 'Tersedia'), 0)           as potensi_sewa_bertarif,
  count(distinct s.id) filter (where l.status = 'Tersedia')                        as spbu_dengan_kosong
from public.spbu s
left join public.lahan l on l.spbu_id = s.id
group by s.provinsi, s.kota;

-- Profil tenant yang diturunkan dari kontraknya (dasar modul Profil tenant).
create view public.v_tenant with (security_invoker = true) as
select
  l.tenant,
  count(*)                                                       as lahan,
  count(distinct l.spbu_id)                                      as spbu,
  count(distinct s.kota)                                         as kota,
  count(distinct s.provinsi)                                     as provinsi,
  mode() within group (order by l.segmen)                        as segmen_utama,
  percentile_cont(0.5) within group (order by l.luas_m2)         as luas_median_m2,
  percentile_cont(0.5) within group (order by l.tarif_tahunan)   as tarif_median,
  min(l.kontrak_akhir)                                           as kontrak_akhir_terdekat
from public.lahan l
join public.spbu s on s.id = l.spbu_id
where l.tenant is not null and l.status = 'Tersewa'
group by l.tenant;

-- ---------------------------------------------------------------- hak akses

alter table public.spbu enable row level security;
alter table public.lahan enable row level security;
alter table public.area_sekitar enable row level security;

create policy "Pengguna masuk boleh membaca SPBU"
  on public.spbu for select to authenticated using (true);
create policy "Pengguna masuk boleh membaca lahan"
  on public.lahan for select to authenticated using (true);
create policy "Pengguna masuk boleh membaca area sekitar"
  on public.area_sekitar for select to authenticated using (true);

revoke all on public.spbu, public.lahan, public.area_sekitar from anon;
revoke all on public.v_ringkasan, public.v_peluang_provinsi, public.v_peluang_kota, public.v_tenant from anon;

grant select on public.spbu, public.lahan, public.area_sekitar to authenticated;
grant select on public.v_ringkasan, public.v_peluang_provinsi, public.v_peluang_kota, public.v_tenant to authenticated;
