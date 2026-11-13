-- Bright Match · tahap 1: Profil lokasi, Profil tenant, Mesin kecocokan versi 1
--
-- Semua akses data tahap ini lewat fungsi (RPC) yang mengembalikan jsonb, satu panggilan per halaman.
-- Fungsi berjalan sebagai pemanggil (security invoker), jadi tetap tunduk pada Row Level Security:
-- hanya role `authenticated` yang mendapat data.
--
-- Mesin kecocokan versi 1 hanya memakai data internal. Dari enam komponen skor di rencana,
-- empat sudah bisa dihitung (55 dari 100 poin bobot): bukti dari jaringan, pelengkap bauran,
-- kecocokan harga, dan kesiapan lahan. Tipe lokasi dan permintaan menyusul di versi 2.
-- Bobot dan ambang di bawah adalah usulan awal, untuk dikalibrasi dari hasil pilot.

create index lahan_lahan_id_idx on public.lahan (lahan_id);

-- Nama tenant di file master ditulis tidak seragam ("PT Pertamina Retail", "PT. PERTAMINA RETAIL", ...).
-- Kunci tenant menyamakan huruf besar-kecil dan tanda baca, sehingga 3.645 nama menjadi 3.515 tenant.
alter table public.lahan
  add column tenant_kunci text
  generated always as (nullif(regexp_replace(lower(tenant), '[^a-z0-9]+', '', 'g'), '')) stored;

comment on column public.lahan.tenant_kunci is 'Nama tenant tanpa huruf besar, spasi, dan tanda baca; dipakai untuk mengelompokkan tenant.';

create index lahan_tenant_kunci_idx on public.lahan (tenant_kunci) where tenant_kunci is not null;

-- Jumlah tenant di ringkasan mengikuti kunci yang sama (tenant dengan lahan tersewa).
create or replace view public.v_ringkasan with (security_invoker = true) as
select
  (select count(*) from public.spbu)                                              as spbu,
  count(*)                                                                         as lahan,
  count(*) filter (where status = 'Tersewa')                                       as lahan_tersewa,
  count(*) filter (where status = 'Tersedia')                                      as lahan_kosong,
  round(100.0 * count(*) filter (where status = 'Tersewa') / nullif(count(*), 0), 1) as okupansi_pct,
  count(*) filter (where status = 'Tersedia' and tarif_tahunan is not null)        as kosong_bertarif,
  coalesce(sum(tarif_tahunan) filter (where status = 'Tersedia'), 0)               as potensi_sewa_bertarif,
  count(distinct spbu_id) filter (where status = 'Tersedia')                       as spbu_dengan_kosong,
  count(distinct tenant_kunci) filter (where status = 'Tersewa')                   as tenant
from public.lahan;

-- ---------------------------------------------------------------- fungsi bantu

-- Kelas ukuran lahan, mengikuti format Bright Flex (booth, kios, mini, C-store).
-- Dua fungsi bantu ini sengaja tanpa `set search_path`: isinya ekspresi murni tanpa rujukan ke tabel,
-- sehingga Postgres bisa menyisipkannya langsung ke kueri (jauh lebih cepat untuk puluhan ribu baris).
create function public.kelas_luas(luas numeric) returns text
language sql immutable parallel safe as $$
  select case
    when luas is null or luas <= 0 then null
    when luas < 10 then '< 10 m²'
    when luas < 37 then '10–37 m²'
    when luas < 74 then '37–74 m²'
    else '≥ 74 m²'
  end
$$;

-- Pengenal tenant yang aman untuk alamat web, diturunkan dari kunci tenant.
create function public.id_tenant(kunci text) returns text
language sql immutable parallel safe as $$
  select substr(md5(kunci), 1, 12)
$$;

-- ---------------------------------------------------------------- profil tenant

drop view public.v_tenant;

-- Profil tenant yang diturunkan dari lahan yang sedang disewanya ("preferensi terungkap"):
-- jenis usaha, sebaran, dan kebutuhan lokasi (luas, posisi, daya, tarif yang biasa dibayar).
create view public.v_tenant_profil with (security_invoker = true) as
select
  public.id_tenant(l.tenant_kunci)                                              as id,
  l.tenant_kunci                                                                as kunci,
  mode() within group (order by l.tenant)                                       as nama,
  mode() within group (order by l.segmen)                                       as segmen_utama,
  count(*)                                                                      as lahan,
  count(distinct l.spbu_id)                                                     as spbu,
  count(distinct s.kota)                                                        as kota,
  count(distinct s.provinsi)                                                    as provinsi,
  count(*) filter (where l.posisi = 'Didalam Bangunan')                         as lahan_dalam,
  count(*) filter (where l.posisi = 'Diluar Bangunan')                          as lahan_luar,
  percentile_cont(0.1) within group (order by nullif(l.luas_m2, 0))             as luas_p10,
  percentile_cont(0.5) within group (order by nullif(l.luas_m2, 0))             as luas_median,
  percentile_cont(0.9) within group (order by nullif(l.luas_m2, 0))             as luas_p90,
  percentile_cont(0.5) within group (order by l.daya_w)                         as daya_median,
  percentile_cont(0.5) within group (order by l.tarif_tahunan)                  as tarif_median,
  percentile_cont(0.9) within group (order by l.tarif_tahunan)                  as tarif_p90,
  count(l.tarif_tahunan)                                                        as lahan_bertarif,
  count(*) filter (where l.kontrak_akhir < current_date)                        as kontrak_lewat,
  count(*) filter (where l.kontrak_akhir >= current_date
                     and l.kontrak_akhir < current_date + 90)                   as kontrak_segera,
  min(l.kontrak_akhir) filter (where l.kontrak_akhir >= current_date)           as kontrak_akhir_berikutnya
from public.lahan l
join public.spbu s on s.id = l.spbu_id
where l.tenant_kunci is not null and l.status = 'Tersewa' and not l.duplikat
group by l.tenant_kunci;

-- ---------------------------------------------------------------- mesin kecocokan

-- Inti mesin: menilai pasangan (lahan kosong, tenant).
--   p_lahan_id  → satu lahan terhadap semua tenant yang beroperasi di provinsinya
--   p_tenant_id → satu tenant terhadap semua lahan kosong di provinsi tempat ia beroperasi
-- Salah satu dari keduanya wajib diisi.
--
-- Syarat wajib (pasangan gugur bila jelas tidak memenuhi; data kosong dianggap "perlu dicek"):
--   luas    lahan berada di rentang p10–p90 luas yang dipakai tenant, toleransi 30%
--   posisi  tenant pernah memakai posisi yang sama (dalam atau luar bangunan)
--   daya    daya lahan ≥ 80% median daya yang dipakai tenant
--   tarif   tarif lahan ≤ 125% dari p90 tarif yang dibayar tenant
--   wilayah tenant sudah beroperasi di provinsi lahan, dan belum ada di SPBU itu
--   bukti   jenis usaha tenant sudah dipakai di minimal satu lahan sejenis
--
-- Skor (maksimum 55 poin, lalu diskalakan ke 0–100):
--   jaringan  20  12 × (jumlah lahan sejenis yang disewa jenis usaha tenant ÷ jenis usaha terbanyak)
--                 + 8 × kehadiran tenant (≥ 5 lahan di kota = 1; ≥ 1 = 0,7; ≥ 5 di provinsi = 0,5; lainnya 0,3)
--   pelengkap 15  15 bila jenis usaha tenant belum ada di SPBU itu, 5 bila sudah ada
--   harga     10  10 bila tarif ≤ median tenant; turun linear ke 5 di p90; 2 di atas p90; 5 bila tidak diketahui
--   kesiapan  10  tarif tercantum 3, daya 2, luas 2, fasilitas SPBU tercatat 2, koordinat 1
-- "Lahan sejenis" = lahan tersewa di kota yang sama dengan kelas ukuran dan posisi yang sama;
-- bila kurang dari 10, pembandingnya diperluas ke provinsi.
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
  poin_jaringan numeric, poin_pelengkap numeric, poin_harga numeric, poin_kesiapan numeric,
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
         s.lat is not null as ada_koordinat
  from public.lahan l
  join public.spbu s on s.id = l.spbu_id
  where l.status = 'Tersedia' and not l.duplikat
    and (p_lahan_id is not null or p_tenant_id is not null)
    and (p_lahan_id is null or l.lahan_id = p_lahan_id)
    and (p_provinsi is null or s.provinsi = p_provinsi)
    and (p_kota is null or s.kota = p_kota)
),
ten as materialized (
  select t.* from public.v_tenant_profil t where p_tenant_id is null or t.id = p_tenant_id
),
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
      + p.ada_fasilitas::int * 2 + p.ada_koordinat::int)::numeric as poin_kesiapan
  from pasangan p
  where coalesce(p.luas_ok, true) and coalesce(p.daya_ok, true)
    and coalesce(p.tarif_ok, true) and coalesce(p.posisi_ok, true)
    -- jenis usaha tenant harus terbukti dipakai di lahan sejenis (kecuali pembandingnya memang tidak ada)
    and (p.n_segmen > 0 or p.n_pembanding = 0)
),
peringkat as (
  select n.*,
    round(100 * (n.poin_jaringan + n.poin_pelengkap + n.poin_harga + n.poin_kesiapan) / 55)::int as skor,
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
  u.poin_jaringan, u.poin_pelengkap, u.poin_harga, u.poin_kesiapan,
  u.skor, u.jumlah_kandidat
from urut u
where p_per_segmen is null or u.urut_segmen <= p_per_segmen
order by u.skor desc, u.lahan_di_kota desc, u.tenant_spbu desc, u.tenant, u.lahan_id
limit greatest(1, least(coalesce(p_batas, 20), 200));
end
$$;

-- Jenis usaha yang menyewa lahan sejenis (dasar "jenis usaha yang cocok" untuk satu lahan kosong).
create function public.pembanding_lahan(p_lahan_id text)
returns table (tingkat text, segmen text, n bigint, total bigint, sudah_ada boolean)
language sql stable set search_path = '' as $$
with
lot as (
  select l.spbu_id, l.posisi, public.kelas_luas(l.luas_m2) as kelas, s.kota, s.provinsi
  from public.lahan l join public.spbu s on s.id = l.spbu_id
  where l.lahan_id = p_lahan_id and not l.duplikat
  limit 1
),
sejenis as (
  select l.segmen, s.kota
  from lot
  join public.spbu s on s.provinsi = lot.provinsi
  join public.lahan l on l.spbu_id = s.id
  where l.status = 'Tersewa' and not l.duplikat
    and l.posisi = lot.posisi and public.kelas_luas(l.luas_m2) = lot.kelas
),
pakai_kota as (select (select count(*) from sejenis x, lot where x.kota = lot.kota) >= 10 as ya),
hitung as (
  select x.segmen, count(*) as n
  from sejenis x, lot, pakai_kota
  where not pakai_kota.ya or x.kota = lot.kota
  group by x.segmen
)
select
  case when (select ya from pakai_kota) then 'kota' else 'provinsi' end,
  h.segmen, h.n, (sum(h.n) over ())::bigint,
  exists (select 1 from public.lahan l, lot where l.spbu_id = lot.spbu_id and l.status = 'Tersewa' and l.segmen = h.segmen)
from hitung h
order by h.n desc, h.segmen
$$;

-- ---------------------------------------------------------------- API halaman (jsonb)

-- Daftar provinsi dan kota yang punya lahan, untuk saringan wilayah.
create function public.wilayah() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('provinsi', w.provinsi, 'kota', w.kota) order by w.provinsi), '[]'::jsonb)
  from (
    select s.provinsi, jsonb_agg(distinct s.kota order by s.kota) as kota
    from public.spbu s
    where s.kota is not null and exists (select 1 from public.lahan l where l.spbu_id = s.id)
    group by s.provinsi
  ) w
$$;

-- Daftar SPBU dengan pencarian, saringan wilayah, dan halaman.
create function public.daftar_spbu(
  p_cari text default null, p_provinsi text default null, p_kota text default null,
  p_hanya_kosong boolean default false, p_halaman integer default 1, p_per_halaman integer default 25
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
  select s.id, s.nomor, s.nama, s.alamat, s.kota, s.provinsi,
    coalesce(a.lahan, 0) as lahan, coalesce(a.lahan_kosong, 0) as lahan_kosong,
    coalesce(a.tenant, 0) as tenant, coalesce(a.potensi_sewa_bertarif, 0) as potensi_sewa_bertarif
  from public.spbu s
  left join agg a on a.spbu_id = s.id
  where (p_provinsi is null or s.provinsi = p_provinsi)
    and (p_kota is null or s.kota = p_kota)
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

-- Profil satu SPBU: ringkasan, semua lahannya, lingkungan sekitar, dan bauran jenis usaha di kotanya.
create function public.profil_spbu(p_id text) returns jsonb
language sql stable set search_path = '' as $$
with
s as (select * from public.spbu where id = p_id),
lahan_spbu as (select l.* from public.lahan l where l.spbu_id = p_id and not l.duplikat),
-- berapa persen SPBU di kota yang sama punya tiap jenis usaha
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
      ) order by b.spbu desc, b.segmen) from bauran b), '[]'::jsonb))
) end
$$;

-- Daftar tenant dengan pencarian, saringan jenis usaha dan provinsi, dan halaman.
create function public.daftar_tenant(
  p_cari text default null, p_segmen text default null, p_provinsi text default null,
  p_halaman integer default 1, p_per_halaman integer default 25
) returns jsonb
language sql stable set search_path = '' as $$
with
semua as materialized (select * from public.v_tenant_profil),
cocok as (
  select t.* from semua t
  where (p_segmen is null or t.segmen_utama = p_segmen)
    and (nullif(btrim(p_cari), '') is null or t.nama ilike '%' || btrim(p_cari) || '%')
    and (p_provinsi is null or exists (
      select 1 from public.lahan l join public.spbu s on s.id = l.spbu_id
      where l.tenant_kunci = t.kunci and l.status = 'Tersewa' and s.provinsi = p_provinsi))
),
halaman as (
  select * from cocok
  order by spbu desc, lahan desc, nama
  limit greatest(1, least(coalesce(p_per_halaman, 25), 100))
  offset (greatest(coalesce(p_halaman, 1), 1) - 1) * greatest(1, least(coalesce(p_per_halaman, 25), 100))
)
select jsonb_build_object(
  'total', (select count(*) from cocok),
  'segmen', (select coalesce(jsonb_agg(x.segmen_utama order by x.segmen_utama), '[]'::jsonb)
             from (select distinct segmen_utama from semua) x),
  'baris', coalesce((select jsonb_agg(to_jsonb(h) order by h.spbu desc, h.lahan desc, h.nama) from halaman h), '[]'::jsonb)
)
$$;

-- Profil satu tenant: kebutuhan lokasi turunan, bauran jenis usaha, sebaran, dan kontrak terdekat.
create function public.profil_tenant(p_id text) returns jsonb
language sql stable set search_path = '' as $$
with
t as (select * from public.v_tenant_profil where id = p_id),
milik as (
  select l.*, s.nomor as spbu_nomor, s.kota, s.provinsi
  from public.lahan l join public.spbu s on s.id = l.spbu_id, t
  where l.tenant_kunci = t.kunci and l.status = 'Tersewa' and not l.duplikat
)
select case when not exists (select 1 from t) then null else jsonb_build_object(
  'tenant', (select to_jsonb(t) from t),
  'segmen', coalesce((select jsonb_agg(jsonb_build_object('segmen', x.segmen, 'lahan', x.n) order by x.n desc, x.segmen)
                      from (select segmen, count(*) as n from milik group by segmen) x), '[]'::jsonb),
  'provinsi', coalesce((select jsonb_agg(jsonb_build_object('provinsi', x.provinsi, 'lahan', x.n, 'spbu', x.spbu, 'kota', x.kota)
                          order by x.n desc, x.provinsi)
                        from (select provinsi, count(*) as n, count(distinct spbu_id) as spbu, count(distinct kota) as kota
                              from milik group by provinsi) x), '[]'::jsonb),
  'kota', coalesce((select jsonb_agg(to_jsonb(x) order by x.lahan desc, x.kota)
                    from (select kota, provinsi, count(*) as lahan from milik group by kota, provinsi
                          order by count(*) desc, kota limit 10) x), '[]'::jsonb),
  'kontrak', coalesce((select jsonb_agg(to_jsonb(x) order by x.kontrak_akhir, x.kode)
                       from (select m.kode, m.spbu_id, m.spbu_nomor, m.kota, m.segmen, m.kontrak_akhir, m.tarif_tahunan
                             from milik m where m.kontrak_akhir >= current_date
                             order by m.kontrak_akhir, m.kode limit 10) x), '[]'::jsonb)
) end
$$;

-- Daftar lahan kosong untuk dipilih di Mesin kecocokan.
create function public.daftar_lahan_kosong(
  p_provinsi text default null, p_kota text default null,
  p_halaman integer default 1, p_per_halaman integer default 25
) returns jsonb
language sql stable set search_path = '' as $$
with
cocok as (
  select l.lahan_id, l.kode, l.spbu_id, s.nomor as spbu_nomor, s.kota, s.provinsi,
         nullif(l.luas_m2, 0) as luas_m2, l.daya_w, l.tarif_tahunan, l.posisi, l.lantai
  from public.lahan l join public.spbu s on s.id = l.spbu_id
  where l.status = 'Tersedia' and not l.duplikat
    and (p_provinsi is null or s.provinsi = p_provinsi)
    and (p_kota is null or s.kota = p_kota)
),
halaman as (
  select * from cocok
  order by tarif_tahunan desc nulls last, kode
  limit greatest(1, least(coalesce(p_per_halaman, 25), 100))
  offset (greatest(coalesce(p_halaman, 1), 1) - 1) * greatest(1, least(coalesce(p_per_halaman, 25), 100))
)
select jsonb_build_object(
  'total', (select count(*) from cocok),
  'baris', coalesce((select jsonb_agg(to_jsonb(h) order by h.tarif_tahunan desc nulls last, h.kode) from halaman h), '[]'::jsonb)
)
$$;

-- Kartu rekomendasi satu lahan kosong: jenis usaha yang cocok dan tenant terbaik per jenis usaha.
create function public.kecocokan_lahan(p_lahan_id text) returns jsonb
language sql stable set search_path = '' as $$
with
lot as (
  select l.lahan_id, l.kode, l.spbu_id, s.nomor as spbu_nomor, s.alamat, s.kota, s.provinsi,
         nullif(l.luas_m2, 0) as luas_m2, l.daya_w, l.tarif_tahunan, l.posisi, l.lantai, l.deskripsi,
         public.kelas_luas(l.luas_m2) as kelas
  from public.lahan l join public.spbu s on s.id = l.spbu_id
  where l.lahan_id = p_lahan_id and l.status = 'Tersedia' and not l.duplikat
  limit 1
)
select case when not exists (select 1 from lot) then null else jsonb_build_object(
  'lahan', (select to_jsonb(lot) from lot),
  'jenis_usaha', coalesce((select jsonb_agg(to_jsonb(j) order by j.n desc, j.segmen)
                           from public.pembanding_lahan(p_lahan_id) j), '[]'::jsonb),
  'tenant', coalesce((select jsonb_agg(to_jsonb(k) order by k.skor desc, k.lahan_di_kota desc, k.tenant_spbu desc, k.tenant)
                      from public.kecocokan(p_lahan_id => p_lahan_id, p_per_segmen => 5, p_batas => 40) k), '[]'::jsonb)
) end
$$;

-- Lahan kosong yang cocok untuk satu tenant, dengan saringan wilayah.
create function public.kecocokan_tenant(
  p_tenant_id text, p_provinsi text default null, p_kota text default null
) returns jsonb
language sql stable set search_path = '' as $$
with t as (select * from public.v_tenant_profil where id = p_tenant_id)
select case when not exists (select 1 from t) then null else jsonb_build_object(
  'tenant', (select to_jsonb(t) from t),
  'wilayah', coalesce((select jsonb_agg(jsonb_build_object('provinsi', x.provinsi, 'kota', x.kota) order by x.provinsi)
                       from (select s.provinsi, jsonb_agg(distinct s.kota order by s.kota) as kota
                             from public.lahan l join public.spbu s on s.id = l.spbu_id, t
                             where l.tenant_kunci = t.kunci and l.status = 'Tersewa' and s.kota is not null
                             group by s.provinsi) x), '[]'::jsonb),
  'lahan', coalesce((select jsonb_agg(to_jsonb(k) order by k.skor desc, k.lahan_di_kota desc, k.lahan_id)
                     from public.kecocokan(p_tenant_id => p_tenant_id, p_provinsi => p_provinsi,
                                           p_kota => p_kota, p_batas => 50) k), '[]'::jsonb)
) end
$$;

-- ---------------------------------------------------------------- hak akses

revoke all on public.v_tenant_profil from anon;
grant select on public.v_tenant_profil to authenticated;

revoke execute on function
  public.kelas_luas(numeric), public.id_tenant(text),
  public.kecocokan(text, text, text, text, integer, integer), public.pembanding_lahan(text),
  public.wilayah(), public.daftar_spbu(text, text, text, boolean, integer, integer), public.profil_spbu(text),
  public.daftar_tenant(text, text, text, integer, integer), public.profil_tenant(text),
  public.daftar_lahan_kosong(text, text, integer, integer),
  public.kecocokan_lahan(text), public.kecocokan_tenant(text, text, text)
from public, anon;

grant execute on function
  public.kelas_luas(numeric), public.id_tenant(text),
  public.kecocokan(text, text, text, text, integer, integer), public.pembanding_lahan(text),
  public.wilayah(), public.daftar_spbu(text, text, text, boolean, integer, integer), public.profil_spbu(text),
  public.daftar_tenant(text, text, text, integer, integer), public.profil_tenant(text),
  public.daftar_lahan_kosong(text, text, integer, integer),
  public.kecocokan_lahan(text), public.kecocokan_tenant(text, text, text)
to authenticated;

-- Minta API Supabase memuat ulang daftar fungsi.
notify pgrst, 'reload schema';
