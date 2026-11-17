-- Penjelajah lokasi untuk tenant.
-- 1. Tertutup secara bawaan. Admin NFR membuka provinsi tertentu untuk satu organisasi tenant (akses_jelajah).
-- 2. Tenant hanya melihat ruang yang boleh ditawarkan resmi: kosong di sumber, tidak ditahan, datanya terverifikasi
--    di lokasi, dan tidak sedang menuju kontrak dengan pihak lain. Tanpa tarif, tanpa nama penyewa, tanpa nilai kontrak.
-- 3. Tenant bisa menyatakan minat pada satu ruang. Minat tidak mengikat dan tidak membuat peluang; tim NFR yang menindaklanjuti.

create table public.akses_jelajah (
  organisasi_id  uuid not null references public.organisasi (id) on delete cascade,
  provinsi       text not null,
  dibuka         timestamptz not null default now(),
  dibuka_oleh    text,
  primary key (organisasi_id, provinsi)
);
comment on table public.akses_jelajah is 'Provinsi yang dibuka admin NFR untuk dijelajahi satu organisasi tenant. Tanpa baris = tidak melihat apa pun.';

create table public.minat_lokasi (
  id              uuid primary key default gen_random_uuid(),
  organisasi_id   uuid not null references public.organisasi (id) on delete cascade,
  spbu_id         text not null,                       -- tanpa foreign key: bertahan saat data dimuat ulang
  lahan_id        text not null,
  lahan_kode      text not null,
  spbu_nomor      text not null,
  catatan         text,
  status          text not null default 'baru' check (status in ('baru', 'ditindaklanjuti', 'ditutup')),
  dibuat          timestamptz not null default now(),
  dibuat_oleh     text,
  ditangani       timestamptz,
  ditangani_oleh  text,
  catatan_nfr     text                                  -- catatan internal NFR; tidak terlihat tenant
);
create unique index minat_lokasi_satu_baru on public.minat_lokasi (organisasi_id, lahan_id) where status = 'baru';
create index minat_lokasi_status_idx on public.minat_lokasi (status, dibuat desc);
comment on table public.minat_lokasi is 'Minat tenant pada satu ruang dari penjelajah lokasi. Tidak mengikat dan tidak membuat peluang.';

alter table public.akses_jelajah enable row level security;
alter table public.minat_lokasi enable row level security;
create policy "Tim NFR membaca akses jelajah" on public.akses_jelajah for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca minat lokasi" on public.minat_lokasi for select to authenticated using ((select public.adalah_nfr()));
revoke all on public.akses_jelajah, public.minat_lokasi from anon, authenticated;
grant select on public.akses_jelajah, public.minat_lokasi to authenticated;

-- Ruang yang boleh ditawarkan resmi dan tidak sedang menuju kontrak. Satu sumber aturan untuk penjelajah dan untuk minat.
-- Dimulai dari status_lahan yang terverifikasi (sedikit), baru dicocokkan dengan aturan lengkap di v_status_lahan.
create function public.lahan_layak_jelajah() returns table (lahan_id text, spbu_id text, kesiapan text)
language sql stable set search_path = '' as $$
  select v.lahan_id, v.spbu_id, v.kesiapan
  from (select s.lahan_id from public.status_lahan s where s.status_data = 'terverifikasi') c
  join public.v_status_lahan v on v.lahan_id = c.lahan_id
  where v.status_sumber = 'Tersedia' and v.status_ruang = 'tersedia' and v.status_data = 'terverifikasi'
    and not exists (select 1 from public.peluang p
                    where p.lahan_id = v.lahan_id and p.tahap in ('persetujuan', 'kontrak', 'aktivasi', 'pemantauan'))
$$;
revoke execute on function public.lahan_layak_jelajah() from public, anon, authenticated;

-- Organisasi tenant pengguna yang sedang masuk (satu akun, satu organisasi tenant).
create function public.organisasi_tenant_saya() returns uuid
language sql stable security definer set search_path = '' as $$
  select k.organisasi_id from public.keanggotaan k join public.organisasi o on o.id = k.organisasi_id
  where k.user_id = auth.uid() and o.jenis = 'tenant' order by o.nama limit 1
$$;

-- ================================================================ admin NFR: membuka wilayah

create function public.jelajah_atur(p_organisasi_id uuid, p_provinsi text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o         public.organisasi;
  v_baru    text[];
  v_lama    text[];
begin
  if coalesce(public.peran_nfr(), '') <> 'nfr_admin' then
    return jsonb_build_object('ok', false, 'pesan', 'Wilayah penjelajah dibuka admin NFR.');
  end if;
  select * into o from public.organisasi where id = p_organisasi_id;
  if o.id is null or o.jenis <> 'tenant' then
    return jsonb_build_object('ok', false, 'pesan', 'Penjelajah lokasi hanya untuk organisasi tenant.');
  end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_baru from unnest(coalesce(p_provinsi, '{}')) x where btrim(coalesce(x, '')) <> '';
  if exists (select 1 from unnest(v_baru) x where not exists (select 1 from public.spbu s where s.provinsi = x)) then
    return jsonb_build_object('ok', false, 'pesan', 'Ada provinsi yang tidak dikenal. Muat ulang halaman lalu coba lagi.');
  end if;
  select coalesce(array_agg(a.provinsi order by a.provinsi), '{}') into v_lama from public.akses_jelajah a where a.organisasi_id = p_organisasi_id;
  if v_lama = v_baru then
    return jsonb_build_object('ok', true, 'pesan', 'Tidak ada yang berubah.');
  end if;
  delete from public.akses_jelajah where organisasi_id = p_organisasi_id and provinsi <> all (v_baru);
  insert into public.akses_jelajah (organisasi_id, provinsi, dibuka_oleh)
  select p_organisasi_id, x, public.email_saya() from unnest(v_baru) x on conflict do nothing;
  perform public.audit_catat('akses_jelajah_diubah', 'organisasi', p_organisasi_id::text, jsonb_build_object('nama', o.nama, 'sebelum', v_lama, 'sesudah', v_baru));
  return jsonb_build_object('ok', true, 'pesan',
    case when cardinality(v_baru) = 0 then 'Penjelajah lokasi ditutup untuk organisasi ini.'
         else format('Penjelajah lokasi dibuka untuk %s provinsi.', cardinality(v_baru)) end);
end
$$;

-- Provinsi yang bisa dibuka, dengan jumlah ruang yang saat ini layak tampil di penjelajah.
create function public.jelajah_pilihan() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.adalah_nfr() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('provinsi', x.provinsi, 'layak', x.layak) order by x.provinsi)
    from (select s.provinsi, count(l.lahan_id) as layak
          from public.spbu s left join public.lahan_layak_jelajah() l on l.spbu_id = s.id
          where s.provinsi is not null group by s.provinsi) x), '[]'::jsonb) end
$$;

create or replace function public.organisasi_daftar() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'nama', o.nama, 'jenis', o.jenis, 'demo', o.demo,
           'anggota', coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'peran', k.peran) order by u.email)
                                from public.keanggotaan k join auth.users u on u.id = k.user_id
                                where k.organisasi_id = o.id), '[]'::jsonb),
           'peluang', (select count(*) from public.peluang p where p.organisasi_tenant = o.id),
           'jelajah', coalesce((select jsonb_agg(a.provinsi order by a.provinsi) from public.akses_jelajah a where a.organisasi_id = o.id), '[]'::jsonb))
         order by case o.jenis when 'nfr' then 1 when 'tenant' then 2 else 3 end, o.nama), '[]'::jsonb)
  from public.organisasi o
  where public.adalah_nfr()
$$;

-- ================================================================ tenant: menjelajah dan menyatakan minat

create function public.tenant_jelajah(
  p_provinsi text default null, p_kota text default null, p_luas_min numeric default null, p_posisi text default null, p_halaman integer default 1
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org      uuid := public.organisasi_tenant_saya();
  v_akses    text[];
  v_per      constant integer := 12;
  v_halaman  integer := greatest(coalesce(p_halaman, 1), 1);
  v_hasil    jsonb;
begin
  if v_org is null then
    return jsonb_build_object('akses', '[]'::jsonb, 'total', 0, 'halaman', 1, 'per_halaman', v_per, 'kota', '[]'::jsonb, 'lokasi', '[]'::jsonb);
  end if;
  select coalesce(array_agg(a.provinsi order by a.provinsi), '{}') into v_akses from public.akses_jelajah a where a.organisasi_id = v_org;

  with layak as materialized (
    select y.lahan_id, y.spbu_id, y.kesiapan, l.kode, nullif(l.luas_m2, 0) as luas_m2, l.posisi, l.lantai, l.daya_w,
           s.nomor, s.alamat, s.kota, s.provinsi, s.fasilitas
    from public.lahan_layak_jelajah() y
    join public.lahan l on l.spbu_id = y.spbu_id and l.lahan_id = y.lahan_id and not l.duplikat
    join public.spbu s on s.id = y.spbu_id
    where s.provinsi = any (v_akses)
  ), saring as (
    select * from layak x
    where (nullif(p_provinsi, '') is null or x.provinsi = p_provinsi)
      and (nullif(p_kota, '') is null or x.kota = p_kota)
      and (p_luas_min is null or x.luas_m2 >= p_luas_min)
      and (nullif(p_posisi, '') is null or x.posisi = p_posisi)
  )
  select jsonb_build_object(
    'akses', to_jsonb(v_akses),
    'total', (select count(*) from saring),
    'halaman', v_halaman, 'per_halaman', v_per,
    'kota', coalesce((select jsonb_agg(distinct jsonb_build_object('provinsi', x.provinsi, 'kota', x.kota)) from layak x where x.kota is not null), '[]'::jsonb),
    'lokasi', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.provinsi, z.kota, z.spbu_nomor, z.kode)
      from (
        select x.lahan_id, x.kode, x.nomor as spbu_nomor, x.alamat, x.kota, x.provinsi, x.luas_m2, x.posisi, x.lantai, x.daya_w, x.kesiapan,
               coalesce(array_length(x.fasilitas, 1), 0) as jumlah_fasilitas,
               e.tipe_lokasi, e.penduduk_3km, e.poi_1km,
               (select g.kunci from public.gambar g where g.spbu_id = x.spbu_id and g.lahan_id = x.lahan_id and g.jenis = 'lahan' order by g.urutan, g.id limit 1) as foto,
               (select p.id from public.peluang p
                where p.lahan_id = x.lahan_id and p.organisasi_tenant = v_org and not (p.tahap = any (public.hasil_akhir()))
                  and exists (select 1 from public.penawaran_versi pv where pv.peluang_id = p.id and pv.status = 'diterbitkan')
                order by p.dibagikan desc limit 1) as penawaran_id,
               (select m.dibuat from public.minat_lokasi m where m.organisasi_id = v_org and m.lahan_id = x.lahan_id and m.status in ('baru', 'ditindaklanjuti')
                order by m.dibuat desc limit 1) as diminati
        from saring x
        left join public.spbu_lingkungan e on e.spbu_id = x.spbu_id
        order by x.provinsi, x.kota, x.nomor, x.kode
        limit v_per offset (v_halaman - 1) * v_per
      ) z), '[]'::jsonb)
  ) into v_hasil;
  return v_hasil;
end
$$;

create function public.tenant_minati(p_lahan_id text, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org      uuid := public.organisasi_tenant_saya();
  v_catatan  text := nullif(left(btrim(coalesce(p_catatan, '')), 500), '');
  l          record;
  v_id       uuid;
begin
  if v_org is null then
    return jsonb_build_object('ok', false, 'pesan', 'Akun Anda belum terhubung ke organisasi tenant.');
  end if;
  select y.lahan_id, y.spbu_id, x.kode, s.nomor into l
  from public.lahan_layak_jelajah() y
  join public.lahan x on x.spbu_id = y.spbu_id and x.lahan_id = y.lahan_id and not x.duplikat
  join public.spbu s on s.id = y.spbu_id
  join public.akses_jelajah a on a.organisasi_id = v_org and a.provinsi = s.provinsi
  where y.lahan_id = p_lahan_id;
  if not found then
    return jsonb_build_object('ok', false, 'pesan', 'Lokasi ini tidak lagi tersedia di penjelajah. Muat ulang halaman untuk melihat yang terbaru.');
  end if;
  if exists (select 1 from public.minat_lokasi m where m.organisasi_id = v_org and m.lahan_id = p_lahan_id and m.status in ('baru', 'ditindaklanjuti')) then
    return jsonb_build_object('ok', false, 'pesan', 'Minat organisasi Anda pada lokasi ini sudah tercatat. Tim Non Fuel Retail akan menghubungi Anda.');
  end if;
  insert into public.minat_lokasi (organisasi_id, spbu_id, lahan_id, lahan_kode, spbu_nomor, catatan, dibuat_oleh)
  values (v_org, l.spbu_id, l.lahan_id, l.kode, l.nomor, v_catatan, public.email_saya()) returning id into v_id;
  perform public.audit_catat('minat_lokasi_dicatat', 'lahan', p_lahan_id, jsonb_build_object('minat_id', v_id, 'organisasi_id', v_org, 'lahan_kode', l.kode));
  return jsonb_build_object('ok', true, 'pesan', 'Minat Anda tercatat dan tidak mengikat. Tim Non Fuel Retail akan menghubungi Anda.');
end
$$;

-- ================================================================ tim NFR: menindaklanjuti minat

create function public.minat_daftar(p_status text default 'baru') returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.dibuat desc), '[]'::jsonb)
  from (
    select m.id, m.status, m.lahan_id, m.lahan_kode, m.spbu_id, m.spbu_nomor, m.catatan, m.dibuat, m.dibuat_oleh, m.ditangani, m.ditangani_oleh, m.catatan_nfr,
           o.id as organisasi_id, o.nama as organisasi, o.demo,
           s.kota, s.provinsi, nullif(l.luas_m2, 0) as luas_m2,
           (select p.id from public.peluang p where p.lahan_id = m.lahan_id and p.organisasi_tenant = m.organisasi_id order by p.dibuat desc limit 1) as peluang_id
    from public.minat_lokasi m
    join public.organisasi o on o.id = m.organisasi_id
    left join public.spbu s on s.id = m.spbu_id
    left join public.lahan l on l.spbu_id = m.spbu_id and l.lahan_id = m.lahan_id and not l.duplikat
    where p_status is null or m.status = p_status
  ) x
$$;

create function public.minat_tangani(p_id uuid, p_status text, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m          public.minat_lokasi;
  v_catatan  text := nullif(left(btrim(coalesce(p_catatan, '')), 500), '');
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Minat lokasi ditindaklanjuti analis, penyetuju, atau admin NFR.');
  end if;
  if p_status not in ('ditindaklanjuti', 'ditutup') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan tindak lanjut tidak dikenal.');
  end if;
  select * into m from public.minat_lokasi where id = p_id for update;
  if m.id is null or m.status = 'ditutup' or m.status = p_status then
    return jsonb_build_object('ok', false, 'pesan', 'Minat ini sudah ditangani. Muat ulang halaman untuk melihat keadaan terbarunya.');
  end if;
  if p_status = 'ditutup' and (v_catatan is null or length(v_catatan) < 10) then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis alasan menutupnya dulu, paling sedikit 10 huruf.');
  end if;
  update public.minat_lokasi set status = p_status, ditangani = now(), ditangani_oleh = public.email_saya(), catatan_nfr = coalesce(v_catatan, catatan_nfr) where id = p_id;
  perform public.audit_catat('minat_lokasi_' || p_status, 'lahan', m.lahan_id,
    jsonb_build_object('minat_id', m.id, 'organisasi_id', m.organisasi_id, 'lahan_kode', m.lahan_kode, 'catatan', v_catatan));
  return jsonb_build_object('ok', true, 'pesan', case p_status when 'ditutup' then 'Minat ditutup.' else 'Minat ditandai sedang ditindaklanjuti.' end);
end
$$;

revoke execute on function public.organisasi_tenant_saya(), public.jelajah_atur(uuid, text[]), public.jelajah_pilihan(),
  public.tenant_jelajah(text, text, numeric, text, integer), public.tenant_minati(text, text), public.minat_daftar(text),
  public.minat_tangani(uuid, text, text) from public, anon;
grant execute on function public.organisasi_tenant_saya(), public.jelajah_atur(uuid, text[]), public.jelajah_pilihan(),
  public.tenant_jelajah(text, text, numeric, text, integer), public.tenant_minati(text, text), public.minat_daftar(text),
  public.minat_tangani(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
