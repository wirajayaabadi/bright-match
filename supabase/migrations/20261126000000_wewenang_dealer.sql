-- Bright Match 2.0 · irisan kelima: model wewenang SPBU dan portal dealer, tahap pertama.
--
-- 1. Wewenang per SPBU: pola pengelolaan (COCO, DODO, ...), pemilik aset, pengelola, penyetuju yang berwenang,
--    pihak yang berkontrak, penerima sewa, pengaturan bagi hasil, dan rujukan dokumennya. Pengelola SPBU tidak
--    otomatis dianggap pemilik lahan maupun penanda tangan kontrak, dan sewa tidak otomatis milik Pertamina.
--    Wewenang disimpan dulu, lalu dipastikan oleh orang lain yang berwenang.
-- 2. Penawaran baru boleh diterbitkan setelah wewenang SPBU-nya dipastikan, dan penerima sewanya harus sama.
-- 3. Portal dealer: anggota organisasi dealer melihat hanya SPBU yang dikelola organisasinya, mengonfirmasi
--    ketersediaan ruang, mengisi inspeksi lokasi dengan foto, dan (bila berwenang) memutuskan usulan tenant.
--    Bila organisasinya tidak berwenang, portal menampilkan siapa penyetujunya.

-- ================================================================ wewenang SPBU

create table public.hak_spbu (
  spbu_id            text primary key,                  -- tanpa foreign key: bertahan saat data dimuat ulang
  spbu_nomor         text not null,
  pola               text check (pola in ('COCO', 'DODO', 'CODO', 'lainnya')),
  pemilik_aset       text,                              -- pemilik sah lahan dan bangunan
  pengelola          text,                              -- yang menjalankan SPBU sehari-hari
  organisasi_dealer  uuid references public.organisasi (id) on delete set null,   -- organisasi pengelola di aplikasi ini
  dealer_berwenang   boolean not null default false,    -- true = organisasi dealer itu penyetuju yang sah
  penyetuju          text,                              -- siapa yang berwenang menyetujui tenant baru
  pihak_kontrak      text,                              -- siapa yang menandatangani kontrak sewa
  penerima_sewa      text check (penerima_sewa in ('pertamina', 'pemilik_spbu', 'dibagi')),
  bagi_hasil         text,                              -- pengaturan pembagian, bila sewa dibagi
  dokumen            text,                              -- rujukan dokumen yang menjadi dasar
  status             text not null default 'belum_dipastikan' check (status in ('belum_dipastikan', 'dipastikan')),
  dipastikan         timestamptz,
  dipastikan_oleh    text,
  diubah             timestamptz not null default now(),
  diubah_oleh        text,
  constraint hak_dipastikan_lengkap check (status = 'belum_dipastikan' or (
    pola is not null and pemilik_aset is not null and penyetuju is not null and pihak_kontrak is not null
    and penerima_sewa is not null and dokumen is not null))
);

create index hak_spbu_dealer_idx on public.hak_spbu (organisasi_dealer) where organisasi_dealer is not null;

comment on table public.hak_spbu is 'Wewenang atas ruang usaha di satu SPBU: pemilik aset, pengelola, penyetuju, pihak kontrak, dan penerima sewa.';

alter table public.hak_spbu enable row level security;
create policy "Tim NFR membaca wewenang SPBU" on public.hak_spbu for select to authenticated using ((select public.adalah_nfr()));
revoke all on public.hak_spbu from anon, authenticated;
grant select on public.hak_spbu to authenticated;

create function public.hak_spbu_simpan(p_spbu_id text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_nomor text;
  v_org   uuid;
  teks    constant text[] := array['pemilik_aset', 'pengelola', 'penyetuju', 'pihak_kontrak', 'bagi_hasil', 'dokumen'];
  v       jsonb := '{}'::jsonb;
  k       text;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda hanya bisa membaca wewenang SPBU.');
  end if;
  select nomor into v_nomor from public.spbu where id = p_spbu_id;
  if v_nomor is null then
    return jsonb_build_object('ok', false, 'pesan', 'SPBU tidak ditemukan.');
  end if;
  if coalesce(p ->> 'pola', '') <> '' and p ->> 'pola' not in ('COCO', 'DODO', 'CODO', 'lainnya') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan pola pengelolaan tidak dikenal.');
  end if;
  if coalesce(p ->> 'penerima_sewa', '') <> '' and p ->> 'penerima_sewa' not in ('pertamina', 'pemilik_spbu', 'dibagi') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan penerima sewa tidak dikenal.');
  end if;
  if coalesce(p ->> 'organisasi_dealer', '') ~ '^[0-9a-f-]{36}$' then
    select id into v_org from public.organisasi where id = (p ->> 'organisasi_dealer')::uuid and jenis = 'dealer';
    if v_org is null then
      return jsonb_build_object('ok', false, 'pesan', 'Organisasi pengelola harus organisasi berjenis dealer.');
    end if;
  end if;
  if p ->> 'penerima_sewa' = 'dibagi' and nullif(btrim(coalesce(p ->> 'bagi_hasil', '')), '') is null then
    return jsonb_build_object('ok', false, 'pesan', 'Sewa dibagi: tulis pengaturan pembagiannya.');
  end if;
  foreach k in array teks loop
    v := v || jsonb_build_object(k, nullif(left(btrim(coalesce(p ->> k, '')), 300), ''));
  end loop;

  -- Setiap perubahan mengembalikan status ke "belum dipastikan": harus dipastikan lagi oleh orang lain.
  insert into public.hak_spbu as h (spbu_id, spbu_nomor, pola, pemilik_aset, pengelola, organisasi_dealer, dealer_berwenang, penyetuju,
                                    pihak_kontrak, penerima_sewa, bagi_hasil, dokumen, status, dipastikan, dipastikan_oleh, diubah, diubah_oleh)
  values (p_spbu_id, v_nomor, nullif(p ->> 'pola', ''), v ->> 'pemilik_aset', v ->> 'pengelola', v_org,
          v_org is not null and coalesce(p ->> 'dealer_berwenang', '') in ('true', 'on', '1'), v ->> 'penyetuju',
          v ->> 'pihak_kontrak', nullif(p ->> 'penerima_sewa', ''), v ->> 'bagi_hasil', v ->> 'dokumen',
          'belum_dipastikan', null, null, now(), public.email_saya())
  on conflict (spbu_id) do update set
    pola = excluded.pola, pemilik_aset = excluded.pemilik_aset, pengelola = excluded.pengelola,
    organisasi_dealer = excluded.organisasi_dealer, dealer_berwenang = excluded.dealer_berwenang, penyetuju = excluded.penyetuju,
    pihak_kontrak = excluded.pihak_kontrak, penerima_sewa = excluded.penerima_sewa, bagi_hasil = excluded.bagi_hasil,
    dokumen = excluded.dokumen, status = 'belum_dipastikan', dipastikan = null, dipastikan_oleh = null,
    diubah = now(), diubah_oleh = excluded.diubah_oleh;
  perform public.audit_catat('wewenang_disimpan', 'spbu', p_spbu_id, jsonb_build_object('spbu_nomor', v_nomor, 'isi', p));
  return jsonb_build_object('ok', true, 'pesan', 'Wewenang tersimpan. Minta admin atau penyetuju NFR lain memastikannya.');
end
$$;

-- Memastikan wewenang yang sudah lengkap. Oleh admin atau penyetuju NFR, dan bukan orang yang terakhir mengubahnya.
create function public.hak_spbu_pastikan(p_spbu_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.hak_spbu;
begin
  if coalesce(public.peran_nfr(), '') not in ('nfr_admin', 'nfr_penyetuju') then
    return jsonb_build_object('ok', false, 'pesan', 'Wewenang dipastikan admin atau penyetuju NFR.');
  end if;
  select * into h from public.hak_spbu where spbu_id = p_spbu_id for update;
  if h.spbu_id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Wewenang SPBU ini belum diisi.');
  end if;
  if h.status = 'dipastikan' then
    return jsonb_build_object('ok', false, 'pesan', 'Wewenang SPBU ini sudah dipastikan.');
  end if;
  if h.pola is null or h.pemilik_aset is null or h.penyetuju is null or h.pihak_kontrak is null or h.penerima_sewa is null or h.dokumen is null then
    return jsonb_build_object('ok', false, 'pesan',
      'Lengkapi dulu: pola pengelolaan, pemilik aset, penyetuju, pihak yang berkontrak, penerima sewa, dan rujukan dokumen.');
  end if;
  if h.diubah_oleh is not null and h.diubah_oleh = public.email_saya() then
    return jsonb_build_object('ok', false, 'pesan', 'Wewenang ini Anda isi sendiri, jadi harus dipastikan orang lain.');
  end if;
  update public.hak_spbu set status = 'dipastikan', dipastikan = now(), dipastikan_oleh = public.email_saya() where spbu_id = p_spbu_id;
  perform public.audit_catat('wewenang_dipastikan', 'spbu', p_spbu_id, to_jsonb(h) - 'status' - 'dipastikan' - 'dipastikan_oleh');
  return jsonb_build_object('ok', true, 'pesan', 'Wewenang SPBU dipastikan.');
end
$$;

create function public.hak_spbu_rinci(p_spbu_id text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'hak', (select to_jsonb(h) || jsonb_build_object('organisasi_nama', o.nama)
            from public.hak_spbu h left join public.organisasi o on o.id = h.organisasi_dealer where h.spbu_id = p_spbu_id),
    'pilihan', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nama', o.nama, 'demo', o.demo) order by o.nama)
                         from public.organisasi o where o.jenis = 'dealer'), '[]'::jsonb)
  )
$$;

-- ================================================================ pengelola SPBU: cakupan dan peran

-- true bila pengguna yang masuk anggota organisasi dealer yang mengelola SPBU ini.
create function public.dealer_kelola_spbu(p_spbu_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hak_spbu h
                 join public.keanggotaan k on k.organisasi_id = h.organisasi_dealer and k.user_id = auth.uid()
                 where h.spbu_id = p_spbu_id)
$$;

create function public.adalah_dealer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.keanggotaan k join public.organisasi o on o.id = k.organisasi_id
                 where k.user_id = auth.uid() and o.jenis = 'dealer')
$$;

-- Inspeksi boleh diisi tim NFR atau anggota organisasi dealer. Cakupan SPBU-nya diperiksa saat inspeksi dimulai,
-- dan setelah itu hanya pemeriksanya sendiri yang bisa mengubah atau mengajukan inspeksi itu.
create function public.boleh_ubah_inspeksi() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.boleh_ubah_nfr() or public.adalah_dealer()
$$;

alter table public.status_lahan
  add column konfirmasi_dealer text check (konfirmasi_dealer in ('tersedia', 'tidak_tersedia')),
  add column konfirmasi_dealer_waktu timestamptz,
  add column konfirmasi_dealer_oleh text,
  add column konfirmasi_dealer_catatan text;

create or replace view public.v_status_lahan with (security_invoker = true) as
select
  l.lahan_id, l.spbu_id, l.kode, l.status as status_sumber,
  case when l.status = 'Tersewa' then 'terisi' else coalesce(s.status_ruang, 'tersedia') end as status_ruang,
  s.alasan_ruang,
  case when k.ada then 'disengketakan'
       when s.status_data = 'terverifikasi' and s.sidik_sumber = public.sidik_lahan(l) then 'terverifikasi'
       when s.status_data = 'ditolak' then 'ditolak'
       else 'belum_diverifikasi' end as status_data,
  coalesce(s.status_data = 'terverifikasi' and s.sidik_sumber is distinct from public.sidik_lahan(l), false) as verifikasi_usang,
  case when s.status_data = 'terverifikasi' and s.sidik_sumber = public.sidik_lahan(l) then coalesce(s.kesiapan, 'belum_diketahui')
       when s.status_data = 'terverifikasi' then 'perlu_inspeksi'
       when b.ada then 'perlu_inspeksi'
       else 'belum_diketahui' end as kesiapan,
  s.pembatasan, s.inspeksi_id, s.diverifikasi, s.diverifikasi_oleh,
  s.konfirmasi_dealer, s.konfirmasi_dealer_waktu, s.konfirmasi_dealer_oleh, s.konfirmasi_dealer_catatan
from public.lahan l
left join public.status_lahan s on s.spbu_id = l.spbu_id and s.lahan_id = l.lahan_id
cross join lateral (
  select exists (select 1 from public.masalah_data m
                 where m.tingkat = 'kritis' and m.status in ('terbuka', 'ditinjau') and l.lahan_id = any (m.lahan_ids)) as ada) k
cross join lateral (
  select exists (select 1 from public.inspeksi_lahan i
                 where i.spbu_id = l.spbu_id and i.lahan_id = l.lahan_id and i.status in ('draf', 'diajukan')) as ada) b
where not l.duplikat;

-- Pengelola SPBU mengonfirmasi apakah ruang yang tercatat kosong memang bisa dipakai.
-- "Tidak tersedia" menahan ruang itu (dengan alasannya); "tersedia" melepas penahanan yang berasal dari pengelola.
create function public.dealer_konfirmasi_ruang(p_lahan_id text, p_tersedia boolean, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l         public.lahan;
  v_catatan text := nullif(left(btrim(coalesce(p_catatan, '')), 400), '');
  v_awalan  constant text := 'Menurut pengelola SPBU: ';
begin
  select * into l from public.lahan where lahan_id = p_lahan_id and not duplikat limit 1;
  if l.lahan_id is null or not public.dealer_kelola_spbu(l.spbu_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Ruang ini tidak ditemukan di SPBU yang Anda kelola.');
  end if;
  if l.status <> 'Tersedia' then
    return jsonb_build_object('ok', false, 'pesan', 'Ruang ini sudah terisi menurut Brightspace.');
  end if;
  if p_tersedia is null then
    return jsonb_build_object('ok', false, 'pesan', 'Pilih dulu: ruang ini bisa dipakai atau tidak.');
  end if;
  if not p_tersedia and (v_catatan is null or length(v_catatan) < 5) then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis mengapa ruang ini tidak bisa dipakai, misalnya sedang dipakai gudang.');
  end if;

  insert into public.status_lahan as s (spbu_id, lahan_id, lahan_kode, status_ruang, alasan_ruang, konfirmasi_dealer,
                                        konfirmasi_dealer_waktu, konfirmasi_dealer_oleh, konfirmasi_dealer_catatan, diubah, diubah_oleh)
  values (l.spbu_id, l.lahan_id, l.kode, case when p_tersedia then null else 'ditahan' end,
          case when p_tersedia then null else v_awalan || v_catatan end,
          case when p_tersedia then 'tersedia' else 'tidak_tersedia' end, now(), public.email_saya(), v_catatan, now(), public.email_saya())
  on conflict (spbu_id, lahan_id) do update set
    konfirmasi_dealer = excluded.konfirmasi_dealer, konfirmasi_dealer_waktu = now(), konfirmasi_dealer_oleh = excluded.konfirmasi_dealer_oleh,
    konfirmasi_dealer_catatan = excluded.konfirmasi_dealer_catatan, diubah = now(), diubah_oleh = excluded.diubah_oleh,
    -- penahanan oleh tim NFR tidak disentuh; hanya penahanan yang berasal dari pengelola yang dipasang atau dilepas
    status_ruang = case when not p_tersedia and s.status_ruang is null then 'ditahan'
                        when p_tersedia and s.alasan_ruang like v_awalan || '%' then null
                        else s.status_ruang end,
    alasan_ruang = case when not p_tersedia and s.status_ruang is null then excluded.alasan_ruang
                        when p_tersedia and s.alasan_ruang like v_awalan || '%' then null
                        else s.alasan_ruang end;
  perform public.audit_catat('dealer_konfirmasi_ruang', 'lahan', l.lahan_id,
    jsonb_build_object('lahan_kode', l.kode, 'tersedia', p_tersedia, 'catatan', v_catatan));
  return jsonb_build_object('ok', true, 'pesan',
    case when p_tersedia then 'Tercatat: ruang ini bisa dipakai.' else 'Tercatat: ruang ini tidak bisa dipakai. Ruang ditahan dari penawaran.' end);
end
$$;

-- ================================================================ inspeksi: kini juga oleh pengelola SPBU

create or replace function public.inspeksi_mulai(p_lahan_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l    record;
  v_id uuid;
begin
  if not public.boleh_ubah_inspeksi() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa memulai inspeksi.');
  end if;
  select x.lahan_id, x.spbu_id, x.kode, x.status, s.nomor into l
  from public.lahan x join public.spbu s on s.id = x.spbu_id
  where x.lahan_id = p_lahan_id and not x.duplikat limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'pesan', 'Lahan tidak ditemukan.');
  end if;
  -- pengelola SPBU hanya boleh memeriksa lahan di SPBU yang dikelolanya
  if not public.boleh_ubah_nfr() and not public.dealer_kelola_spbu(l.spbu_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Lahan ini bukan di SPBU yang Anda kelola.');
  end if;
  if l.status <> 'Tersedia' then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi kesiapan hanya untuk lahan kosong.');
  end if;
  select id into v_id from public.inspeksi_lahan
  where spbu_id = l.spbu_id and lahan_id = l.lahan_id and status in ('draf', 'diajukan');
  if v_id is null then
    insert into public.inspeksi_lahan (spbu_id, lahan_id, lahan_kode, spbu_nomor, pemeriksa, pemeriksa_email)
    values (l.spbu_id, l.lahan_id, l.kode, l.nomor, auth.uid(), public.email_saya())
    returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

create or replace function public.inspeksi_simpan(p_id uuid, p_isi jsonb, p_hasil text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v     public.inspeksi_lahan;
  v_isi jsonb := '{}'::jsonb;
  k     text;
  angka constant text := '^[0-9]{1,7}([.][0-9]{1,2})?$';
begin
  if not public.boleh_ubah_inspeksi() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa mengisi inspeksi.');
  end if;
  select * into v from public.inspeksi_lahan where id = p_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi tidak ditemukan.');
  end if;
  if v.status not in ('draf', 'ditolak') then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi ini sudah diajukan, jadi tidak bisa diubah lagi.');
  end if;
  if v.pemeriksa is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi ini sedang diisi ' || coalesce(v.pemeriksa_email, 'orang lain') || '.');
  end if;

  foreach k in array array['panjang_m', 'lebar_m', 'luas_m2', 'daya_w'] loop
    if coalesce(p_isi ->> k, '') ~ angka then
      v_isi := v_isi || jsonb_build_object(k, (p_isi ->> k)::numeric);
    end if;
  end loop;
  if p_isi ->> 'air' in ('tersedia', 'perlu_sambungan', 'tidak_ada') then v_isi := v_isi || jsonb_build_object('air', p_isi ->> 'air'); end if;
  if p_isi ->> 'akses' in ('mudah', 'terbatas', 'tidak_bisa') then v_isi := v_isi || jsonb_build_object('akses', p_isi ->> 'akses'); end if;
  if p_isi ->> 'parkir' in ('cukup', 'terbatas', 'tidak_ada') then v_isi := v_isi || jsonb_build_object('parkir', p_isi ->> 'parkir'); end if;
  if p_isi ->> 'pembatasan' in ('tidak_ada', 'ada') then v_isi := v_isi || jsonb_build_object('pembatasan', p_isi ->> 'pembatasan'); end if;
  foreach k in array array['pembatasan_rinci', 'infrastruktur', 'perubahan', 'catatan'] loop
    if nullif(btrim(coalesce(p_isi ->> k, '')), '') is not null then
      v_isi := v_isi || jsonb_build_object(k, left(btrim(p_isi ->> k), 1000));
    end if;
  end loop;

  update public.inspeksi_lahan
  set isi = v_isi, hasil = case when p_hasil in ('siap', 'belum_siap') then p_hasil end, status = 'draf',
      diubah = now(), peninjau_email = null, ditinjau = null
  where id = p_id;
  return jsonb_build_object('ok', true, 'pesan', 'Draf inspeksi tersimpan.');
end
$$;

create or replace function public.inspeksi_ajukan(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v        public.inspeksi_lahan;
  v_kurang text[];
begin
  if not public.boleh_ubah_inspeksi() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa mengajukan inspeksi.');
  end if;
  select * into v from public.inspeksi_lahan where id = p_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi tidak ditemukan.');
  end if;
  if v.status <> 'draf' then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi ini sudah diajukan.');
  end if;
  if v.pemeriksa is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi ini diisi ' || coalesce(v.pemeriksa_email, 'orang lain') || ', jadi hanya dia yang bisa mengajukannya.');
  end if;
  v_kurang := public.inspeksi_kurang(p_id);
  if cardinality(v_kurang) > 0 then
    return jsonb_build_object('ok', false, 'pesan', 'Lengkapi dulu: ' || array_to_string(v_kurang, ', ') || '.');
  end if;
  update public.inspeksi_lahan set status = 'diajukan', diajukan = now(), diubah = now() where id = p_id;
  perform public.audit_catat('inspeksi_diajukan', 'lahan', v.lahan_id,
    jsonb_build_object('inspeksi_id', p_id, 'lahan_kode', v.lahan_kode, 'hasil', v.hasil));
  return jsonb_build_object('ok', true, 'pesan', 'Inspeksi diajukan. Menunggu tinjauan admin atau penyetuju NFR.');
end
$$;

create or replace function public.inspeksi_foto_tambah(p_inspeksi_id uuid, p_kunci text, p_lebar integer, p_tinggi integer, p_bytes integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.inspeksi_lahan; v_id uuid;
begin
  if not public.boleh_ubah_inspeksi() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa menambah foto.');
  end if;
  select * into v from public.inspeksi_lahan where id = p_inspeksi_id for update;
  if v.id is null or v.status not in ('draf', 'ditolak') or v.pemeriksa is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'pesan', 'Foto hanya bisa ditambah pemeriksa selama inspeksi masih draf.');
  end if;
  if p_kunci !~ ('^inspeksi/' || p_inspeksi_id::text || '/[0-9a-f-]{36}[.]jpg$') then
    return jsonb_build_object('ok', false, 'pesan', 'Nama berkas foto tidak sah.');
  end if;
  if (select count(*) from public.inspeksi_foto where inspeksi_id = p_inspeksi_id) >= 12 then
    return jsonb_build_object('ok', false, 'pesan', 'Paling banyak 12 foto per inspeksi. Hapus satu foto dulu.');
  end if;
  insert into public.inspeksi_foto (inspeksi_id, kunci, lebar, tinggi, bytes, diunggah_oleh)
  values (p_inspeksi_id, p_kunci, p_lebar, p_tinggi, p_bytes, public.email_saya()) returning id into v_id;
  update public.inspeksi_lahan set diubah = now() where id = p_inspeksi_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

create or replace function public.inspeksi_foto_hapus(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_kunci text; v_inspeksi uuid;
begin
  if not public.boleh_ubah_inspeksi() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa menghapus foto.');
  end if;
  select f.kunci, f.inspeksi_id into v_kunci, v_inspeksi
  from public.inspeksi_foto f join public.inspeksi_lahan i on i.id = f.inspeksi_id
  where f.id = p_id and i.status in ('draf', 'ditolak') and i.pemeriksa = auth.uid();
  if v_kunci is null then
    return jsonb_build_object('ok', false, 'pesan', 'Foto hanya bisa dihapus pemeriksa selama inspeksi masih draf.');
  end if;
  delete from public.inspeksi_foto where id = p_id;
  update public.inspeksi_lahan set diubah = now() where id = v_inspeksi;
  return jsonb_build_object('ok', true, 'kunci', v_kunci);
end
$$;

-- Untuk rute unggah foto: true bila pengguna pemeriksa inspeksi ini dan inspeksinya masih bisa diisi.
create function public.inspeksi_boleh_isi(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.inspeksi_lahan i where i.id = p_id and i.pemeriksa = auth.uid() and i.status in ('draf', 'ditolak'))
$$;

-- Untuk rute penyaji foto: tim NFR, atau anggota organisasi dealer yang mengelola SPBU inspeksi itu.
create function public.inspeksi_boleh_lihat(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.adalah_nfr()
      or exists (select 1 from public.inspeksi_lahan i where i.id = p_id and public.dealer_kelola_spbu(i.spbu_id))
$$;

-- ================================================================ penawaran: wewenang harus dipastikan

create or replace function public.penawaran_terbitkan(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d       public.penawaran_versi;
  v       public.peluang;
  v_boleh jsonb;
  v_gugur integer;
  h       public.hak_spbu;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa menerbitkan penawaran.');
  end if;
  select * into d from public.penawaran_versi where id = p_id for update;
  if d.id is null or d.status <> 'draf' then
    return jsonb_build_object('ok', false, 'pesan', 'Hanya draf yang bisa diterbitkan.');
  end if;
  select * into v from public.peluang where id = d.peluang_id for update;
  if coalesce(array_position(public.urutan_tahap(), v.tahap), 0) not between 6 and 9 then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran diterbitkan sejak tahap survei lokasi sampai tahap persetujuan.');
  end if;
  v_boleh := public.lahan_boleh_ditawarkan(v.lahan_id);
  if not (v_boleh ->> 'boleh')::boolean then
    return jsonb_build_object('ok', false, 'pesan', v_boleh ->> 'alasan');
  end if;
  if d.penerima_sewa = 'belum_dipastikan' then
    return jsonb_build_object('ok', false, 'pesan',
      'Pastikan dulu siapa penerima sewanya (Pertamina, pemilik SPBU, atau dibagi). Penerima sewa tidak boleh diandaikan.');
  end if;
  -- wewenang SPBU harus sudah dipastikan, dan penerima sewa di penawaran harus sama dengannya
  select * into h from public.hak_spbu where spbu_id = v.spbu_id;
  if h.spbu_id is null or h.status <> 'dipastikan' then
    return jsonb_build_object('ok', false, 'pesan',
      'Wewenang dan penerima sewa SPBU ini belum dipastikan. Lengkapi dan pastikan dulu di Profil lokasi SPBU-nya.');
  end if;
  if d.penerima_sewa <> h.penerima_sewa then
    return jsonb_build_object('ok', false, 'pesan',
      'Penerima sewa di penawaran ini berbeda dari yang sudah dipastikan untuk SPBU-nya. Samakan dulu, atau perbarui wewenang SPBU.');
  end if;

  update public.penawaran_versi set status = 'digantikan' where peluang_id = d.peluang_id and status = 'diterbitkan';
  update public.persetujuan set gugur = true where peluang_id = d.peluang_id and not gugur;
  get diagnostics v_gugur = row_count;
  update public.penawaran_versi set status = 'diterbitkan', diterbitkan = now(), diterbitkan_oleh = public.email_saya() where id = p_id;
  insert into public.persetujuan (peluang_id, penawaran_id, pihak)
  select d.peluang_id, p_id, x from unnest(array['nfr', 'dealer', 'tenant', 'hsse']) x;
  update public.peluang set diubah = now() where id = d.peluang_id;

  perform public.audit_catat('penawaran_diterbitkan', 'peluang', d.peluang_id::text, jsonb_build_object(
    'penawaran_id', p_id, 'versi', d.versi, 'persetujuan_gugur', v_gugur,
    'syarat', to_jsonb(d) - 'id' - 'peluang_id' - 'status' - 'diterbitkan' - 'diterbitkan_oleh'));
  return jsonb_build_object('ok', true, 'pesan',
    'Versi ' || d.versi || ' diterbitkan.' || case when v_gugur > 0 then ' Persetujuan atas versi sebelumnya gugur dan harus diminta lagi.' else '' end);
end
$$;

-- ================================================================ portal dealer (fungsi khusus, kolom aman saja)

create function public.dealer_ringkasan() returns jsonb
language sql stable security definer set search_path = '' as $$
  with milik as (
    select h.*, o.nama as organisasi, o.demo, k.peran
    from public.hak_spbu h
    join public.keanggotaan k on k.organisasi_id = h.organisasi_dealer and k.user_id = auth.uid()
    join public.organisasi o on o.id = h.organisasi_dealer and o.jenis = 'dealer'
  )
  select jsonb_build_object(
    'spbu', coalesce((
      select jsonb_agg(jsonb_build_object(
        'spbu_id', s.id, 'nomor', s.nomor, 'alamat', s.alamat, 'kota', s.kota, 'provinsi', s.provinsi,
        'ruang', (select count(*) from public.lahan l where l.spbu_id = s.id and not l.duplikat),
        'kosong', (select count(*) from public.lahan l where l.spbu_id = s.id and not l.duplikat and l.status = 'Tersedia'),
        'perlu_konfirmasi', (select count(*) from public.v_status_lahan v where v.spbu_id = s.id and v.status_sumber = 'Tersedia' and v.konfirmasi_dealer is null),
        'foto', (select g.kunci from public.gambar g where g.spbu_id = s.id and g.jenis = 'spbu' order by g.urutan, g.id limit 1)
      ) order by s.nomor)
      from milik m join public.spbu s on s.id = m.spbu_id), '[]'::jsonb),
    'persetujuan', coalesce((
      select jsonb_agg(jsonb_build_object(
        'peluang_id', p.id, 'lahan_kode', p.lahan_kode, 'spbu_nomor', p.spbu_nomor, 'pihak', coalesce(c.nama_usaha, p.tenant_nama),
        'segmen', p.segmen, 'versi', v.versi, 'berwenang', m.dealer_berwenang and m.status = 'dipastikan') order by p.diubah desc)
      from milik m
      join public.peluang p on p.spbu_id = m.spbu_id and p.tahap = 'persetujuan'
      join public.penawaran_versi v on v.peluang_id = p.id and v.status = 'diterbitkan'
      join public.persetujuan a on a.penawaran_id = v.id and a.pihak = 'dealer' and not a.gugur and a.status = 'menunggu'
      left join public.calon_tenant c on c.id = p.calon_id), '[]'::jsonb)
  )
$$;

-- Satu SPBU untuk pengelolanya: wewenang, dan semua ruang usaha dengan statusnya. null bila bukan SPBU-nya.
create function public.dealer_spbu_rinci(p_spbu_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.dealer_kelola_spbu(p_spbu_id) then null else (
    select jsonb_build_object(
      'spbu', jsonb_build_object('id', s.id, 'nomor', s.nomor, 'alamat', s.alamat, 'kota', s.kota, 'provinsi', s.provinsi, 'fasilitas', s.fasilitas),
      'hak', (select jsonb_build_object('pola', h.pola, 'pemilik_aset', h.pemilik_aset, 'pengelola', h.pengelola, 'penyetuju', h.penyetuju,
                                        'pihak_kontrak', h.pihak_kontrak, 'penerima_sewa', h.penerima_sewa, 'bagi_hasil', h.bagi_hasil,
                                        'dealer_berwenang', h.dealer_berwenang, 'status', h.status)
              from public.hak_spbu h where h.spbu_id = s.id),
      'foto_spbu', public.daftar_gambar(s.id, null, 'spbu'),
      'ruang', coalesce((
        select jsonb_agg(jsonb_build_object(
          'lahan_id', l.lahan_id, 'kode', l.kode, 'status_sumber', l.status, 'outlet', nullif(l.outlet, ''), 'segmen', l.segmen,
          'luas_m2', nullif(l.luas_m2, 0), 'daya_w', l.daya_w, 'posisi', l.posisi,
          'status_ruang', v.status_ruang, 'alasan_ruang', v.alasan_ruang, 'status_data', v.status_data, 'kesiapan', v.kesiapan,
          'konfirmasi', v.konfirmasi_dealer, 'konfirmasi_waktu', v.konfirmasi_dealer_waktu, 'konfirmasi_catatan', v.konfirmasi_dealer_catatan,
          'foto', (select g.kunci from public.gambar g where g.spbu_id = l.spbu_id and g.lahan_id = l.lahan_id and g.jenis = 'lahan' order by g.urutan, g.id limit 1),
          'inspeksi', (select jsonb_build_object('id', i.id, 'status', i.status, 'milik_saya', i.pemeriksa = auth.uid(), 'pemeriksa', i.pemeriksa_email)
                       from public.inspeksi_lahan i where i.spbu_id = l.spbu_id and i.lahan_id = l.lahan_id
                       order by case when i.status in ('draf', 'diajukan', 'ditolak') then 0 else 1 end, i.diubah desc limit 1)
        ) order by case l.status when 'Tersedia' then 0 else 1 end, l.kode)
        from public.lahan l join public.v_status_lahan v on v.spbu_id = l.spbu_id and v.lahan_id = l.lahan_id
        where l.spbu_id = s.id and not l.duplikat), '[]'::jsonb)
    ) from public.spbu s where s.id = p_spbu_id
  ) end
$$;

-- Rincian inspeksi untuk pengelola SPBU: bentuknya sama dengan inspeksi_rinci.
create function public.dealer_inspeksi_rinci(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(i) - 'pemeriksa' || jsonb_build_object(
    'milik_saya', i.pemeriksa = auth.uid(),
    'kurang', to_jsonb(public.inspeksi_kurang(i.id)),
    'foto', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kunci', f.kunci, 'lebar', f.lebar, 'tinggi', f.tinggi,
                                                          'label', null, 'diunggah', f.diunggah) order by f.diunggah, f.id)
                      from public.inspeksi_foto f where f.inspeksi_id = i.id), '[]'::jsonb),
    'lahan', (select jsonb_build_object('status', l.status, 'luas_m2', l.luas_m2, 'daya_w', l.daya_w, 'panjang_m', l.panjang_m,
                                        'lebar_m', l.lebar_m, 'posisi', l.posisi, 'lantai', l.lantai, 'tarif_tahunan', null,
                                        'kota', s.kota, 'provinsi', s.provinsi, 'alamat', s.alamat)
              from public.lahan l join public.spbu s on s.id = l.spbu_id
              where l.spbu_id = i.spbu_id and l.lahan_id = i.lahan_id and not l.duplikat limit 1)
  )
  from public.inspeksi_lahan i where i.id = p_id and public.dealer_kelola_spbu(i.spbu_id)
$$;

-- Kartu keputusan untuk pengelola SPBU: siapa calon tenantnya, ruang mana, syarat yang ditawarkan,
-- manfaat menurut pengaturan sewa yang sudah dipastikan, kesiapan, dan siapa yang berwenang memutuskan.
create function public.dealer_persetujuan_rinci(p_peluang_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'peluang_id', p.id, 'lahan_kode', p.lahan_kode, 'tahap_persetujuan', p.tahap = 'persetujuan',
    'spbu', jsonb_build_object('id', p.spbu_id, 'nomor', p.spbu_nomor, 'kota', p.kota),
    'tenant', jsonb_build_object('nama', coalesce(c.nama_usaha, p.tenant_nama), 'segmen', p.segmen, 'baru', p.calon_id is not null,
                                 'deskripsi', c.deskripsi, 'jumlah_gerai', c.jumlah_gerai,
                                 'jaringan_spbu', (select t.spbu from public.v_tenant_profil t where t.kunci = p.tenant_kunci)),
    'ruang', (select jsonb_build_object('luas_m2', nullif(l.luas_m2, 0), 'daya_w', l.daya_w, 'posisi', l.posisi, 'lantai', l.lantai)
              from public.lahan l where l.spbu_id = p.spbu_id and l.lahan_id = p.lahan_id and not l.duplikat limit 1),
    'foto', public.daftar_gambar(p.spbu_id, p.lahan_id, 'lahan'),
    'syarat', (select to_jsonb(v) - 'id' - 'peluang_id' - 'dibuat_oleh' - 'diterbitkan_oleh' - 'dibuat'
               from public.penawaran_versi v where v.peluang_id = p.id and v.status = 'diterbitkan'),
    'hak', jsonb_build_object('pola', h.pola, 'penyetuju', h.penyetuju, 'pihak_kontrak', h.pihak_kontrak, 'penerima_sewa', h.penerima_sewa,
                              'bagi_hasil', h.bagi_hasil, 'dealer_berwenang', h.dealer_berwenang, 'status', h.status),
    'kesiapan', (select jsonb_build_object('kesiapan', st.kesiapan, 'pembatasan', st.pembatasan, 'status_data', st.status_data)
                 from public.v_status_lahan st where st.spbu_id = p.spbu_id and st.lahan_id = p.lahan_id limit 1),
    'usaha_ada', coalesce((select jsonb_agg(distinct x.segmen) from public.lahan x
                           where x.spbu_id = p.spbu_id and x.status = 'Tersewa' and not x.duplikat), '[]'::jsonb),
    'persetujuan', coalesce((select jsonb_agg(jsonb_build_object('pihak', a.pihak, 'status', a.status, 'diputuskan', a.diputuskan,
                                                                 'alasan', case when a.pihak = 'dealer' then a.alasan end)
                                              order by array_position(array['dealer', 'hsse', 'nfr', 'tenant'], a.pihak))
                             from public.persetujuan a join public.penawaran_versi v on v.id = a.penawaran_id
                             where a.peluang_id = p.id and not a.gugur and v.status = 'diterbitkan'), '[]'::jsonb),
    'peran_saya', (select k.peran from public.keanggotaan k where k.organisasi_id = h.organisasi_dealer and k.user_id = auth.uid())
  )
  from public.peluang p
  join public.hak_spbu h on h.spbu_id = p.spbu_id
  left join public.calon_tenant c on c.id = p.calon_id
  where p.id = p_peluang_id and public.dealer_kelola_spbu(p.spbu_id)
    and exists (select 1 from public.penawaran_versi v where v.peluang_id = p.id and v.status = 'diterbitkan')
$$;

-- Admin dealer memutuskan persetujuan pihaknya, hanya bila organisasinya penyetuju yang sah untuk SPBU itu.
create function public.dealer_putuskan(p_peluang_id uuid, p_keputusan text, p_alasan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v        public.peluang;
  h        public.hak_spbu;
  s        public.persetujuan;
  d        public.penawaran_versi;
  v_peran  text;
  v_org    text;
  v_alasan text := nullif(left(btrim(coalesce(p_alasan, '')), 1000), '');
begin
  select * into v from public.peluang where id = p_peluang_id for update;
  if v.id is null or not public.dealer_kelola_spbu(v.spbu_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Usulan ini tidak ditemukan di SPBU yang Anda kelola.');
  end if;
  select * into h from public.hak_spbu where spbu_id = v.spbu_id;
  select k.peran, o.nama into v_peran, v_org
  from public.keanggotaan k join public.organisasi o on o.id = k.organisasi_id
  where k.organisasi_id = h.organisasi_dealer and k.user_id = auth.uid();
  if h.status <> 'dipastikan' or not h.dealer_berwenang then
    return jsonb_build_object('ok', false, 'pesan',
      'Keputusan untuk SPBU ini diambil oleh ' || coalesce(h.penyetuju, 'pihak yang berwenang') || '. Sampaikan pendapat Anda ke tim Non Fuel Retail.');
  end if;
  if v_peran <> 'dealer_admin' then
    return jsonb_build_object('ok', false, 'pesan', 'Keputusan atas nama organisasi diambil admin dealer.');
  end if;
  if p_keputusan not in ('disetujui', 'minta_revisi', 'ditolak') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan keputusan tidak dikenal.');
  end if;
  if v.tahap <> 'persetujuan' then
    return jsonb_build_object('ok', false, 'pesan', 'Usulan ini belum sampai tahap persetujuan.');
  end if;
  select * into d from public.penawaran_versi where peluang_id = p_peluang_id and status = 'diterbitkan';
  select * into s from public.persetujuan where penawaran_id = d.id and pihak = 'dealer' and not gugur for update;
  if s.id is null or s.status <> 'menunggu' then
    return jsonb_build_object('ok', false, 'pesan', 'Keputusan atas versi ini sudah tercatat. Perubahan syarat butuh versi penawaran baru.');
  end if;
  if p_keputusan <> 'disetujui' and (v_alasan is null or length(v_alasan) < 10) then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis alasannya dulu, paling sedikit 10 huruf.');
  end if;
  update public.persetujuan
  set status = p_keputusan, penyetuju = auth.uid(), penyetuju_email = public.email_saya(), atas_nama = false,
      wewenang = 'Admin dealer, ' || v_org, alasan = v_alasan, diputuskan = now()
  where id = s.id;
  update public.peluang set diubah = now() where id = p_peluang_id;
  perform public.audit_catat('persetujuan_diputuskan', 'peluang', p_peluang_id::text, jsonb_build_object(
    'persetujuan_id', s.id, 'pihak', 'dealer', 'keputusan', p_keputusan, 'alasan', v_alasan, 'atas_nama', false,
    'wewenang', 'Admin dealer, ' || v_org, 'penawaran_id', d.id, 'versi', d.versi));
  return jsonb_build_object('ok', true, 'pesan',
    case p_keputusan when 'disetujui' then 'Persetujuan Anda tercatat untuk versi ' || d.versi || '.'
                     when 'minta_revisi' then 'Permintaan perubahan tercatat. Tim Non Fuel Retail akan menyusun versi baru.'
                     else 'Penolakan Anda tercatat.' end);
end
$$;

-- ---------------------------------------------------------------- hak panggil

revoke execute on function
  public.hak_spbu_simpan(text, jsonb), public.hak_spbu_pastikan(text), public.hak_spbu_rinci(text),
  public.dealer_kelola_spbu(text), public.adalah_dealer(), public.boleh_ubah_inspeksi(),
  public.dealer_konfirmasi_ruang(text, boolean, text), public.inspeksi_boleh_isi(uuid), public.inspeksi_boleh_lihat(uuid),
  public.dealer_ringkasan(), public.dealer_spbu_rinci(text), public.dealer_inspeksi_rinci(uuid),
  public.dealer_persetujuan_rinci(uuid), public.dealer_putuskan(uuid, text, text)
from public, anon;

grant execute on function
  public.hak_spbu_simpan(text, jsonb), public.hak_spbu_pastikan(text), public.hak_spbu_rinci(text),
  public.dealer_kelola_spbu(text), public.adalah_dealer(), public.boleh_ubah_inspeksi(),
  public.dealer_konfirmasi_ruang(text, boolean, text), public.inspeksi_boleh_isi(uuid), public.inspeksi_boleh_lihat(uuid),
  public.dealer_ringkasan(), public.dealer_spbu_rinci(text), public.dealer_inspeksi_rinci(uuid),
  public.dealer_persetujuan_rinci(uuid), public.dealer_putuskan(uuid, text, text)
to authenticated;

notify pgrst, 'reload schema';
