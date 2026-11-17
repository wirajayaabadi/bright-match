-- Dokumen di atas 4 MB.
-- Badan permintaan fungsi server di Vercel dibatasi 4,5 MB, jadi berkas besar dipotong di peramban menjadi bagian
-- 3,5 MB. Tiap bagian disimpan sebagai objek tersendiri (<kunci tanpa ekstensi>.bagian-<n>) dan disatukan lagi saat
-- dibuka. Kolom bagian mencatat jumlah potongannya; 1 berarti satu objek biasa. Batas keseluruhan 24 MB.

alter table public.dokumen_peluang add column bagian integer not null default 1 check (bagian between 1 and 8);
comment on column public.dokumen_peluang.bagian is 'Jumlah potongan berkas di bucket. 1 = satu objek di kunci; lebih = objek <kunci tanpa ekstensi>.bagian-<n>.';

-- Daftar parameternya bertambah, jadi fungsi lama dibuang dulu supaya tidak ada dua versi yang sama-sama cocok.
drop function public.dokumen_catat(uuid, text, text, text, text, text, integer, text, boolean, boolean, uuid);

create function public.dokumen_catat(
  p_peluang_id uuid, p_jenis text, p_judul text, p_kunci text, p_nama_berkas text, p_tipe text, p_bytes integer, p_sha256 text,
  p_tampak_tenant boolean default false, p_tampak_dealer boolean default false, p_menggantikan uuid default null,
  p_bagian integer default 1
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
  -- satu bagian = satu objek (paling besar 4,5 MB); lebih dari satu = berkas besar yang disimpan berpotongan
  if p_tipe not in ('application/pdf', 'image/jpeg', 'image/png') or p_bytes is null or p_bytes <= 0
     or coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' or coalesce(p_bagian, 0) not between 1 and 8
     or (p_bagian = 1 and p_bytes > 4500000) or (p_bagian > 1 and (p_bytes > 25000000 or p_bytes <= (p_bagian - 1) * 1000000)) then
    return jsonb_build_object('ok', false, 'pesan', 'Berkas harus berupa PDF, JPEG, atau PNG, paling besar 24 MB.');
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
  insert into public.dokumen_peluang (id, peluang_id, rangkaian, versi, jenis, judul, kunci, nama_berkas, tipe, bytes, bagian, sha256, pihak_unggah, organisasi_id,
                                      tampak_tenant, tampak_dealer, tahap, diunggah_oleh)
  values (v_id, p_peluang_id, v_rangkaian, v_versi, v_jenis, v_judul, p_kunci, coalesce(v_nama, 'dokumen'), p_tipe, p_bytes, p_bagian, p_sha256, v_pihak, v_org,
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

-- true bila pengguna boleh mengunggah ke peluang ini dan nomor unggahan itu belum pernah dicatat sebagai dokumen.
-- Dipakai rute unggah bagian supaya potongan dokumen yang sudah tercatat tidak bisa ditimpa.
create function public.dokumen_unggahan_bebas(p_peluang_id uuid, p_unggahan uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.dokumen_boleh_unggah(p_peluang_id) is not null
     and not exists (select 1 from public.dokumen_peluang d where d.kunci like 'dokumen/' || p_peluang_id::text || '/' || p_unggahan::text || '.%')
$$;

create or replace function public.dokumen_akses(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('kunci', d.kunci, 'nama_berkas', d.nama_berkas, 'tipe', d.tipe, 'bytes', d.bytes, 'bagian', d.bagian)
  from public.dokumen_peluang d where d.id = p_id and public.dokumen_boleh_buka(d)
$$;

revoke execute on function public.dokumen_catat(uuid, text, text, text, text, text, integer, text, boolean, boolean, uuid, integer),
  public.dokumen_unggahan_bebas(uuid, uuid) from public, anon;
grant execute on function public.dokumen_catat(uuid, text, text, text, text, text, integer, text, boolean, boolean, uuid, integer),
  public.dokumen_unggahan_bebas(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
