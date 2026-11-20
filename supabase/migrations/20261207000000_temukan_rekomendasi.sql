-- Temukan peluang, fase B: rekomendasi dari preferensi.
-- 1. Mesin kecocokan tetap satu. Fungsi kecocokan() mendapat satu parameter baru, p_profil: kebutuhan yang
--    dinyatakan pengunjung, diperlakukan persis seperti calon tenant tetapi tanpa baris calon_tenant.
--    Bobot dan rumus skor tidak berubah (versi model tetap). Keluaran untuk pemanggilan lama sudah dibandingkan
--    sebelum dan sesudah migrasi ini dan identik.
-- 2. Lima lapis: syarat wajib (di mesin), skor kecocokan (di mesin), kesesuaian preferensi (di aplikasi,
--    src/lib/temukan/rekomendasi.ts), keyakinan data (fungsi keyakinan_data_inti yang sudah ada), keputusan manusia.
-- 3. Yang dibuka untuk umum: ruang kosong yang tidak ditahan, tidak disengketakan, dan tidak sedang menuju kontrak
--    dengan pihak lain. Tanpa nama penyewa, tanpa nilai kontrak. Tarif yang tampil adalah tarif acuan Brightspace.
-- 4. Pengelola SPBU yang belum dipastikan wewenangnya hanya melihat jenis usaha dan jumlah calon. Profil calon
--    (tetap tanpa nama) baru tampil untuk akun yang wewenangnya atas SPBU itu tercatat.

drop function public.kecocokan(text, text, text, text, integer, integer, uuid);

create function public.kecocokan(p_lahan_id text DEFAULT NULL::text, p_tenant_id text DEFAULT NULL::text, p_provinsi text DEFAULT NULL::text, p_kota text DEFAULT NULL::text, p_per_segmen integer DEFAULT NULL::integer, p_batas integer DEFAULT 20, p_calon_id uuid DEFAULT NULL::uuid, p_profil jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(lahan_id text, kode text, spbu_id text, spbu_nomor text, kota text, provinsi text, luas_m2 numeric, daya_w numeric, tarif_tahunan numeric, posisi text, lantai text, tenant_id text, tenant text, segmen text, tenant_lahan bigint, tenant_spbu bigint, lahan_di_kota bigint, lahan_di_provinsi bigint, tingkat text, n_segmen bigint, n_pembanding bigint, segmen_sudah_ada boolean, luas_ok boolean, daya_ok boolean, tarif_ok boolean, tenant_luas_p10 double precision, tenant_luas_p90 double precision, tenant_tarif_median double precision, tenant_tarif_p90 double precision, tipe_lokasi text, lift_tipe numeric, pct_di_tipe numeric, pct_semua numeric, penduduk_3km numeric, poi_1km integer, sejenis_500m integer, poin_jaringan numeric, poin_pelengkap numeric, poin_harga numeric, poin_kesiapan numeric, poin_tipe numeric, poin_permintaan numeric, skor integer, jumlah_kandidat bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
 SET plan_cache_mode TO 'force_custom_plan'
 SET enable_nestloop TO 'off'
AS $function$
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
    and (p_lahan_id is not null or p_tenant_id is not null or p_calon_id is not null or p_profil is not null)
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
  where p_calon_id is null and p_profil is null and (p_tenant_id is null or t.id = p_tenant_id)
  union all
  select c.id::text, 'calon:' || c.id::text, c.nama_usaha, c.segmen, 0::bigint, 0::bigint,
         (c.posisi in ('dalam', 'bebas'))::int::bigint, (c.posisi in ('luar', 'bebas'))::int::bigint,
         c.luas_min::float8, c.luas_maks::float8, c.daya_min::float8,
         (c.anggaran_tahunan * 0.8)::float8, c.anggaran_tahunan::float8,
         1::float8, 1::float8, 1::float8, 1::float8
  from public.calon_tenant c
  where c.id = p_calon_id
  union all
  -- Profil sementara dari Temukan peluang: kebutuhan yang dinyatakan pengunjung, tanpa baris calon_tenant.
  -- Diperlakukan persis seperti calon tenant. Satu-satunya beda: anggaran yang dinyatakan fleksibel mendapat
  -- toleransi tarif 1,25, sama dengan toleransi tenant eksisting.
  select 'profil', 'profil:', coalesce(nullif(p_profil ->> 'nama', ''), 'Usaha Anda'), p_profil ->> 'segmen', 0::bigint, 0::bigint,
         (coalesce(p_profil ->> 'posisi', 'bebas') in ('dalam', 'bebas'))::int::bigint,
         (coalesce(p_profil ->> 'posisi', 'bebas') in ('luar', 'bebas'))::int::bigint,
         (p_profil ->> 'luas_min')::float8, (p_profil ->> 'luas_maks')::float8, (p_profil ->> 'daya_min')::float8,
         (p_profil ->> 'anggaran')::float8 * 0.8, (p_profil ->> 'anggaran')::float8,
         1::float8, 1::float8, 1::float8,
         case when coalesce((p_profil ->> 'anggaran_fleksibel')::boolean, false) then 1.25 else 1 end::float8
  where p_profil is not null and p_calon_id is null and p_tenant_id is null
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
  union all
  -- profil sementara: wilayahnya adalah provinsi yang disebut (semua bila kosong)
  select 'profil:', w.provinsi, 0::bigint
  from (select distinct s.provinsi from public.spbu s
        where coalesce(jsonb_array_length(p_profil -> 'provinsi'), 0) = 0
           or s.provinsi in (select jsonb_array_elements_text(p_profil -> 'provinsi'))) w
  where p_profil is not null and p_calon_id is null and p_tenant_id is null
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
-- Profil sementara boleh meminta semua kandidat: penyaringan wilayah per kota dan pengurutan preferensi dilakukan pemanggilnya.
limit greatest(1, least(coalesce(p_batas, 20), case when p_profil is null then 200 else 6000 end));
end
$function$;

revoke execute on function public.kecocokan(text, text, text, text, integer, integer, uuid, jsonb) from public, anon;
grant execute on function public.kecocokan(text, text, text, text, integer, integer, uuid, jsonb) to authenticated;

-- ================================================================ pembantu

-- Angka dari teks kiriman umum: null bila bukan angka atau di luar batas. Tidak pernah melempar galat.
create function public.temukan_angka(p_teks text, p_min numeric, p_maks numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case when p_teks ~ '^[0-9]{1,13}(\.[0-9]{1,4})?$' and p_teks::numeric between p_min and p_maks then p_teks::numeric end
$$;
revoke execute on function public.temukan_angka(text, numeric, numeric) from public, anon, authenticated;

-- Ruang yang boleh tampil untuk umum: kosong, tidak ganda, tidak ditahan, tidak disengketakan,
-- dan tidak sedang menuju kontrak dengan pihak lain; beserta tanda terverifikasi di lokasi.
-- Aturannya sama dengan v_status_lahan, tetapi dihitung sekaligus untuk banyak ruang: view itu menilai tiap ruang
-- satu per satu dan butuh beberapa detik untuk seluruh jaringan. Kesamaannya dijaga uji supabase/tests/temukan_rekomendasi.sql.
-- enable_nestloop = off di fungsi-fungsi berkas ini: tabel antaranya tanpa statistik, sama seperti di kecocokan().
create function public.temukan_ruang_tampil(p_spbu_id text default null) returns table (lahan_id text, spbu_id text, terverifikasi boolean, kesiapan text)
language sql stable set search_path = '' set enable_nestloop = off as $$
  with sengketa as materialized (
    select distinct u.lahan_id
    from public.masalah_data m cross join lateral unnest(m.lahan_ids) u (lahan_id)
    where m.tingkat = 'kritis' and m.status in ('terbuka', 'ditinjau')
  ),
  menuju as materialized (
    select distinct p.lahan_id from public.peluang p where p.tahap in ('persetujuan', 'kontrak', 'aktivasi', 'pemantauan')
  )
  select l.lahan_id, l.spbu_id, x.sah,
         case when x.sah then coalesce(s.kesiapan, 'belum_diketahui') else 'belum_diketahui' end
  from public.lahan l
  left join public.status_lahan s on s.spbu_id = l.spbu_id and s.lahan_id = l.lahan_id
  cross join lateral (
    select case when s.status_data = 'terverifikasi' then coalesce(s.sidik_sumber = public.sidik_lahan(l), false) else false end as sah) x
  where l.status = 'Tersedia' and not l.duplikat
    and (p_spbu_id is null or l.spbu_id = p_spbu_id)
    and coalesce(s.status_ruang, 'tersedia') = 'tersedia'
    and not exists (select 1 from sengketa k where k.lahan_id = l.lahan_id)
    and not exists (select 1 from menuju k where k.lahan_id = l.lahan_id)
$$;
revoke execute on function public.temukan_ruang_tampil(text) from public, anon, authenticated;

create function public.temukan_sumber() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kunci', s.kunci, 'nama', s.nama, 'per_tanggal', s.per_tanggal) order by s.kunci), '[]'::jsonb)
  from public.sumber_data s
$$;
revoke execute on function public.temukan_sumber() from public, anon, authenticated;

-- ================================================================ tenant: lokasi yang memenuhi syarat

-- p: { segmen: [..], wilayah: [{provinsi, kota}], lain, luas_min, daya_min, anggaran, anggaran_fleksibel, posisi,
--      batas, hanya_jumlah }. Wilayah kosong = terbuka di semua wilayah. Mengembalikan paling banyak 300 lokasi
-- teratas menurut skor mesin; pengurutan menurut preferensi dilakukan aplikasi di atas daftar itu.
create function public.temukan_lokasi(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' set statement_timeout = '15s' set enable_nestloop = off as $$
#variable_conflict use_column
declare
  v_p        jsonb := case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end;
  v_segmen   text[];
  v_wilayah  jsonb;
  v_terbuka  boolean;
  v_lain     boolean;
  v_batas    integer;
  v_profil   jsonb;
  v_hasil    jsonb;
begin
  select array_agg(x) into v_segmen
  from (select distinct x from jsonb_array_elements_text(case when jsonb_typeof(v_p -> 'segmen') = 'array' then v_p -> 'segmen' else '[]'::jsonb end) x
        where x = any (public.segmen_calon()) limit 2) q;
  if v_segmen is null then
    return jsonb_build_object('ok', false, 'pesan', 'Jenis usaha tidak dikenal.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('provinsi', w ->> 'provinsi', 'kota', nullif(w ->> 'kota', ''))), '[]'::jsonb) into v_wilayah
  from (select w from jsonb_array_elements(case when jsonb_typeof(v_p -> 'wilayah') = 'array' then v_p -> 'wilayah' else '[]'::jsonb end) w
        where jsonb_typeof(w) = 'object' and exists (select 1 from public.spbu s where s.provinsi = w ->> 'provinsi') limit 10) q;
  v_terbuka := jsonb_array_length(v_wilayah) = 0;
  v_lain := not v_terbuka and v_p -> 'lain' = 'true'::jsonb;
  v_batas := coalesce(public.temukan_angka(v_p ->> 'batas', 1, 300), 300)::integer;

  v_profil := jsonb_strip_nulls(jsonb_build_object(
    'posisi', case when v_p ->> 'posisi' in ('dalam', 'luar') then v_p ->> 'posisi' else 'bebas' end,
    'luas_min', public.temukan_angka(v_p ->> 'luas_min', 0.01, 100000),
    'daya_min', public.temukan_angka(v_p ->> 'daya_min', 1, 5000000),
    'anggaran', public.temukan_angka(v_p ->> 'anggaran', 100000, 100000000000),
    'anggaran_fleksibel', v_p -> 'anggaran_fleksibel' = 'true'::jsonb,
    -- Mesin hanya menilai provinsi yang diminta, kecuali wilayah lain boleh disarankan.
    'provinsi', case when v_terbuka or v_lain then '[]'::jsonb
                     else (select jsonb_agg(distinct w ->> 'provinsi') from jsonb_array_elements(v_wilayah) w) end));

  with dasar as materialized (
    select k.*
    from unnest(v_segmen) s
    cross join lateral public.kecocokan(p_profil => v_profil || jsonb_build_object('segmen', s), p_batas => 6000) k
  ),
  -- Dua segmen (kartu yang belum dipersempit): tiap ruang memakai segmen dengan skor tertinggi.
  terbaik as materialized (
    select distinct on (d.lahan_id) d.* from dasar d order by d.lahan_id, d.skor desc, d.segmen
  ),
  wil as materialized (
    select t.*,
           v_terbuka or exists (select 1 from jsonb_array_elements(v_wilayah) w
                                where w ->> 'provinsi' = t.provinsi and (w ->> 'kota' is null or w ->> 'kota' = t.kota)) as di_wilayah
    from terbaik t
  ),
  tampil as materialized (select * from public.temukan_ruang_tampil()),
  tanda as materialized (
    select x.*, coalesce(r.terverifikasi, false) as terverifikasi, r.kesiapan, r.lahan_id is null as tertahan
    from wil x
    left join tampil r on r.spbu_id = x.spbu_id and r.lahan_id = x.lahan_id
    where x.di_wilayah or v_lain
  ),
  layak as materialized (select * from tanda x where not x.tertahan)
  select jsonb_build_object(
    'ok', true,
    'versi_model', public.versi_model_kecocokan(),
    'sumber', public.temukan_sumber(),
    'jumlah', (select count(*) from layak x where x.di_wilayah),
    'jumlah_lain', (select count(*) from layak x where not x.di_wilayah),
    'tertahan', (select count(*) from tanda x where x.tertahan and x.di_wilayah),
    'lokasi', case when v_p -> 'hanya_jumlah' = 'true'::jsonb then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(z) order by z.di_wilayah desc, z.skor desc, z.lahan_id)
      from (
        select x.lahan_id, x.kode, x.spbu_nomor, s.alamat, x.kota, x.provinsi, s.lat, s.lng, to_jsonb(s.fasilitas) as fasilitas,
               x.luas_m2, x.daya_w, x.tarif_tahunan, x.posisi, x.lantai, x.segmen,
               x.tingkat, x.n_segmen, x.n_pembanding, x.segmen_sudah_ada, x.luas_ok, x.daya_ok, x.tarif_ok,
               x.tipe_lokasi, x.lift_tipe, x.pct_di_tipe, x.pct_semua, x.penduduk_3km, x.poi_1km, x.sejenis_500m,
               x.poin_jaringan, x.poin_pelengkap, x.poin_harga, x.poin_kesiapan, x.poin_tipe, x.poin_permintaan, x.skor,
               x.terverifikasi, x.kesiapan, x.di_wilayah
        from layak x join public.spbu s on s.id = x.spbu_id
        order by x.di_wilayah desc, x.skor desc, x.lahan_id
        limit v_batas
      ) z), '[]'::jsonb) end
  ) into v_hasil;
  return v_hasil;
end
$$;

-- Keyakinan data untuk ruang yang sedang ditampilkan (paling banyak 24), memakai aturan yang sama dengan tim NFR.
create function public.temukan_keyakinan(p_lahan_ids text[]) returns jsonb
language sql stable security definer set search_path = '' set enable_nestloop = off as $$
  select coalesce(jsonb_object_agg(r.lahan_id, public.keyakinan_data_inti(r.lahan_id)), '{}'::jsonb)
  from public.temukan_ruang_tampil() r
  where r.lahan_id = any ((coalesce(p_lahan_ids, '{}'))[1:24])
$$;

-- ================================================================ pengelola SPBU: jenis usaha dan calon untuk tiap ruang

-- Paling banyak enam ruang per panggilan (tiap ruang satu kali hitung mesin). p_lahan_ids kosong = semua ruang yang boleh tampil.
create function public.temukan_peluang_spbu(p_spbu_id text, p_lahan_ids text[] default null) returns jsonb
language plpgsql stable security definer set search_path = '' set statement_timeout = '20s' set enable_nestloop = off as $$
#variable_conflict use_column
declare
  v_spbu       public.spbu;
  v_semua      text[];
  v_ruang      text[];
  v_berwenang  boolean := public.dealer_kelola_spbu(p_spbu_id);
  v_hasil      jsonb;
begin
  select * into v_spbu from public.spbu s where s.id = left(coalesce(p_spbu_id, ''), 80);
  if v_spbu.id is null then
    return null;
  end if;
  select coalesce(array_agg(l.lahan_id order by l.kode), '{}') into v_semua
  from public.temukan_ruang_tampil(v_spbu.id) r
  join public.lahan l on l.spbu_id = r.spbu_id and l.lahan_id = r.lahan_id and not l.duplikat
  where p_lahan_ids is null or cardinality(p_lahan_ids) = 0 or r.lahan_id = any (p_lahan_ids);
  v_ruang := v_semua[1:6];

  with pasangan as materialized (
    select k.* from unnest(v_ruang) r cross join lateral public.kecocokan(p_lahan_id => r, p_batas => 200) k
  ),
  urut as materialized (
    select x.*, row_number() over (partition by x.lahan_id, x.segmen order by x.skor desc, x.tenant_spbu desc, x.tenant_id) as ke,
           count(*) over (partition by x.lahan_id, x.segmen) as jumlah_calon
    from pasangan x
  )
  select jsonb_build_object(
    'spbu', jsonb_build_object('id', v_spbu.id, 'nomor', v_spbu.nomor, 'alamat', v_spbu.alamat, 'kota', v_spbu.kota, 'provinsi', v_spbu.provinsi,
                               'tipe_lokasi', (select e.tipe_lokasi from public.spbu_lingkungan e where e.spbu_id = v_spbu.id)),
    'berwenang', v_berwenang,
    'versi_model', public.versi_model_kecocokan(),
    'sumber', public.temukan_sumber(),
    'ruang_lain', greatest(cardinality(v_semua) - 6, 0),
    'ruang', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lahan_id', l.lahan_id, 'kode', l.kode, 'luas_m2', nullif(l.luas_m2, 0), 'posisi', l.posisi, 'lantai', l.lantai, 'daya_w', l.daya_w,
        'terverifikasi', r.terverifikasi,
        'kategori', coalesce((
          select jsonb_agg(jsonb_build_object(
            'segmen', u.segmen, 'skor', u.skor, 'jumlah_calon', u.jumlah_calon,
            'tingkat', u.tingkat, 'n_segmen', u.n_segmen, 'n_pembanding', u.n_pembanding, 'segmen_sudah_ada', u.segmen_sudah_ada,
            'tipe_lokasi', u.tipe_lokasi, 'lift_tipe', u.lift_tipe, 'pct_di_tipe', u.pct_di_tipe, 'pct_semua', u.pct_semua,
            'penduduk_3km', u.penduduk_3km, 'poi_1km', u.poi_1km, 'sejenis_500m', u.sejenis_500m,
            'poin_tipe', u.poin_tipe, 'poin_permintaan', u.poin_permintaan, 'poin_pelengkap', u.poin_pelengkap,
            -- Profil calon tanpa nama, hanya untuk akun yang wewenangnya atas SPBU ini tercatat.
            'calon', case when v_berwenang then (
              select jsonb_agg(jsonb_build_object(
                'skor', c.skor,
                'skala', case when c.tenant_spbu >= 50 then 'besar' when c.tenant_spbu >= 10 then 'menengah' else 'kecil' end,
                'di_kota', c.lahan_di_kota > 0, 'di_provinsi', c.lahan_di_provinsi > 0,
                'luas_ok', c.luas_ok, 'daya_ok', c.daya_ok, 'tarif_ok', c.tarif_ok,
                'poin_jaringan', c.poin_jaringan, 'poin_harga', c.poin_harga) order by c.ke)
              from urut c where c.lahan_id = u.lahan_id and c.segmen = u.segmen and c.ke <= 5) end
          ) order by u.skor desc, u.segmen)
          from urut u where u.lahan_id = l.lahan_id and u.ke = 1), '[]'::jsonb)
      ) order by l.kode)
      from unnest(v_ruang) q
      join public.lahan l on l.spbu_id = v_spbu.id and l.lahan_id = q and not l.duplikat
      join public.temukan_ruang_tampil(v_spbu.id) r on r.lahan_id = l.lahan_id), '[]'::jsonb)
  ) into v_hasil;
  return v_hasil;
end
$$;

revoke execute on function public.temukan_lokasi(jsonb), public.temukan_keyakinan(text[]), public.temukan_peluang_spbu(text, text[]) from public;
grant execute on function public.temukan_lokasi(jsonb), public.temukan_keyakinan(text[]), public.temukan_peluang_spbu(text, text[]) to anon, authenticated;

notify pgrst, 'reload schema';
