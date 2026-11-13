-- Bright Match · tahap 2: data lingkungan, tipe lokasi, skor versi 2, Playbook jenis usaha
--
-- Data lingkungan dihitung di luar basis data oleh scripts/eksternal/fitur_lingkungan.py dari
-- Overture Maps (titik tempat) dan WorldPop (penduduk), lalu dimuat lewat supabase/load_lingkungan.sql.
-- Atribusi: Overture Maps Foundation (overturemaps.org); WorldPop (worldpop.org), CC BY 4.0.

-- ---------------------------------------------------------------- tabel

create table public.spbu_lingkungan (
  spbu_id          text primary key references public.spbu (id) on delete cascade,
  tipe_lokasi      text not null check (tipe_lokasi in
                     ('kampus', 'perkantoran', 'komersial', 'wisata', 'industri',
                      'pusat_kota', 'perumahan', 'luar_kota', 'campuran')),
  tipe_kedua       text,
  -- jumlah tempat (Overture, keyakinan ≥ 0,5) di sekitar SPBU
  poi_500m         integer not null,
  poi_1km          integer not null,
  kampus_1km       integer not null,
  sekolah_1km      integer not null,
  kantor_1km       integer not null,
  belanja_1km      integer not null,
  kuliner_1km      integer not null,
  wisata_1km       integer not null,
  industri_1km     integer not null,
  kesehatan_1km    integer not null,
  transportasi_1km integer not null,
  -- usaha sejenis di sekitar, per jenis usaha NFR (konteks persaingan; tidak masuk skor)
  minimarket_500m  integer not null,
  fnb_500m         integer not null,
  bank_500m        integer not null,
  otomotif_500m    integer not null,
  logistik_500m    integer not null,
  apotek_500m      integer not null,
  minimarket_1km   integer not null,
  spbu_lain_1km    integer not null,
  ev_1km           integer not null,
  -- penduduk (WorldPop, sel 1 km)
  penduduk_km2     numeric not null,
  penduduk_3km     numeric not null,
  -- peringkat 0–1 di antara semua SPBU, untuk komponen permintaan
  pct_penduduk     numeric not null,
  pct_aktivitas    numeric not null,
  sumber_tempat    text not null,
  sumber_penduduk  text not null,
  dihitung         date not null
);

comment on table public.spbu_lingkungan is
  'Fitur lingkungan dan tipe lokasi per SPBU dari data terbuka. Tipe lokasi adalah usulan yang perlu uji lapangan.';
comment on column public.spbu_lingkungan.tipe_lokasi is
  'Kelompok tempat yang porsinya paling menonjol dalam 1 km dibanding rata-rata jaringan; lihat fitur_lingkungan.py.';

create table public.poi_sekitar (
  id       bigint generated always as identity primary key,
  spbu_id  text not null references public.spbu (id) on delete cascade,
  nama     text not null,
  jenis    text not null,
  jarak_m  integer not null
);

comment on table public.poi_sekitar is 'Tempat penting terdekat per SPBU (maks. 8), dari Overture Maps.';

create index spbu_lingkungan_tipe_idx on public.spbu_lingkungan (tipe_lokasi);
create index poi_sekitar_spbu_idx on public.poi_sekitar (spbu_id);

alter table public.spbu_lingkungan enable row level security;
alter table public.poi_sekitar enable row level security;
create policy "Pengguna masuk boleh membaca lingkungan SPBU"
  on public.spbu_lingkungan for select to authenticated using (true);
create policy "Pengguna masuk boleh membaca tempat sekitar"
  on public.poi_sekitar for select to authenticated using (true);
revoke all on public.spbu_lingkungan, public.poi_sekitar from anon;
grant select on public.spbu_lingkungan, public.poi_sekitar to authenticated;

-- ---------------------------------------------------------------- afinitas & peluang per tipe

-- Seberapa sering tiap jenis usaha hadir di tiap tipe lokasi, dibanding kehadirannya di seluruh jaringan.
-- lift 1,5 berarti jenis usaha itu 1,5× lebih sering ada di SPBU bertipe tersebut.
create view public.v_afinitas_tipe with (security_invoker = true) as
with
dasar as (
  select sl.tipe_lokasi, l.spbu_id, l.segmen
  from public.spbu_lingkungan sl
  join public.lahan l on l.spbu_id = sl.spbu_id
  where l.status = 'Tersewa' and not l.duplikat
),
spbu_tipe as (select tipe_lokasi, count(distinct spbu_id) as n from dasar group by 1),
semua as (select count(distinct spbu_id) as n from dasar),
seg_tipe as (select tipe_lokasi, segmen, count(distinct spbu_id) as n from dasar group by 1, 2),
seg_semua as (select segmen, count(distinct spbu_id) as n from dasar group by 1)
select
  st.tipe_lokasi,
  st.segmen,
  st.n                                                        as spbu_dengan_segmen,
  sp.n                                                        as spbu_tipe,
  round(100.0 * st.n / sp.n, 1)                               as pct_di_tipe,
  round(100.0 * ss.n / semua.n, 1)                            as pct_semua,
  round((st.n::numeric / sp.n) / (ss.n::numeric / semua.n), 2) as lift
from seg_tipe st
join spbu_tipe sp on sp.tipe_lokasi = st.tipe_lokasi
join seg_semua ss on ss.segmen = st.segmen
cross join semua;

create view public.v_peluang_tipe with (security_invoker = true) as
select
  sl.tipe_lokasi,
  count(distinct sl.spbu_id)                                                       as spbu,
  count(l.id)                                                                      as lahan,
  count(l.id) filter (where l.status = 'Tersedia')                                 as lahan_kosong,
  round(100.0 * count(l.id) filter (where l.status = 'Tersewa') / nullif(count(l.id), 0), 1) as okupansi_pct,
  coalesce(sum(l.tarif_tahunan) filter (where l.status = 'Tersedia'), 0)           as potensi_sewa_bertarif,
  round(avg(sl.penduduk_3km))                                                      as penduduk_3km_rata
from public.spbu_lingkungan sl
left join public.lahan l on l.spbu_id = sl.spbu_id
group by sl.tipe_lokasi;

-- Afinitas hanya berubah saat data dimuat, jadi hasilnya disimpan. supabase/load_lingkungan.sql
-- menyegarkannya (refresh materialized view) setiap kali data dimuat. Fungsi membaca dari sini.
create materialized view public.m_afinitas_tipe as select * from public.v_afinitas_tipe;
create unique index m_afinitas_tipe_kunci on public.m_afinitas_tipe (tipe_lokasi, segmen);

revoke all on public.v_afinitas_tipe, public.v_peluang_tipe, public.m_afinitas_tipe from anon;
grant select on public.v_afinitas_tipe, public.v_peluang_tipe, public.m_afinitas_tipe to authenticated;

-- ---------------------------------------------------------------- mesin kecocokan versi 2

-- Versi 2 menambah dua komponen dari data lingkungan sehingga skor penuh 100 poin:
--   tipe lokasi 25  lift jenis usaha tenant di tipe lokasi SPBU (0,6 → 0 poin; 1,0 → 12,5; ≥ 1,4 → 25)
--   permintaan  20  rata-rata peringkat penduduk dalam 3 km dan jumlah tempat dalam 1 km di antara semua SPBU
-- SPBU tanpa data lingkungan mendapat nilai tengah (12,5 dan 10).
-- Empat komponen versi 1 (jaringan 20, pelengkap 15, harga 10, kesiapan 10) dan syarat wajibnya tidak berubah.
-- Jumlah usaha sejenis dalam 500 m ikut dikembalikan sebagai konteks, tetapi belum masuk skor: usaha sejenis
-- di dekat SPBU bisa berarti persaingan maupun tanda permintaan, dan arahnya baru bisa dipastikan dari pilot.
-- Volume BBM (versi 3) akan menggantikan sebagian komponen permintaan.
drop function public.kecocokan(text, text, text, text, integer, integer);

create function public.kecocokan(
  p_lahan_id   text default null,
  p_tenant_id  text default null,
  p_provinsi   text default null,
  p_kota       text default null,
  p_per_segmen integer default null,
  p_batas      integer default 20
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
    and (p_lahan_id is not null or p_tenant_id is not null)
    and (p_lahan_id is null or l.lahan_id = p_lahan_id)
    and (p_provinsi is null or s.provinsi = p_provinsi)
    and (p_kota is null or s.kota = p_kota)
),
ten as materialized (
  select t.* from public.v_tenant_profil t where p_tenant_id is null or t.id = p_tenant_id
),
afin as materialized (select a.tipe_lokasi, a.segmen, a.lift, a.pct_di_tipe, a.pct_semua from public.m_afinitas_tipe a),
jejak_prov as materialized (select tenant, provinsi, count(*) as n from sewa where tenant is not null group by 1, 2),
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
    case when lot.luas_m2 is null or t.luas_p10 is null then null
         else lot.luas_m2 between t.luas_p10 * 0.7 and t.luas_p90 * 1.3 end as luas_ok,
    case when lot.daya_w is null or t.daya_median is null then null
         else lot.daya_w >= t.daya_median * 0.8 end as daya_ok,
    case when lot.tarif_tahunan is null or t.tarif_p90 is null then null
         else lot.tarif_tahunan <= t.tarif_p90 * 1.25 end as tarif_ok,
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


-- ---------------------------------------------------------------- API halaman

drop function public.daftar_spbu(text, text, text, boolean, integer, integer);

-- Daftar SPBU: kini dengan tipe lokasi dan saringan tipe.
create function public.daftar_spbu(
  p_cari text default null, p_provinsi text default null, p_kota text default null,
  p_hanya_kosong boolean default false, p_tipe text default null,
  p_halaman integer default 1, p_per_halaman integer default 25
) returns jsonb
language sql stable set search_path = '' as $$
with
agg as (
  select l.spbu_id,
    count(*) as lahan,
    count(*) filter (where l.status = 'Tersedia') as lahan_kosong,
    count(distinct l.tenant_kunci) filter (where l.status = 'Tersewa') as tenant,
    coalesce(sum(l.tarif_tahunan) filter (where l.status = 'Tersedia'), 0) as potensi_sewa_bertarif
  from public.lahan l where not l.duplikat group by l.spbu_id
),
cocok as (
  select s.id, s.nomor, s.nama, s.alamat, s.kota, s.provinsi, sl.tipe_lokasi,
    coalesce(a.lahan, 0) as lahan, coalesce(a.lahan_kosong, 0) as lahan_kosong,
    coalesce(a.tenant, 0) as tenant, coalesce(a.potensi_sewa_bertarif, 0) as potensi_sewa_bertarif
  from public.spbu s
  left join agg a on a.spbu_id = s.id
  left join public.spbu_lingkungan sl on sl.spbu_id = s.id
  where (p_provinsi is null or s.provinsi = p_provinsi)
    and (p_kota is null or s.kota = p_kota)
    and (p_tipe is null or sl.tipe_lokasi = p_tipe)
    and (not coalesce(p_hanya_kosong, false) or coalesce(a.lahan_kosong, 0) > 0)
    and (nullif(btrim(p_cari), '') is null
         or s.nomor ilike '%' || btrim(p_cari) || '%'
         or s.nama ilike '%' || btrim(p_cari) || '%'
         or s.alamat ilike '%' || btrim(p_cari) || '%')
),
halaman as (
  select * from cocok
  order by lahan_kosong desc, lahan desc, nomor
  limit greatest(1, least(coalesce(p_per_halaman, 25), 100))
  offset (greatest(coalesce(p_halaman, 1), 1) - 1) * greatest(1, least(coalesce(p_per_halaman, 25), 100))
)
select jsonb_build_object(
  'total', (select count(*) from cocok),
  'baris', coalesce((select jsonb_agg(to_jsonb(h) order by h.lahan_kosong desc, h.lahan desc, h.nomor) from halaman h), '[]'::jsonb)
)
$$;

-- Profil SPBU: ditambah lingkungan dari data terbuka dan tempat penting terdekat.
create or replace function public.profil_spbu(p_id text) returns jsonb
language sql stable set search_path = '' as $$
with
s as (select * from public.spbu where id = p_id),
lahan_spbu as (select l.* from public.lahan l where l.spbu_id = p_id and not l.duplikat),
kota_spbu as (
  select x.id from public.spbu x, s
  where x.provinsi = s.provinsi and x.kota = s.kota
    and exists (select 1 from public.lahan l where l.spbu_id = x.id)
),
bauran as (
  select l.segmen, count(distinct l.spbu_id) as spbu
  from public.lahan l join kota_spbu k on k.id = l.spbu_id
  where l.status = 'Tersewa' and not l.duplikat
  group by l.segmen
)
select case when not exists (select 1 from s) then null else jsonb_build_object(
  'spbu', (select to_jsonb(s) from s),
  'ringkasan', (select jsonb_build_object(
      'lahan', count(*),
      'lahan_kosong', count(*) filter (where status = 'Tersedia'),
      'lahan_tersewa', count(*) filter (where status = 'Tersewa'),
      'tenant', count(distinct tenant_kunci) filter (where status = 'Tersewa'),
      'potensi_sewa_bertarif', coalesce(sum(tarif_tahunan) filter (where status = 'Tersedia'), 0)
    ) from lahan_spbu),
  'lahan', coalesce((select jsonb_agg(jsonb_build_object(
      'lahan_id', l.lahan_id, 'kode', l.kode, 'status', l.status, 'segmen', l.segmen,
      'luas_m2', nullif(l.luas_m2, 0), 'daya_w', l.daya_w, 'tarif_tahunan', l.tarif_tahunan,
      'posisi', l.posisi, 'lantai', l.lantai, 'deskripsi', l.deskripsi,
      'tenant', l.tenant,
      'tenant_id', case when l.tenant_kunci is not null and l.status = 'Tersewa' then public.id_tenant(l.tenant_kunci) end,
      'kontrak_akhir', l.kontrak_akhir
    ) order by l.status, l.kode) from lahan_spbu l), '[]'::jsonb),
  'area', coalesce((select jsonb_agg(jsonb_build_object(
      'nama', a.nama, 'kategori', a.kategori, 'keterangan', a.keterangan, 'jarak_km', a.jarak_km
    ) order by a.jarak_km nulls last, a.nama) from public.area_sekitar a where a.spbu_id = p_id), '[]'::jsonb),
  'bauran_kota', jsonb_build_object(
    'spbu_di_kota', (select count(*) from kota_spbu),
    'segmen', coalesce((select jsonb_agg(jsonb_build_object(
        'segmen', b.segmen, 'spbu', b.spbu,
        'ada', exists (select 1 from lahan_spbu l where l.status = 'Tersewa' and l.segmen = b.segmen)
      ) order by b.spbu desc, b.segmen) from bauran b), '[]'::jsonb)),
  'lingkungan', (select to_jsonb(sl) from public.spbu_lingkungan sl where sl.spbu_id = p_id),
  'poi', coalesce((select jsonb_agg(jsonb_build_object('nama', p.nama, 'jenis', p.jenis, 'jarak_m', p.jarak_m)
                              order by p.jarak_m, p.nama)
                   from public.poi_sekitar p where p.spbu_id = p_id), '[]'::jsonb)
) end
$$;

-- Kartu rekomendasi lahan: ditambah lingkungan SPBU dan afinitas tiap jenis usaha terhadap tipe lokasinya.
create or replace function public.kecocokan_lahan(p_lahan_id text) returns jsonb
language sql stable set search_path = '' as $$
with
lot as (
  select l.lahan_id, l.kode, l.spbu_id, s.nomor as spbu_nomor, s.alamat, s.kota, s.provinsi,
         nullif(l.luas_m2, 0) as luas_m2, l.daya_w, l.tarif_tahunan, l.posisi, l.lantai, l.deskripsi,
         public.kelas_luas(l.luas_m2) as kelas
  from public.lahan l join public.spbu s on s.id = l.spbu_id
  where l.lahan_id = p_lahan_id and l.status = 'Tersedia' and not l.duplikat
  limit 1
),
lingk as (select sl.* from public.spbu_lingkungan sl, lot where sl.spbu_id = lot.spbu_id)
select case when not exists (select 1 from lot) then null else jsonb_build_object(
  'lahan', (select to_jsonb(lot) from lot),
  'lingkungan', (select to_jsonb(lingk) from lingk),
  'jenis_usaha', coalesce((
      select jsonb_agg(to_jsonb(j) || jsonb_build_object('lift_tipe', a.lift, 'pct_di_tipe', a.pct_di_tipe, 'pct_semua', a.pct_semua)
                       order by j.n desc, j.segmen)
      from public.pembanding_lahan(p_lahan_id) j
      left join public.m_afinitas_tipe a
        on a.segmen = j.segmen and a.tipe_lokasi = (select tipe_lokasi from lingk)), '[]'::jsonb),
  'tenant', coalesce((select jsonb_agg(to_jsonb(k) order by k.skor desc, k.lahan_di_kota desc, k.tenant_spbu desc, k.tenant)
                      from public.kecocokan(p_lahan_id => p_lahan_id, p_per_segmen => 5, p_batas => 40) k), '[]'::jsonb)
) end
$$;

-- Playbook: statistik tiap jenis usaha dari jaringan (lahan, tenant, kebutuhan ruang, tipe lokasi).
-- Isi naratifnya (segmen pelanggan, customer journey) ada di aplikasi: src/lib/playbook.ts.
create function public.playbook() returns jsonb
language sql stable set search_path = '' as $$
with
sewa as materialized (
  select l.segmen, l.spbu_id, l.tenant, l.tenant_kunci, l.posisi, nullif(l.luas_m2, 0) as luas_m2,
         l.daya_w, l.tarif_tahunan, s.provinsi
  from public.lahan l join public.spbu s on s.id = l.spbu_id
  where l.status = 'Tersewa' and not l.duplikat
),
dasar as (
  select segmen,
    count(*) as lahan, count(distinct spbu_id) as spbu, count(distinct tenant_kunci) as tenant,
    count(*) filter (where posisi = 'Didalam Bangunan') as lahan_dalam,
    count(*) filter (where posisi = 'Diluar Bangunan') as lahan_luar,
    percentile_cont(0.1) within group (order by luas_m2) as luas_p10,
    percentile_cont(0.5) within group (order by luas_m2) as luas_median,
    percentile_cont(0.9) within group (order by luas_m2) as luas_p90,
    percentile_cont(0.5) within group (order by daya_w) as daya_median,
    percentile_cont(0.5) within group (order by tarif_tahunan) as tarif_median,
    percentile_cont(0.9) within group (order by tarif_tahunan) as tarif_p90
  from sewa group by segmen
),
tenant_seg as (
  select segmen, tenant_kunci, mode() within group (order by tenant) as nama,
         count(distinct spbu_id) as spbu,
         row_number() over (partition by segmen order by count(distinct spbu_id) desc, tenant_kunci) as urut
  from sewa where tenant_kunci is not null group by segmen, tenant_kunci
),
prov_seg as (
  select segmen, provinsi, count(*) as lahan,
         row_number() over (partition by segmen order by count(*) desc, provinsi) as urut
  from sewa group by segmen, provinsi
),
total as (select count(distinct spbu_id) as spbu from sewa)
select coalesce(jsonb_agg(jsonb_build_object(
  'segmen', d.segmen, 'lahan', d.lahan, 'spbu', d.spbu, 'tenant', d.tenant,
  'spbu_pct', round(100.0 * d.spbu / total.spbu, 1),
  'lahan_dalam', d.lahan_dalam, 'lahan_luar', d.lahan_luar,
  'luas_p10', d.luas_p10, 'luas_median', d.luas_median, 'luas_p90', d.luas_p90,
  'daya_median', d.daya_median, 'tarif_median', d.tarif_median, 'tarif_p90', d.tarif_p90,
  'tenant_teratas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', public.id_tenant(t.tenant_kunci), 'nama', t.nama, 'spbu', t.spbu) order by t.urut)
      from tenant_seg t where t.segmen = d.segmen and t.urut <= 5), '[]'::jsonb),
  'provinsi_teratas', coalesce((select jsonb_agg(jsonb_build_object('provinsi', p.provinsi, 'lahan', p.lahan) order by p.urut)
      from prov_seg p where p.segmen = d.segmen and p.urut <= 5), '[]'::jsonb),
  'tipe_lokasi', coalesce((select jsonb_agg(jsonb_build_object(
        'tipe_lokasi', a.tipe_lokasi, 'pct_di_tipe', a.pct_di_tipe, 'pct_semua', a.pct_semua,
        'lift', a.lift, 'spbu', a.spbu_dengan_segmen) order by a.lift desc, a.tipe_lokasi)
      from public.m_afinitas_tipe a where a.segmen = d.segmen), '[]'::jsonb)
) order by d.lahan desc), '[]'::jsonb)
from dasar d cross join total
$$;

-- ---------------------------------------------------------------- hak akses

revoke execute on function
  public.kecocokan(text, text, text, text, integer, integer),
  public.daftar_spbu(text, text, text, boolean, text, integer, integer),
  public.playbook()
from public, anon;

grant execute on function
  public.kecocokan(text, text, text, text, integer, integer),
  public.daftar_spbu(text, text, text, boolean, text, integer, integer),
  public.playbook()
to authenticated;

notify pgrst, 'reload schema';
