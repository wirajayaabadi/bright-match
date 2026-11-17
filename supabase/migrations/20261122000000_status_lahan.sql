-- Bright Match 2.0 · irisan kedua: tiga status lahan yang terpisah dan pemeriksaan kesiapan lokasi.
--
-- Setiap lahan kini punya tiga status yang berdiri sendiri, tidak digabung menjadi satu:
--   status ruang    tersedia, ditahan, terisi, tidak tersedia   (ketersediaan fisik)
--   status data     belum diverifikasi, terverifikasi, disengketakan, ditolak
--   kesiapan        belum diketahui, perlu inspeksi, siap, belum siap
-- Data sumber (Brightspace) tetap apa adanya. Yang disimpan di sini adalah keputusan dan hasil pemeriksaan
-- manusia, tanpa foreign key ke lahan agar tidak terhapus saat data dimuat ulang.
--
-- Lahan baru terverifikasi setelah inspeksi lokasinya (dengan foto bukti) ditinjau dan diterima oleh
-- orang lain yang berwenang. Verifikasi gugur sendiri bila data sumber lahan itu berubah.
-- Penawaran resmi (tahap penawaran ke atas) kini mensyaratkan lahan tersedia dan terverifikasi.

-- ================================================================ tabel

create table public.status_lahan (
  spbu_id            text not null,
  lahan_id           text not null,
  lahan_kode         text not null,
  status_ruang       text check (status_ruang in ('ditahan', 'tidak_tersedia')),     -- null = mengikuti sumber
  alasan_ruang       text,
  status_data        text check (status_data in ('terverifikasi', 'ditolak')),      -- null = belum diverifikasi
  kesiapan           text check (kesiapan in ('siap', 'belum_siap')),               -- null = belum diketahui
  pembatasan         text,                                                           -- pembatasan operasional
  sidik_sumber       text,                              -- sidik data sumber saat diverifikasi
  inspeksi_id        uuid,                              -- inspeksi yang menjadi dasar verifikasi
  diverifikasi       timestamptz,
  diverifikasi_oleh  text,
  diubah             timestamptz not null default now(),
  diubah_oleh        text,
  primary key (spbu_id, lahan_id),
  constraint status_ruang_beralasan check (status_ruang is null or alasan_ruang is not null)
);

comment on table public.status_lahan is 'Keputusan tim atas satu lahan: penahanan, verifikasi data, dan kesiapan. Tidak mengubah data sumber.';

create table public.inspeksi_lahan (
  id              uuid primary key default gen_random_uuid(),
  spbu_id         text not null,
  lahan_id        text not null,
  lahan_kode      text not null,
  spbu_nomor      text not null,
  status          text not null default 'draf' check (status in ('draf', 'diajukan', 'diterima', 'ditolak')),
  isi             jsonb not null default '{}'::jsonb,   -- jawaban daftar periksa
  hasil           text check (hasil in ('siap', 'belum_siap')),
  pemeriksa       uuid references auth.users (id) on delete set null,
  pemeriksa_email text,
  dibuat          timestamptz not null default now(),
  diubah          timestamptz not null default now(),
  diajukan        timestamptz,
  peninjau_email  text,
  ditinjau        timestamptz,
  catatan_tinjau  text
);

create index inspeksi_lahan_idx on public.inspeksi_lahan (lahan_id, spbu_id);
create index inspeksi_status_idx on public.inspeksi_lahan (status, diubah desc);
-- Satu lahan hanya boleh punya satu inspeksi yang masih berjalan.
create unique index inspeksi_berjalan_tunggal on public.inspeksi_lahan (spbu_id, lahan_id) where status in ('draf', 'diajukan');

comment on table public.inspeksi_lahan is 'Pemeriksaan kesiapan lokasi satu lahan: daftar periksa, foto bukti, kesimpulan, dan hasil tinjauan.';

create table public.inspeksi_foto (
  id           uuid primary key default gen_random_uuid(),
  inspeksi_id  uuid not null references public.inspeksi_lahan (id) on delete cascade,
  kunci        text not null unique,                    -- kunci objek di bucket: inspeksi/<inspeksi>/<foto>.jpg
  keterangan   text,
  lebar        integer,
  tinggi       integer,
  bytes        integer,
  diunggah     timestamptz not null default now(),
  diunggah_oleh text
);

create index inspeksi_foto_idx on public.inspeksi_foto (inspeksi_id, diunggah);

alter table public.status_lahan enable row level security;
alter table public.inspeksi_lahan enable row level security;
alter table public.inspeksi_foto enable row level security;
create policy "Tim NFR membaca status lahan" on public.status_lahan for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca inspeksi" on public.inspeksi_lahan for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca foto inspeksi" on public.inspeksi_foto for select to authenticated using ((select public.adalah_nfr()));
revoke all on public.status_lahan, public.inspeksi_lahan, public.inspeksi_foto from anon, authenticated;
grant select on public.status_lahan, public.inspeksi_lahan, public.inspeksi_foto to authenticated;

-- ================================================================ status efektif

-- Sidik data sumber satu lahan. Bila salah satu nilai ini berubah setelah diverifikasi, verifikasinya gugur.
create function public.sidik_lahan(l public.lahan) returns text
language sql immutable set search_path = '' as $$
  select md5(concat_ws('|', l.status, coalesce(l.luas_m2::text, '-'), coalesce(l.daya_w::text, '-'),
                       coalesce(l.harga::text, '-'), coalesce(l.periode, '-'), coalesce(l.posisi, '-')))
$$;

create view public.v_status_lahan with (security_invoker = true) as
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
  s.pembatasan, s.inspeksi_id, s.diverifikasi, s.diverifikasi_oleh
from public.lahan l
left join public.status_lahan s on s.spbu_id = l.spbu_id and s.lahan_id = l.lahan_id
cross join lateral (
  select exists (select 1 from public.masalah_data m
                 where m.tingkat = 'kritis' and m.status in ('terbuka', 'ditinjau') and l.lahan_id = any (m.lahan_ids)) as ada) k
cross join lateral (
  select exists (select 1 from public.inspeksi_lahan i
                 where i.spbu_id = l.spbu_id and i.lahan_id = l.lahan_id and i.status in ('draf', 'diajukan')) as ada) b
where not l.duplikat;

comment on view public.v_status_lahan is 'Tiga status efektif tiap lahan: ruang, data, dan kesiapan, dihitung dari sumber, temuan, dan keputusan tim.';
grant select on public.v_status_lahan to authenticated;

-- Boleh tidaknya satu lahan ditawarkan resmi, beserta alasannya. Dipakai aturan tahap dan kartu penawaran.
create function public.lahan_boleh_ditawarkan(p_lahan_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v record;
begin
  if auth.uid() is not null and not public.adalah_nfr() then
    return null;
  end if;
  select * into v from public.v_status_lahan where lahan_id = p_lahan_id limit 1;
  if not found then
    return jsonb_build_object('boleh', false, 'kode', 'tidak_ada', 'alasan', 'Lahan ini tidak ada lagi di data terbaru.');
  end if;
  if v.status_data = 'disengketakan' then
    return jsonb_build_object('boleh', false, 'kode', 'disengketakan', 'alasan',
      'Lahan ini masih punya temuan data kritis yang belum diputuskan. Selesaikan dulu di Validasi data sebelum penawaran resmi.');
  end if;
  if v.status_ruang <> 'tersedia' then
    return jsonb_build_object('boleh', false, 'kode', v.status_ruang, 'alasan',
      case v.status_ruang when 'ditahan' then 'Lahan ini sedang ditahan' || coalesce(': ' || v.alasan_ruang, '') || '. Lepas penahanannya sebelum penawaran resmi.'
                          when 'tidak_tersedia' then 'Lahan ini ditandai tidak tersedia' || coalesce(': ' || v.alasan_ruang, '') || '.'
                          else 'Lahan ini sudah terisi di data terbaru.' end);
  end if;
  if v.status_data <> 'terverifikasi' then
    return jsonb_build_object('boleh', false, 'kode', case when v.verifikasi_usang then 'usang' else v.status_data end, 'alasan',
      case when v.verifikasi_usang
           then 'Data lahan ini berubah di sumber sejak terakhir diverifikasi. Lakukan inspeksi lokasi lagi sebelum penawaran resmi.'
           else 'Data lahan ini belum diverifikasi. Lakukan inspeksi lokasi dan minta hasilnya ditinjau sebelum penawaran resmi.' end);
  end if;
  return jsonb_build_object('boleh', true, 'kode', 'boleh', 'alasan', null);
end
$$;

-- ================================================================ penahanan lahan

-- Menahan lahan kosong (mis. sedang dipakai sementara) atau menandainya tidak tersedia; 'tersedia' melepasnya.
create function public.status_ruang_ubah(p_lahan_id text, p_status text, p_alasan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l        public.lahan;
  v_alasan text := nullif(left(btrim(coalesce(p_alasan, '')), 500), '');
  v_lama   text;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda hanya bisa membaca status lahan.');
  end if;
  if p_status not in ('tersedia', 'ditahan', 'tidak_tersedia') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan status ruang tidak dikenal.');
  end if;
  select * into l from public.lahan where lahan_id = p_lahan_id and not duplikat limit 1;
  if l.lahan_id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Lahan tidak ditemukan.');
  end if;
  if l.status <> 'Tersedia' then
    return jsonb_build_object('ok', false, 'pesan', 'Lahan ini sudah terisi menurut Brightspace, jadi ketersediaannya tidak bisa diubah di sini.');
  end if;
  if p_status <> 'tersedia' and (v_alasan is null or length(v_alasan) < 5) then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis alasannya dulu, misalnya siapa yang memakai lahan ini dan sampai kapan.');
  end if;
  select status_ruang into v_lama from public.status_lahan where spbu_id = l.spbu_id and lahan_id = l.lahan_id;

  insert into public.status_lahan as s (spbu_id, lahan_id, lahan_kode, status_ruang, alasan_ruang, diubah, diubah_oleh)
  values (l.spbu_id, l.lahan_id, l.kode, nullif(p_status, 'tersedia'), case when p_status = 'tersedia' then null else v_alasan end,
          now(), public.email_saya())
  on conflict (spbu_id, lahan_id) do update set
    status_ruang = excluded.status_ruang, alasan_ruang = excluded.alasan_ruang, diubah = now(), diubah_oleh = excluded.diubah_oleh;
  perform public.audit_catat('status_ruang_diubah', 'lahan', l.lahan_id, jsonb_build_object(
    'lahan_kode', l.kode, 'dari', coalesce(v_lama, 'tersedia'), 'ke', p_status, 'alasan', v_alasan));
  return jsonb_build_object('ok', true, 'pesan',
    case p_status when 'tersedia' then 'Lahan kembali tersedia.' when 'ditahan' then 'Lahan ditahan.' else 'Lahan ditandai tidak tersedia.' end);
end
$$;

-- ================================================================ inspeksi lokasi

-- Memulai inspeksi satu lahan kosong, atau membuka kembali inspeksi yang masih berjalan.
create function public.inspeksi_mulai(p_lahan_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l    record;
  v_id uuid;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa memulai inspeksi.');
  end if;
  select x.lahan_id, x.spbu_id, x.kode, x.status, s.nomor into l
  from public.lahan x join public.spbu s on s.id = x.spbu_id
  where x.lahan_id = p_lahan_id and not x.duplikat limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'pesan', 'Lahan tidak ditemukan.');
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

-- Menyimpan jawaban daftar periksa (draf). Hanya kunci yang dikenal yang disimpan.
-- Inspeksi yang ditolak kembali menjadi draf saat disimpan lagi oleh pemeriksanya.
create function public.inspeksi_simpan(p_id uuid, p_isi jsonb, p_hasil text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v     public.inspeksi_lahan;
  v_isi jsonb := '{}'::jsonb;
  k     text;
  angka constant text := '^[0-9]{1,7}([.][0-9]{1,2})?$';
begin
  if not public.boleh_ubah_nfr() then
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

-- Butir wajib yang belum terisi, sebagai daftar nama untuk pesan ke pengguna.
create function public.inspeksi_kurang(p_id uuid) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    case when coalesce((i.isi ->> 'luas_m2')::numeric, 0) <= 0 then 'luas terukur' end,
    case when i.isi ->> 'daya_w' is null then 'daya listrik' end,
    case when i.isi ->> 'air' is null then 'ketersediaan air' end,
    case when i.isi ->> 'akses' is null then 'akses kendaraan' end,
    case when i.isi ->> 'parkir' is null then 'parkir' end,
    case when i.isi ->> 'pembatasan' is null
           or (i.isi ->> 'pembatasan' = 'ada' and i.isi ->> 'pembatasan_rinci' is null) then 'pembatasan keselamatan' end,
    case when (select count(*) from public.inspeksi_foto f where f.inspeksi_id = i.id) < 2 then 'paling sedikit dua foto' end,
    case when i.hasil is null then 'kesimpulan' end
  ], null)
  from public.inspeksi_lahan i where i.id = p_id
$$;

create function public.inspeksi_ajukan(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v        public.inspeksi_lahan;
  v_kurang text[];
begin
  if not public.boleh_ubah_nfr() then
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

-- Meninjau inspeksi yang diajukan. Peninjau harus admin atau penyetuju NFR dan bukan pemeriksanya sendiri.
-- Diterima: lahan menjadi terverifikasi dan kesiapannya mengikuti kesimpulan inspeksi.
create function public.inspeksi_tinjau(p_id uuid, p_keputusan text, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v         public.inspeksi_lahan;
  l         public.lahan;
  v_catatan text := nullif(left(btrim(coalesce(p_catatan, '')), 1000), '');
begin
  if coalesce(public.peran_nfr(), '') not in ('nfr_admin', 'nfr_penyetuju') then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi ditinjau oleh admin atau penyetuju NFR.');
  end if;
  if p_keputusan not in ('diterima', 'ditolak') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan tinjauan tidak dikenal.');
  end if;
  select * into v from public.inspeksi_lahan where id = p_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi tidak ditemukan.');
  end if;
  if v.status <> 'diajukan' then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi ini tidak sedang menunggu tinjauan.');
  end if;
  if v.pemeriksa = auth.uid() then
    return jsonb_build_object('ok', false, 'pesan', 'Inspeksi harus ditinjau orang lain, bukan pemeriksanya sendiri.');
  end if;
  if p_keputusan = 'ditolak' and (v_catatan is null or length(v_catatan) < 10) then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis apa yang perlu diperbaiki, paling sedikit 10 huruf.');
  end if;

  if p_keputusan = 'diterima' then
    select * into l from public.lahan where spbu_id = v.spbu_id and lahan_id = v.lahan_id and not duplikat limit 1;
    if l.lahan_id is null or l.status <> 'Tersedia' then
      return jsonb_build_object('ok', false, 'pesan', 'Lahan ini tidak lagi kosong di data terbaru, jadi inspeksinya tidak bisa diterima.');
    end if;
    if public.lahan_tertahan(v.lahan_id) then
      return jsonb_build_object('ok', false, 'pesan', 'Lahan ini masih punya temuan data kritis. Putuskan dulu temuannya di Validasi data.');
    end if;
    insert into public.status_lahan as s (spbu_id, lahan_id, lahan_kode, status_data, kesiapan, pembatasan, sidik_sumber,
                                          inspeksi_id, diverifikasi, diverifikasi_oleh, diubah, diubah_oleh)
    values (v.spbu_id, v.lahan_id, v.lahan_kode, 'terverifikasi', v.hasil, v.isi ->> 'pembatasan_rinci', public.sidik_lahan(l),
            v.id, now(), public.email_saya(), now(), public.email_saya())
    on conflict (spbu_id, lahan_id) do update set
      status_data = excluded.status_data, kesiapan = excluded.kesiapan, pembatasan = excluded.pembatasan,
      sidik_sumber = excluded.sidik_sumber, inspeksi_id = excluded.inspeksi_id, diverifikasi = excluded.diverifikasi,
      diverifikasi_oleh = excluded.diverifikasi_oleh, diubah = now(), diubah_oleh = excluded.diubah_oleh;
  end if;

  update public.inspeksi_lahan
  set status = p_keputusan, peninjau_email = public.email_saya(), ditinjau = now(), catatan_tinjau = v_catatan, diubah = now()
  where id = p_id;
  perform public.audit_catat('inspeksi_ditinjau', 'lahan', v.lahan_id, jsonb_build_object(
    'inspeksi_id', p_id, 'lahan_kode', v.lahan_kode, 'keputusan', p_keputusan, 'catatan', v_catatan,
    'hasil', v.hasil, 'isi', v.isi));
  return jsonb_build_object('ok', true, 'pesan',
    case p_keputusan when 'diterima' then 'Inspeksi diterima. Lahan sekarang terverifikasi.'
                     else 'Inspeksi dikembalikan ke pemeriksa untuk diperbaiki.' end);
end
$$;

-- Foto bukti. Berkasnya diunggah aplikasi ke bucket; fungsi ini mencatatnya. Hanya pemeriksa, hanya saat draf.
create function public.inspeksi_foto_tambah(p_inspeksi_id uuid, p_kunci text, p_lebar integer, p_tinggi integer, p_bytes integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.inspeksi_lahan; v_id uuid;
begin
  if not public.boleh_ubah_nfr() then
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

create function public.inspeksi_foto_hapus(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_kunci text; v_inspeksi uuid;
begin
  if not public.boleh_ubah_nfr() then
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

-- ================================================================ kueri baca (mengikuti RLS)

-- Tiga status satu lahan, dasar verifikasinya, dan inspeksi yang pernah dibuat.
create function public.status_lahan_rinci(p_lahan_id text) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(v) || jsonb_build_object(
    'boleh', public.lahan_boleh_ditawarkan(v.lahan_id),
    'inspeksi', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'hasil', i.hasil, 'pemeriksa_email', i.pemeriksa_email,
                                          'diubah', i.diubah, 'diajukan', i.diajukan, 'ditinjau', i.ditinjau,
                                          'peninjau_email', i.peninjau_email) order by i.dibuat desc)
      from public.inspeksi_lahan i where i.spbu_id = v.spbu_id and i.lahan_id = v.lahan_id), '[]'::jsonb)
  )
  from public.v_status_lahan v where v.lahan_id = p_lahan_id limit 1
$$;

create function public.inspeksi_rinci(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(i) || jsonb_build_object(
    'milik_saya', i.pemeriksa = auth.uid(),
    'kurang', to_jsonb(public.inspeksi_kurang(i.id)),
    'foto', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kunci', f.kunci, 'lebar', f.lebar, 'tinggi', f.tinggi,
                                                          'label', null, 'diunggah', f.diunggah) order by f.diunggah, f.id)
                      from public.inspeksi_foto f where f.inspeksi_id = i.id), '[]'::jsonb),
    'lahan', (select jsonb_build_object('status', l.status, 'luas_m2', l.luas_m2, 'daya_w', l.daya_w, 'panjang_m', l.panjang_m,
                                        'lebar_m', l.lebar_m, 'posisi', l.posisi, 'lantai', l.lantai, 'tarif_tahunan', l.tarif_tahunan,
                                        'kota', s.kota, 'provinsi', s.provinsi, 'alamat', s.alamat)
              from public.lahan l join public.spbu s on s.id = l.spbu_id
              where l.spbu_id = i.spbu_id and l.lahan_id = i.lahan_id and not l.duplikat limit 1),
    'status_lahan', (select to_jsonb(v) from public.v_status_lahan v where v.spbu_id = i.spbu_id and v.lahan_id = i.lahan_id limit 1)
  )
  from public.inspeksi_lahan i where i.id = p_id
$$;

create function public.inspeksi_daftar(p_status text default 'berjalan', p_cari text default null, p_halaman integer default 1)
returns jsonb
language sql stable set search_path = '' as $$
with
cocok as (
  select i.id, i.lahan_id, i.lahan_kode, i.spbu_id, i.spbu_nomor, i.status, i.hasil, i.pemeriksa_email, i.diubah,
         i.diajukan, i.ditinjau, i.peninjau_email,
         (select count(*) from public.inspeksi_foto f where f.inspeksi_id = i.id) as foto
  from public.inspeksi_lahan i
  where (case coalesce(p_status, 'berjalan')
           when 'berjalan' then i.status in ('draf', 'diajukan', 'ditolak')
           when 'semua' then true
           else i.status = p_status end)
    and (nullif(btrim(p_cari), '') is null
         or i.spbu_nomor ilike '%' || btrim(p_cari) || '%' or i.lahan_kode ilike '%' || btrim(p_cari) || '%')
),
halaman as (
  select * from cocok
  order by case status when 'diajukan' then 1 when 'ditolak' then 2 when 'draf' then 3 else 4 end, diubah desc, id
  limit 25 offset (greatest(coalesce(p_halaman, 1), 1) - 1) * 25
)
select jsonb_build_object(
  'total', (select count(*) from cocok),
  'baris', coalesce((select jsonb_agg(to_jsonb(h) order by case h.status when 'diajukan' then 1 when 'ditolak' then 2 when 'draf' then 3 else 4 end,
                                                          h.diubah desc, h.id) from halaman h), '[]'::jsonb),
  'ringkasan', jsonb_build_object(
    'lahan_kosong', (select count(*) from public.lahan where status = 'Tersedia' and not duplikat),
    'terverifikasi', (select count(*) from public.v_status_lahan where status_sumber = 'Tersedia' and status_data = 'terverifikasi'),
    'siap', (select count(*) from public.v_status_lahan where status_sumber = 'Tersedia' and status_data = 'terverifikasi' and kesiapan = 'siap'),
    'menunggu', (select count(*) from public.inspeksi_lahan where status = 'diajukan'))
)
$$;

-- ================================================================ aturan tahap: penawaran butuh lahan terverifikasi

create or replace function public.peluang_ubah_tahap(p_id uuid, p_tahap text, p_oleh text default null, p_catatan text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_urutan  constant text[] := array['baru', 'dihubungi', 'survei', 'penawaran', 'negosiasi', 'kontrak'];
  v         public.peluang;
  v_dari    integer;
  v_ke      integer;
  v_belum   integer;
  v_sebelum text;
  v_alasan  text := nullif(left(btrim(coalesce(p_catatan, '')), 500), '');
  v_oleh    text := public.email_saya();
  v_boleh   jsonb;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa mengubah tahap peluang.');
  end if;
  if p_tahap <> 'batal' and array_position(v_urutan, p_tahap) is null then
    return jsonb_build_object('ok', false, 'pesan', 'Tahap tidak dikenal.');
  end if;
  select * into v from public.peluang where id = p_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang tidak ditemukan.');
  end if;
  if v.tahap = p_tahap then
    return jsonb_build_object('ok', true, 'pesan', 'Tahap tidak berubah.');
  end if;

  if p_tahap = 'batal' then
    if v_alasan is null then
      return jsonb_build_object('ok', false, 'pesan', 'Tulis alasan pembatalan di kolom alasan.');
    end if;
  elsif v.tahap = 'batal' then
    select r.tahap_dari into v_sebelum from public.peluang_riwayat r
    where r.peluang_id = p_id and r.tahap_ke = 'batal' order by r.waktu desc, r.id desc limit 1;
    if p_tahap is distinct from coalesce(v_sebelum, 'baru') then
      return jsonb_build_object('ok', false, 'pesan',
        'Peluang yang batal hanya bisa dibuka kembali ke tahap sebelum dibatalkan.');
    end if;
    if v_alasan is null then
      return jsonb_build_object('ok', false, 'pesan', 'Tulis alasan membuka kembali peluang ini.');
    end if;
  else
    v_dari := array_position(v_urutan, v.tahap);
    v_ke := array_position(v_urutan, p_tahap);
    if v_ke > v_dari + 1 then
      return jsonb_build_object('ok', false, 'pesan', 'Tahap tidak bisa dilompati. Pindahkan satu tahap demi satu tahap.');
    end if;
    if v_ke < v_dari - 1 then
      return jsonb_build_object('ok', false, 'pesan', 'Peluang hanya bisa dimundurkan satu tahap setiap kali.');
    end if;
    if v_ke < v_dari and v_alasan is null then
      return jsonb_build_object('ok', false, 'pesan', 'Tulis alasan memundurkan tahap di kolom alasan.');
    end if;
  end if;

  if p_tahap in ('penawaran', 'negosiasi', 'kontrak') then
    v_boleh := public.lahan_boleh_ditawarkan(v.lahan_id);
    if not (v_boleh ->> 'boleh')::boolean then
      return jsonb_build_object('ok', false, 'pesan', v_boleh ->> 'alasan');
    end if;
  end if;
  if p_tahap = 'kontrak' then
    select count(*) into v_belum from public.peluang_syarat where peluang_id = p_id and not terpenuhi;
    if v_belum > 0 then
      return jsonb_build_object('ok', false, 'pesan',
        v_belum || ' persyaratan belum terpenuhi. Lengkapi dulu sebelum masuk tahap kontrak.');
    end if;
  end if;

  update public.peluang set tahap = p_tahap, diubah = now() where id = p_id;
  insert into public.peluang_riwayat (peluang_id, tahap_dari, tahap_ke, oleh, catatan)
  values (p_id, v.tahap, p_tahap, v_oleh, v_alasan);
  perform public.audit_catat('tahap_diubah', 'peluang', p_id::text,
    jsonb_build_object('dari', v.tahap, 'ke', p_tahap, 'alasan', v_alasan, 'lahan_kode', v.lahan_kode));
  return jsonb_build_object('ok', true, 'pesan', 'Tahap diperbarui.');
end
$$;

-- ---------------------------------------------------------------- hak panggil

revoke execute on function
  public.sidik_lahan(public.lahan), public.lahan_boleh_ditawarkan(text), public.status_ruang_ubah(text, text, text),
  public.inspeksi_mulai(text), public.inspeksi_simpan(uuid, jsonb, text), public.inspeksi_kurang(uuid),
  public.inspeksi_ajukan(uuid), public.inspeksi_tinjau(uuid, text, text),
  public.inspeksi_foto_tambah(uuid, text, integer, integer, integer), public.inspeksi_foto_hapus(uuid),
  public.status_lahan_rinci(text), public.inspeksi_rinci(uuid), public.inspeksi_daftar(text, text, integer)
from public, anon;

grant execute on function
  public.sidik_lahan(public.lahan), public.lahan_boleh_ditawarkan(text), public.status_ruang_ubah(text, text, text),
  public.inspeksi_mulai(text), public.inspeksi_simpan(uuid, jsonb, text), public.inspeksi_kurang(uuid),
  public.inspeksi_ajukan(uuid), public.inspeksi_tinjau(uuid, text, text),
  public.inspeksi_foto_tambah(uuid, text, integer, integer, integer), public.inspeksi_foto_hapus(uuid),
  public.status_lahan_rinci(text), public.inspeksi_rinci(uuid), public.inspeksi_daftar(text, text, integer)
to authenticated;

notify pgrst, 'reload schema';
