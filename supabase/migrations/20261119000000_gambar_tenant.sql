-- Foto di halaman Profil tenant.
-- 1. profil_tenant: daftar kontrak kini membawa lahan_id agar tiap baris bisa menampilkan foto lahannya.
-- 2. gambar_tenant: satu foto per lahan yang disewa tenant (foto pertama di Brightspace), yang terbaru dulu.
--    Logo outlet sengaja tidak dipakai sebagai logo tenant: di Brightspace logo sering tidak sama dengan
--    tenant di file master (mis. logo kedai kopi di lahan yang kontraknya atas nama bank).

create or replace function public.profil_tenant(p_id text) returns jsonb
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
                       from (select m.kode, m.lahan_id, m.spbu_id, m.spbu_nomor, m.kota, m.segmen, m.kontrak_akhir, m.tarif_tahunan
                             from milik m where m.kontrak_akhir >= current_date
                             order by m.kontrak_akhir, m.kode limit 10) x), '[]'::jsonb)
) end
$$;

create function public.gambar_tenant(p_id text) returns jsonb
language sql stable set search_path = '' as $$
with
t as (select kunci from public.v_tenant_profil where id = p_id),
milik as (
  select l.lahan_id, l.kode, l.spbu_id, s.nomor as spbu_nomor, s.kota
  from public.lahan l join public.spbu s on s.id = l.spbu_id join t on l.tenant_kunci = t.kunci
  where l.status = 'Tersewa' and not l.duplikat
),
foto as (
  select distinct on (m.spbu_id, m.lahan_id) m.*, g.kunci, g.lebar, g.tinggi, g.diunggah
  from milik m
  join public.gambar g on g.spbu_id = m.spbu_id and g.lahan_id = m.lahan_id and g.jenis = 'lahan'
  order by m.spbu_id, m.lahan_id, g.urutan, g.id
)
select case when not exists (select 1 from t) then null else jsonb_build_object(
  'lahan', (select count(*) from milik),
  'lahan_berfoto', (select count(*) from foto),
  'outlet', coalesce((
    select jsonb_agg(jsonb_build_object(
             'kunci', f.kunci, 'lebar', f.lebar, 'tinggi', f.tinggi, 'label', null, 'diunggah', f.diunggah,
             'keterangan', 'SPBU ' || f.spbu_nomor || coalesce(', ' || f.kota, '') || ' · ' || f.kode
           ) order by f.diunggah desc nulls last, f.kode)
    from (select * from foto order by diunggah desc nulls last, kode limit 60) f
  ), '[]'::jsonb)
) end
$$;

revoke execute on function public.gambar_tenant(text) from public, anon;
grant execute on function public.gambar_tenant(text) to authenticated;

notify pgrst, 'reload schema';
