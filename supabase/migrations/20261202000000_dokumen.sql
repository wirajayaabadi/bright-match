-- Dokumen per peluang.
-- 1. Tim NFR dan tenant mengunggah berkas (PDF, JPEG, PNG) ke satu peluang; berkasnya di bucket, catatannya di sini.
-- 2. Versi baru tidak menimpa versi lama: keduanya berada dalam satu rangkaian dan tetap bisa dibuka.
-- 3. Tim NFR menentukan apakah dokumennya terlihat oleh tenant dan oleh pengelola SPBU. Dokumen tenant terlihat oleh
--    tenant itu dan tim NFR saja.
-- 4. Dokumen bisa ditarik oleh pihak pengunggahnya. Yang ditarik tidak bisa dibuka lagi oleh siapa pun; catatannya tetap ada.
-- Tabelnya tertutup: tidak ada kebijakan baca, semua lewat fungsi. Tidak ada dokumen yang menjadi syarat pindah tahap.

create table public.dokumen_peluang (
  id              uuid primary key default gen_random_uuid(),
  peluang_id      uuid not null references public.peluang (id) on delete cascade,
  rangkaian       uuid not null,                                   -- sama untuk semua versi satu dokumen; = id versi pertamanya
  versi           integer not null,
  jenis           text not null check (jenis in ('legalitas', 'proposal', 'survei', 'penawaran', 'persetujuan', 'kontrak', 'lainnya')),
  judul           text not null,
  kunci           text not null unique,                            -- alamat berkas di bucket
  nama_berkas     text not null,
  tipe            text not null check (tipe in ('application/pdf', 'image/jpeg', 'image/png')),
  bytes           integer not null check (bytes > 0),
  sha256          text not null,                                   -- sidik isi berkas saat diunggah
  pihak_unggah    text not null check (pihak_unggah in ('nfr', 'tenant')),
  organisasi_id   uuid references public.organisasi (id) on delete set null,
  tampak_tenant   boolean not null default false,
  tampak_dealer   boolean not null default false,
  tahap           text not null,                                   -- tahap peluang saat diunggah
  diunggah        timestamptz not null default now(),
  diunggah_oleh   text,
  ditarik         timestamptz,
  ditarik_oleh    text,
  alasan_tarik    text,
  unique (rangkaian, versi)
);

create index dokumen_peluang_idx on public.dokumen_peluang (peluang_id, diunggah desc);

comment on table public.dokumen_peluang is 'Dokumen per peluang. Versi baru tidak menimpa versi lama; yang ditarik tidak bisa dibuka lagi.';

alter table public.dokumen_peluang enable row level security;
revoke all on public.dokumen_peluang from anon, authenticated;

-- Sebagai apa pengguna berhadapan dengan dokumen satu peluang: 'nfr', 'tenant', 'dealer', atau null.
create function public.dokumen_peran(p_peluang_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when public.adalah_nfr() then 'nfr'
    when public.tenant_boleh_lihat(p_peluang_id) then 'tenant'
    when exists (select 1 from public.peluang p where p.id = p_peluang_id and public.dealer_kelola_spbu(p.spbu_id)
                 and exists (select 1 from public.penawaran_versi v where v.peluang_id = p.id and v.status = 'diterbitkan')) then 'dealer'
  end
$$;

-- Boleh mengunggah sebagai siapa: 'nfr' (analis, penyetuju, admin), 'tenant', atau null. Dipakai rute unggah sebelum berkas disimpan.
create function public.dokumen_boleh_unggah(p_peluang_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when (select p.tahap = any (public.hasil_akhir()) from public.peluang p where p.id = p_peluang_id) is not false then null
    when public.boleh_ubah_nfr() then 'nfr'
    when public.tenant_boleh_lihat(p_peluang_id) then 'tenant'
  end
$$;

create function public.dokumen_catat(
  p_peluang_id uuid, p_jenis text, p_judul text, p_kunci text, p_nama_berkas text, p_tipe text, p_bytes integer, p_sha256 text,
  p_tampak_tenant boolean default false, p_tampak_dealer boolean default false, p_menggantikan uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v        public.peluang;
  lama     public.dokumen_peluang;
  v_pihak  text := public.dokumen_boleh_unggah(p_peluang_id);
  v_judul  text := nullif(left(btrim(coalesce(p_judul, '')), 150), '');
  v_nama   text := nullif(left(btrim(regexp_replace(coalesce(p_nama_berkas, ''), '[\\/[:cntrl:]]', '', 'g')), 200), '');
  v_id     uuid := gen_random_uuid();
  v_rangkaian uuid;
  v_versi  integer := 1;
  v_jenis  text := p_jenis;
  v_org    uuid;
begin
  if v_pihak is null then
    return jsonb_build_object('ok', false, 'pesan', 'Anda tidak bisa mengunggah dokumen ke peluang ini.');
  end if;
  select * into v from public.peluang where id = p_peluang_id for update;
  if coalesce(p_kunci, '') !~ ('^dokumen/' || p_peluang_id::text || '/[0-9a-f-]{36}\.(pdf|jpg|png)$') then
    return jsonb_build_object('ok', false, 'pesan', 'Alamat berkas tidak sah.');
  end if;
  if p_tipe not in ('application/pdf', 'image/jpeg', 'image/png') or p_bytes is null or p_bytes <= 0 or p_bytes > 4500000
     or coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'pesan', 'Berkas harus berupa PDF, JPEG, atau PNG, paling besar 4 MB.');
  end if;
  if v_judul is null or length(v_judul) < 3 then
    return jsonb_build_object('ok', false, 'pesan', 'Beri judul dokumennya dulu, misalnya "NIB perusahaan".');
  end if;

  if p_menggantikan is not null then
    select * into lama from public.dokumen_peluang where id = p_menggantikan and peluang_id = p_peluang_id for update;
    if lama.id is null or lama.ditarik is not null
       or lama.versi <> (select max(d.versi) from public.dokumen_peluang d where d.rangkaian = lama.rangkaian) then
      return jsonb_build_object('ok', false, 'pesan', 'Dokumen yang akan diganti tidak ditemukan atau bukan versi terbarunya. Muat ulang halaman.');
    end if;
    if lama.pihak_unggah <> v_pihak or (v_pihak = 'tenant' and lama.organisasi_id is distinct from v.organisasi_tenant) then
      return jsonb_build_object('ok', false, 'pesan', 'Versi baru hanya bisa diunggah pihak yang mengunggah dokumen itu.');
    end if;
    v_rangkaian := lama.rangkaian;
    v_versi := lama.versi + 1;
    v_jenis := lama.jenis;
  else
    v_rangkaian := v_id;
    if v_jenis is null or v_jenis not in ('legalitas', 'proposal', 'survei', 'penawaran', 'persetujuan', 'kontrak', 'lainnya') then
      return jsonb_build_object('ok', false, 'pesan', 'Pilih jenis dokumennya dulu.');
    end if;
    if v_pihak = 'tenant' and v_jenis not in ('legalitas', 'proposal', 'lainnya') then
      return jsonb_build_object('ok', false, 'pesan', 'Jenis dokumen ini diunggah tim Non Fuel Retail.');
    end if;
  end if;
  if (select count(*) from public.dokumen_peluang where peluang_id = p_peluang_id) >= 200 then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang ini sudah memuat 200 berkas. Hubungi admin aplikasi.');
  end if;

  if v_pihak = 'tenant' then
    v_org := v.organisasi_tenant;
  else
    select k.organisasi_id into v_org from public.keanggotaan k join public.organisasi o on o.id = k.organisasi_id
    where k.user_id = auth.uid() and o.jenis = 'nfr' limit 1;
  end if;
  insert into public.dokumen_peluang (id, peluang_id, rangkaian, versi, jenis, judul, kunci, nama_berkas, tipe, bytes, sha256, pihak_unggah, organisasi_id,
                                      tampak_tenant, tampak_dealer, tahap, diunggah_oleh)
  values (v_id, p_peluang_id, v_rangkaian, v_versi, v_jenis, v_judul, p_kunci, coalesce(v_nama, 'dokumen'), p_tipe, p_bytes, p_sha256, v_pihak, v_org,
          -- dokumen tenant selalu terlihat oleh tenant itu dan tidak dibuka ke pengelola SPBU; versi baru mewarisi keterlihatan versi lamanya
          case when v_pihak = 'tenant' then true when lama.id is not null then lama.tampak_tenant else coalesce(p_tampak_tenant, false) end,
          case when v_pihak = 'tenant' then false when lama.id is not null then lama.tampak_dealer else coalesce(p_tampak_dealer, false) end,
          v.tahap, public.email_saya());
  update public.peluang set diubah = now() where id = p_peluang_id;
  perform public.audit_catat('dokumen_diunggah', 'peluang', p_peluang_id::text,
    jsonb_build_object('dokumen_id', v_id, 'jenis', v_jenis, 'judul', v_judul, 'versi', v_versi, 'pihak', v_pihak, 'sha256', p_sha256));
  return jsonb_build_object('ok', true, 'id', v_id, 'versi', v_versi,
    'pesan', case when v_versi > 1 then format('Versi %s tersimpan. Versi sebelumnya tetap bisa dibuka.', v_versi) else 'Dokumen tersimpan.' end);
end
$$;

-- Menarik satu versi dokumen. Hanya pihak pengunggahnya. Berkasnya tidak bisa dibuka lagi oleh siapa pun.
create function public.dokumen_tarik(p_id uuid, p_alasan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d         public.dokumen_peluang;
  v         public.peluang;
  v_alasan  text := nullif(left(btrim(coalesce(p_alasan, '')), 500), '');
  v_boleh   boolean := false;
begin
  select * into d from public.dokumen_peluang where id = p_id for update;
  if d.id is not null then
    select * into v from public.peluang where id = d.peluang_id;
    v_boleh := (d.pihak_unggah = 'nfr' and public.boleh_ubah_nfr())
            or (d.pihak_unggah = 'tenant' and public.tenant_boleh_lihat(d.peluang_id) and d.organisasi_id is not distinct from v.organisasi_tenant);
  end if;
  if not v_boleh then
    return jsonb_build_object('ok', false, 'pesan', 'Dokumen hanya bisa ditarik pihak yang mengunggahnya.');
  end if;
  if d.ditarik is not null then
    return jsonb_build_object('ok', false, 'pesan', 'Dokumen ini sudah ditarik.');
  end if;
  if d.pihak_unggah = 'nfr' and (v_alasan is null or length(v_alasan) < 10) then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis alasannya dulu, paling sedikit 10 huruf.');
  end if;
  update public.dokumen_peluang set ditarik = now(), ditarik_oleh = public.email_saya(), alasan_tarik = v_alasan where id = p_id;
  perform public.audit_catat('dokumen_ditarik', 'peluang', d.peluang_id::text,
    jsonb_build_object('dokumen_id', d.id, 'jenis', d.jenis, 'judul', d.judul, 'versi', d.versi, 'pihak', d.pihak_unggah, 'alasan', v_alasan));
  return jsonb_build_object('ok', true, 'pesan', 'Dokumen ditarik dan tidak bisa dibuka lagi. Catatannya tetap tersimpan.');
end
$$;

-- Mengatur siapa di luar tim NFR yang melihat satu rangkaian dokumen unggahan NFR.
create function public.dokumen_atur_tampak(p_id uuid, p_tenant boolean, p_dealer boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.dokumen_peluang;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Keterlihatan dokumen diatur analis, penyetuju, atau admin NFR.');
  end if;
  select * into d from public.dokumen_peluang where id = p_id for update;
  if d.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Dokumen tidak ditemukan.');
  end if;
  if d.pihak_unggah <> 'nfr' then
    return jsonb_build_object('ok', false, 'pesan', 'Dokumen unggahan tenant hanya terlihat oleh tenant itu dan tim NFR.');
  end if;
  update public.dokumen_peluang set tampak_tenant = coalesce(p_tenant, false), tampak_dealer = coalesce(p_dealer, false) where rangkaian = d.rangkaian;
  perform public.audit_catat('dokumen_tampak_diubah', 'peluang', d.peluang_id::text,
    jsonb_build_object('rangkaian', d.rangkaian, 'judul', d.judul, 'tenant', coalesce(p_tenant, false), 'dealer', coalesce(p_dealer, false),
                       'tenant_sebelum', d.tampak_tenant, 'dealer_sebelum', d.tampak_dealer));
  return jsonb_build_object('ok', true, 'pesan', 'Keterlihatan dokumen diperbarui.');
end
$$;

-- true bila pengguna boleh membuka berkas dokumen ini sekarang.
create function public.dokumen_boleh_buka(d public.dokumen_peluang) returns boolean
language sql stable security definer set search_path = '' as $$
  select d.ditarik is null and case public.dokumen_peran(d.peluang_id)
    when 'nfr' then true
    when 'tenant' then d.tampak_tenant
    when 'dealer' then d.tampak_dealer
    else false end
$$;
revoke execute on function public.dokumen_boleh_buka(public.dokumen_peluang) from public, anon, authenticated;

-- Alamat berkas untuk rute unduh. null bila tidak boleh dibuka.
create function public.dokumen_akses(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('kunci', d.kunci, 'nama_berkas', d.nama_berkas, 'tipe', d.tipe, 'bytes', d.bytes)
  from public.dokumen_peluang d where d.id = p_id and public.dokumen_boleh_buka(d)
$$;

-- Dokumen satu peluang sesuai peran pengguna. Yang ditarik tetap tercatat bagi tim NFR dan bagi pihak pengunggahnya.
create function public.dokumen_peluang_daftar(p_peluang_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with saya as (select public.dokumen_peran(p_peluang_id) as peran)
  select jsonb_build_object(
    'peran', (select peran from saya),
    'boleh_unggah', public.dokumen_boleh_unggah(p_peluang_id),
    'dokumen', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'rangkaian', d.rangkaian, 'versi', d.versi,
        'terkini', d.versi = (select max(x.versi) from public.dokumen_peluang x where x.rangkaian = d.rangkaian),
        'jenis', d.jenis, 'judul', d.judul, 'nama_berkas', d.nama_berkas, 'tipe', d.tipe, 'bytes', d.bytes,
        'pihak_unggah', d.pihak_unggah, 'diunggah', d.diunggah,
        -- identitas staf NFR tidak dibuka ke pihak lain
        'diunggah_oleh', case when s.peran = 'nfr' or d.pihak_unggah = s.peran then d.diunggah_oleh end,
        'tahap', case when s.peran = 'nfr' then d.tahap end,
        'tampak_tenant', case when s.peran = 'nfr' then d.tampak_tenant end,
        'tampak_dealer', case when s.peran = 'nfr' then d.tampak_dealer end,
        'sha256', case when s.peran = 'nfr' then d.sha256 end,
        'ditarik', d.ditarik,
        'ditarik_oleh', case when s.peran = 'nfr' or d.pihak_unggah = s.peran then d.ditarik_oleh end,
        -- alasan menarik hanya untuk tim NFR dan pihak pengunggahnya
        'alasan_tarik', case when s.peran = 'nfr' or d.pihak_unggah = s.peran then d.alasan_tarik end,
        'boleh_buka', public.dokumen_boleh_buka(d),
        'milik_saya', d.pihak_unggah = s.peran
      ) order by d.diunggah desc, d.versi desc)
      from public.dokumen_peluang d, saya s
      where d.peluang_id = p_peluang_id
        and case s.peran when 'nfr' then true
                         when 'tenant' then d.tampak_tenant
                         when 'dealer' then d.tampak_dealer and d.ditarik is null
                         else false end), '[]'::jsonb))
$$;

revoke execute on function public.dokumen_peran(uuid), public.dokumen_boleh_unggah(uuid), public.dokumen_tarik(uuid, text),
  public.dokumen_catat(uuid, text, text, text, text, text, integer, text, boolean, boolean, uuid),
  public.dokumen_atur_tampak(uuid, boolean, boolean), public.dokumen_akses(uuid), public.dokumen_peluang_daftar(uuid) from public, anon;
grant execute on function public.dokumen_peran(uuid), public.dokumen_boleh_unggah(uuid), public.dokumen_tarik(uuid, text),
  public.dokumen_catat(uuid, text, text, text, text, text, integer, text, boolean, boolean, uuid),
  public.dokumen_atur_tampak(uuid, boolean, boolean), public.dokumen_akses(uuid), public.dokumen_peluang_daftar(uuid) to authenticated;

notify pgrst, 'reload schema';
