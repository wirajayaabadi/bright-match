-- Bright Match 2.0 · irisan keempat (bagian A): potret skor dan keyakinan data.
--
-- 1. Skor kecocokan sebuah peluang tidak lagi dikirim klien. Server menghitungnya saat peluang dibuat dan
--    menyimpan potretnya: versi model, baris lengkap hasil kecocokan (termasuk poin tiap komponen dan angka
--    di balik penjelasannya), keyakinan data saat itu, dan tanggal sumber datanya. Potret lama tidak ditimpa.
-- 2. Keyakinan data adalah indikator tersendiri dan tidak dicampur dengan skor: skor menilai kecocokan usaha
--    dengan lahan, keyakinan data menilai seberapa bisa data lahannya dipercaya.

create function public.versi_model_kecocokan() returns text
language sql immutable set search_path = '' as $$ select '2'::text $$;

create table public.hasil_kecocokan (
  id            bigint generated always as identity primary key,
  peluang_id    uuid not null references public.peluang (id) on delete cascade,
  versi_model   text not null,
  lolos         boolean not null,            -- false = pasangan ini tidak memenuhi syarat wajib saat dihitung
  skor          integer,
  rinci         jsonb,                       -- baris lengkap dari kecocokan(): poin tiap komponen dan angka pendukungnya
  keyakinan     jsonb not null,              -- keyakinan data lahan saat itu
  sumber        jsonb not null,              -- tanggal tiap sumber data saat itu
  dihitung      timestamptz not null default now(),
  dihitung_oleh text
);

create index hasil_kecocokan_peluang_idx on public.hasil_kecocokan (peluang_id, dihitung desc);

comment on table public.hasil_kecocokan is 'Potret skor kecocokan tiap peluang: versi model, data, dan penjelasan saat dihitung. Hanya bertambah.';

alter table public.hasil_kecocokan enable row level security;
create policy "Tim NFR membaca potret skor" on public.hasil_kecocokan for select to authenticated using ((select public.adalah_nfr()));
revoke all on public.hasil_kecocokan from anon, authenticated;
grant select on public.hasil_kecocokan to authenticated;

-- ================================================================ keyakinan data

-- Inti: tanpa pemeriksaan peran, hanya dipanggil fungsi lain di basis data.
create function public.keyakinan_data_inti(p_lahan_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with l as (
    select x.*, s.lat, v.status_data
    from public.lahan x
    join public.spbu s on s.id = x.spbu_id
    join public.v_status_lahan v on v.spbu_id = x.spbu_id and v.lahan_id = x.lahan_id
    where x.lahan_id = p_lahan_id and not x.duplikat limit 1
  ),
  butir as (
    select 1 as urut, 'Data lahan terverifikasi lewat inspeksi lokasi' as nama, l.status_data = 'terverifikasi' as ok from l
    union all
    select 2, 'Tidak ada temuan data yang belum diputuskan',
           not exists (select 1 from public.masalah_data m where m.status in ('terbuka', 'ditinjau') and l.lahan_id = any (m.lahan_ids)) from l
    union all select 3, 'Luas tercatat', coalesce(l.luas_m2, 0) > 0 from l
    union all select 4, 'Daya listrik tercatat', l.daya_w is not null from l
    union all select 5, 'Tarif acuan tercatat', l.tarif_tahunan is not null from l
    union all
    select 6, 'Lingkungan SPBU terhitung (koordinat dan tipe lokasi)',
           exists (select 1 from public.spbu_lingkungan e where e.spbu_id = l.spbu_id) from l
    union all
    select 7, 'Lahan punya foto',
           exists (select 1 from public.gambar g where g.spbu_id = l.spbu_id and g.lahan_id = l.lahan_id and g.jenis = 'lahan') from l
  )
  select case when not exists (select 1 from l) then null else jsonb_build_object(
    'tingkat', case
      when (select status_data from l) = 'disengketakan' then 'rendah'
      when (select status_data from l) = 'terverifikasi' and (select count(*) from butir where ok) >= 6 then 'tinggi'
      when (select count(*) from butir where ok) >= 4 then 'sedang'
      else 'rendah' end,
    'terpenuhi', (select count(*) from butir where ok),
    'total', (select count(*) from butir),
    'butir', (select jsonb_agg(jsonb_build_object('nama', nama, 'ok', coalesce(ok, false)) order by urut) from butir)
  ) end
$$;

revoke execute on function public.keyakinan_data_inti(text) from public, anon, authenticated;

-- Untuk antarmuka NFR.
create function public.keyakinan_data(p_lahan_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null or public.adalah_nfr() then public.keyakinan_data_inti(p_lahan_id) end
$$;

-- ================================================================ potret skor

-- Menghitung dan menyimpan potret skor satu peluang dari data saat ini. Tanpa pemeriksaan peran.
create function public.peluang_potret_inti(p_id uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v       public.peluang;
  v_tid   text;
  v_rinci jsonb;
  v_hid   bigint;
begin
  select * into v from public.peluang where id = p_id;
  if v.id is null then
    return null;
  end if;
  if v.tenant_kunci is not null then
    select t.id into v_tid from public.v_tenant_profil t where t.kunci = v.tenant_kunci;
  end if;
  -- Pasangan yang tidak memenuhi syarat wajib tidak dikembalikan kecocokan(): potretnya dicatat "tidak lolos".
  if v_tid is not null or v.calon_id is not null then
    select to_jsonb(k) into v_rinci
    from public.kecocokan(p_lahan_id => v.lahan_id, p_tenant_id => v_tid, p_batas => 1, p_calon_id => v.calon_id) k
    limit 1;
  end if;

  insert into public.hasil_kecocokan (peluang_id, versi_model, lolos, skor, rinci, keyakinan, sumber, dihitung_oleh)
  values (p_id, public.versi_model_kecocokan(), v_rinci is not null, (v_rinci ->> 'skor')::integer, v_rinci,
          coalesce(public.keyakinan_data_inti(v.lahan_id), jsonb_build_object('tingkat', 'rendah', 'terpenuhi', 0, 'total', 0, 'butir', '[]'::jsonb)),
          coalesce((select jsonb_agg(jsonb_build_object('kunci', s.kunci, 'nama', s.nama, 'per_tanggal', s.per_tanggal) order by s.kunci)
                    from public.sumber_data s), '[]'::jsonb),
          coalesce(public.email_saya(), 'sistem'))
  returning id into v_hid;
  update public.peluang set skor = (v_rinci ->> 'skor')::integer where id = p_id;
  return v_hid;
end
$$;

revoke execute on function public.peluang_potret_inti(uuid) from public, anon, authenticated;

-- Menghitung ulang potret (mis. setelah data dimuat ulang atau lahan diverifikasi). Potret lama tetap tersimpan.
create function public.peluang_potret_ulang(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_hid bigint; v_skor integer;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa menghitung ulang skor.');
  end if;
  v_hid := public.peluang_potret_inti(p_id);
  if v_hid is null then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang tidak ditemukan.');
  end if;
  select skor into v_skor from public.hasil_kecocokan where id = v_hid;
  perform public.audit_catat('skor_dipotret', 'peluang', p_id::text,
    jsonb_build_object('potret_id', v_hid, 'skor', v_skor, 'versi_model', public.versi_model_kecocokan()));
  return jsonb_build_object('ok', true, 'pesan',
    case when v_skor is null then 'Skor dihitung ulang: pasangan ini tidak lagi memenuhi syarat wajib.'
         else 'Skor dihitung ulang dari data saat ini: ' || v_skor || '.' end);
end
$$;

-- Potret terbaru sebuah peluang, dan jumlah potret yang pernah dibuat.
create function public.peluang_kecocokan(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'potret', (select to_jsonb(h) from public.hasil_kecocokan h where h.peluang_id = p_id order by h.dihitung desc, h.id desc limit 1),
    'jumlah', (select count(*) from public.hasil_kecocokan h where h.peluang_id = p_id),
    'keyakinan_kini', (select public.keyakinan_data(p.lahan_id) from public.peluang p where p.id = p_id)
  )
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
          p_calon_id, v_kunci, v_nama, v_seg, null, v_oleh)
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
  -- skor dihitung di sini dari data saat ini; p_skor dari klien diabaikan (dipertahankan agar tanda tangan fungsi tetap)
  perform public.peluang_potret_inti(v_id);
  perform public.audit_catat('peluang_dibuat', 'peluang', v_id::text, jsonb_build_object(
    'lahan_id', v_lot.lahan_id, 'lahan_kode', v_lot.kode, 'pihak', coalesce(v_nama, p_calon_id::text),
    'skor', (select skor from public.peluang where id = v_id),
    'lahan_tertahan', public.lahan_tertahan(v_lot.lahan_id)));
  return v_id;
end
$$;

revoke execute on function
  public.versi_model_kecocokan(), public.keyakinan_data(text), public.peluang_potret_ulang(uuid), public.peluang_kecocokan(uuid)
from public, anon;
grant execute on function
  public.versi_model_kecocokan(), public.keyakinan_data(text), public.peluang_potret_ulang(uuid), public.peluang_kecocokan(uuid)
to authenticated;

notify pgrst, 'reload schema';
