-- Bright Match 2.0 · irisan ketiga: alur komersial lengkap.
--
-- 1. Dua belas tahap (dari peluang dibuat sampai pemantauan kinerja) dan lima hasil alternatif.
--    Tahap lama tetap sah, jadi peluang yang sudah ada tidak diubah.
-- 2. Tiap peluang punya pemilik, tindakan berikut, dan tenggat.
-- 3. Syarat masuk tiap tahap dihitung satu fungsi, dipakai aturan tahap dan ditampilkan di antarmuka.
-- 4. Penawaran berversi: syarat komersial disimpan per versi, tidak pernah ditimpa.
-- 5. Persetujuan empat pihak yang terikat pada satu versi. Versi baru menggugurkan persetujuan versi lama.
-- 6. Tanda tangan kontrak dan mulai beroperasi dicatat sebagai dua peristiwa terpisah,
--    dan terpisah pula dari kelengkapan daftar persyaratan.
--
-- Selama portal tenant dan dealer belum ada, keputusan pihak di luar NFR dicatat tim NFR "atas nama",
-- wajib dengan rujukan bukti dan keterangan wewenang, dan ditandai demikian.

-- ================================================================ peluang: tahap, pemilik, tindak lanjut

alter table public.peluang drop constraint if exists peluang_tahap_check;
alter table public.peluang add constraint peluang_tahap_check check (tahap in (
  'baru', 'terverifikasi', 'terpilih', 'dihubungi', 'berminat', 'survei', 'penawaran', 'negosiasi',
  'persetujuan', 'kontrak', 'aktivasi', 'pemantauan',
  'menolak', 'ditarik', 'ditolak', 'kalah', 'batal'));

alter table public.peluang
  add column tindakan_berikut text,
  add column tenggat date;

comment on column public.peluang.pemilik is 'Email anggota NFR yang bertanggung jawab atas peluang ini.';
comment on column public.peluang.tindakan_berikut is 'Satu kalimat: apa yang harus dilakukan berikutnya.';

create function public.urutan_tahap() returns text[]
language sql immutable set search_path = '' as $$
  select array['baru', 'terverifikasi', 'terpilih', 'dihubungi', 'berminat', 'survei', 'penawaran', 'negosiasi',
               'persetujuan', 'kontrak', 'aktivasi', 'pemantauan']
$$;

create function public.hasil_akhir() returns text[]
language sql immutable set search_path = '' as $$
  select array['menolak', 'ditarik', 'ditolak', 'kalah', 'batal']
$$;

-- ================================================================ penawaran berversi

create table public.penawaran_versi (
  id                uuid primary key default gen_random_uuid(),
  peluang_id        uuid not null references public.peluang (id) on delete cascade,
  versi             integer not null,
  status            text not null default 'draf' check (status in ('draf', 'diterbitkan', 'digantikan')),
  sewa_tahunan      numeric not null check (sewa_tahunan >= 0),
  lama_sewa_bulan   integer not null check (lama_sewa_bulan between 1 and 360),
  skema             text not null check (skema in ('sewa_tetap', 'bagi_hasil', 'campuran')),
  bagi_hasil_pct    numeric check (bagi_hasil_pct > 0 and bagi_hasil_pct <= 100),
  deposit           numeric check (deposit >= 0),
  bebas_sewa_bulan  integer not null default 0 check (bebas_sewa_bulan between 0 and 36),
  mulai_rencana     date,
  -- siapa penerima sewa tidak pernah diandaikan: harus dipilih sebelum penawaran diterbitkan
  penerima_sewa     text not null default 'belum_dipastikan'
                      check (penerima_sewa in ('belum_dipastikan', 'pertamina', 'pemilik_spbu', 'dibagi')),
  catatan           text,
  dibuat            timestamptz not null default now(),
  dibuat_oleh       text,
  diterbitkan       timestamptz,
  diterbitkan_oleh  text,
  unique (peluang_id, versi),
  constraint bagi_hasil_wajib check (skema = 'sewa_tetap' or bagi_hasil_pct is not null)
);

create unique index penawaran_draf_tunggal on public.penawaran_versi (peluang_id) where status = 'draf';
create unique index penawaran_berlaku_tunggal on public.penawaran_versi (peluang_id) where status = 'diterbitkan';

comment on table public.penawaran_versi is 'Syarat komersial yang ditawarkan, per versi. Versi yang sudah diterbitkan tidak pernah diubah.';
comment on column public.penawaran_versi.penerima_sewa is 'Tidak diandaikan milik Pertamina. Mengikuti pengaturan SPBU (COCO, DODO) yang sudah dipastikan.';

create table public.persetujuan (
  id               uuid primary key default gen_random_uuid(),
  peluang_id       uuid not null references public.peluang (id) on delete cascade,
  penawaran_id     uuid not null references public.penawaran_versi (id) on delete cascade,
  pihak            text not null check (pihak in ('nfr', 'dealer', 'tenant', 'hsse')),
  status           text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'minta_revisi', 'ditolak')),
  gugur            boolean not null default false,     -- true = versi penawarannya sudah digantikan
  penyetuju        uuid references auth.users (id) on delete set null,   -- pengguna yang memutuskan atau mencatat
  penyetuju_email  text,
  atas_nama        boolean not null default false,     -- true = dicatat tim NFR atas nama pihak itu
  wewenang         text,                               -- siapa yang memutuskan dan dalam kapasitas apa
  alasan           text,
  bukti            text,                               -- rujukan dokumen atau komunikasi yang menjadi dasar
  diputuskan       timestamptz,
  unique (penawaran_id, pihak)
);

create index persetujuan_peluang_idx on public.persetujuan (peluang_id, gugur);

comment on table public.persetujuan is 'Keputusan tiap pihak atas satu versi penawaran. Tidak pernah dipindahkan ke versi lain.';

create table public.kontrak_peluang (
  peluang_id            uuid primary key references public.peluang (id) on delete cascade,
  penawaran_id          uuid not null references public.penawaran_versi (id),
  nomor                 text not null,
  tanggal_tanda_tangan  date not null,
  dicatat               timestamptz not null default now(),
  dicatat_oleh          text,
  aktif_sejak           date,                          -- mulai beroperasi; terpisah dari tanda tangan
  aktif_dicatat         timestamptz,
  aktif_dicatat_oleh    text,
  constraint aktif_setelah_tanda_tangan check (aktif_sejak is null or aktif_sejak >= tanggal_tanda_tangan)
);

comment on table public.kontrak_peluang is 'Tanda tangan kontrak dan mulai beroperasi, dua peristiwa terpisah, terikat pada versi penawaran yang ditandatangani.';

alter table public.penawaran_versi enable row level security;
alter table public.persetujuan enable row level security;
alter table public.kontrak_peluang enable row level security;
create policy "Tim NFR membaca versi penawaran" on public.penawaran_versi for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca persetujuan" on public.persetujuan for select to authenticated using ((select public.adalah_nfr()));
create policy "Tim NFR membaca kontrak peluang" on public.kontrak_peluang for select to authenticated using ((select public.adalah_nfr()));
revoke all on public.penawaran_versi, public.persetujuan, public.kontrak_peluang from anon, authenticated;
grant select on public.penawaran_versi, public.persetujuan, public.kontrak_peluang to authenticated;

-- ================================================================ syarat masuk tahap

-- Syarat yang harus terpenuhi sebelum peluang masuk satu tahap. Satu sumber untuk aturan dan tampilan.
-- "Alasan wajib" (mundur, hasil akhir, konfirmasi minat) diperiksa peluang_ubah_tahap karena bergantung isian.
create function public.peluang_syarat_masuk(p_id uuid, p_tahap text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('butir', x.butir, 'terpenuhi', coalesce(x.ok, false), 'pesan', x.pesan) order by x.urut), '[]'::jsonb)
  from public.peluang p
  cross join lateral (
    select 1 as urut, 'Lahan tersedia dan datanya terverifikasi lewat inspeksi lokasi' as butir,
           (public.lahan_boleh_ditawarkan(p.lahan_id) ->> 'boleh')::boolean as ok,
           public.lahan_boleh_ditawarkan(p.lahan_id) ->> 'alasan' as pesan
    where p_tahap in ('terverifikasi', 'penawaran', 'negosiasi', 'persetujuan', 'kontrak')
    union all
    select 2, 'Peluang punya pemilik yang bertanggung jawab', p.pemilik is not null,
           'Tetapkan dulu pemilik peluang ini di bagian tindak lanjut.'
    where p_tahap = 'terpilih'
    union all
    select 3, 'Ada versi penawaran yang sudah diterbitkan',
           exists (select 1 from public.penawaran_versi v where v.peluang_id = p.id and v.status = 'diterbitkan'),
           'Belum ada versi penawaran yang diterbitkan. Susun dan terbitkan dulu di tab Penawaran.'
    where p_tahap in ('penawaran', 'negosiasi', 'persetujuan', 'kontrak')
    union all
    select 4, 'Keempat pihak menyetujui versi penawaran yang berlaku',
           (select count(*) from public.persetujuan s join public.penawaran_versi v on v.id = s.penawaran_id
            where s.peluang_id = p.id and not s.gugur and v.status = 'diterbitkan' and s.status = 'disetujui') = 4,
           'Belum semua pihak menyetujui versi penawaran yang berlaku. Lihat tab Persetujuan.'
    where p_tahap = 'kontrak'
    union all
    select 5, 'Semua persyaratan tiap pihak terpenuhi',
           not exists (select 1 from public.peluang_syarat s where s.peluang_id = p.id and not s.terpenuhi),
           (select count(*) from public.peluang_syarat s where s.peluang_id = p.id and not s.terpenuhi)
             || ' persyaratan belum terpenuhi. Lengkapi dulu di tab Persyaratan.'
    where p_tahap = 'kontrak'
    union all
    select 6, 'Tanda tangan kontrak sudah dicatat',
           exists (select 1 from public.kontrak_peluang k where k.peluang_id = p.id),
           'Kontrak belum dicatat ditandatangani. Catat tanggal dan nomor kontraknya dulu.'
    where p_tahap = 'aktivasi'
    union all
    select 7, 'Tanggal mulai beroperasi sudah dicatat',
           exists (select 1 from public.kontrak_peluang k where k.peluang_id = p.id and k.aktif_sejak is not null),
           'Outlet belum dicatat mulai beroperasi. Catat tanggalnya dulu.'
    where p_tahap = 'pemantauan'
  ) x
  where p.id = p_id and (auth.uid() is null or public.adalah_nfr())
$$;

-- Aturan perpindahan tahap:
--   maju satu tahap bila syarat masuknya terpenuhi; mundur satu tahap dengan alasan;
--   hasil akhir (menolak, ditarik, ditolak, kalah, batal) dari tahap mana pun dengan alasan;
--   peluang yang berakhir hanya bisa dibuka kembali ke tahap sebelum berakhir, dengan alasan.
create or replace function public.peluang_ubah_tahap(p_id uuid, p_tahap text, p_oleh text default null, p_catatan text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_urutan  constant text[] := public.urutan_tahap();
  v_hasil   constant text[] := public.hasil_akhir();
  v         public.peluang;
  v_dari    integer;
  v_ke      integer;
  v_sebelum text;
  v_kurang  text;
  v_alasan  text := nullif(left(btrim(coalesce(p_catatan, '')), 500), '');
  v_oleh    text := public.email_saya();
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa mengubah tahap peluang.');
  end if;
  if not (p_tahap = any (v_urutan) or p_tahap = any (v_hasil)) then
    return jsonb_build_object('ok', false, 'pesan', 'Tahap tidak dikenal.');
  end if;
  select * into v from public.peluang where id = p_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang tidak ditemukan.');
  end if;
  if v.tahap = p_tahap then
    return jsonb_build_object('ok', true, 'pesan', 'Tahap tidak berubah.');
  end if;

  if p_tahap = any (v_hasil) then
    if v.tahap = any (v_hasil) then
      return jsonb_build_object('ok', false, 'pesan', 'Peluang ini sudah berakhir. Buka kembali dulu bila hasilnya perlu diubah.');
    end if;
    if v_alasan is null then
      return jsonb_build_object('ok', false, 'pesan', 'Tulis alasannya dulu di kolom alasan.');
    end if;
  elsif v.tahap = any (v_hasil) then
    select r.tahap_dari into v_sebelum from public.peluang_riwayat r
    where r.peluang_id = p_id and r.tahap_ke = v.tahap order by r.waktu desc, r.id desc limit 1;
    if p_tahap is distinct from coalesce(v_sebelum, 'baru') then
      return jsonb_build_object('ok', false, 'pesan', 'Peluang yang berakhir hanya bisa dibuka kembali ke tahap sebelum berakhir.');
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
    if v_ke > v_dari then
      if p_tahap = 'berminat' and v_alasan is null then
        return jsonb_build_object('ok', false, 'pesan', 'Tulis di kolom alasan siapa yang menyatakan minat dan lewat apa.');
      end if;
      select x ->> 'pesan' into v_kurang
      from jsonb_array_elements(public.peluang_syarat_masuk(p_id, p_tahap)) x
      where not (x ->> 'terpenuhi')::boolean limit 1;
      if v_kurang is not null then
        return jsonb_build_object('ok', false, 'pesan', v_kurang);
      end if;
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

-- ================================================================ pemilik, tindakan berikut, tenggat

-- Anggota NFR yang boleh memegang peluang, untuk pilihan pemilik.
create function public.anggota_nfr() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'peran', k.peran) order by u.email), '[]'::jsonb)
  from public.keanggotaan k
  join public.organisasi o on o.id = k.organisasi_id and o.jenis = 'nfr'
  join auth.users u on u.id = k.user_id
  where public.adalah_nfr() and k.peran in ('nfr_admin', 'nfr_analis', 'nfr_penyetuju')
$$;

create function public.peluang_tindak_lanjut(p_id uuid, p_pemilik text, p_tindakan text, p_tenggat date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v          public.peluang;
  v_pemilik  text := nullif(lower(btrim(coalesce(p_pemilik, ''))), '');
  v_tindakan text := nullif(left(btrim(coalesce(p_tindakan, '')), 300), '');
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa mengubah tindak lanjut peluang.');
  end if;
  select * into v from public.peluang where id = p_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang tidak ditemukan.');
  end if;
  if v_pemilik is not null and not exists (
       select 1 from public.keanggotaan k
       join public.organisasi o on o.id = k.organisasi_id and o.jenis = 'nfr'
       join auth.users u on u.id = k.user_id
       where lower(u.email) = v_pemilik and k.peran in ('nfr_admin', 'nfr_analis', 'nfr_penyetuju')) then
    return jsonb_build_object('ok', false, 'pesan', 'Pemilik harus anggota tim NFR yang boleh mengubah data.');
  end if;
  update public.peluang set pemilik = v_pemilik, tindakan_berikut = v_tindakan, tenggat = p_tenggat, diubah = now() where id = p_id;
  perform public.audit_catat('tindak_lanjut_diubah', 'peluang', p_id::text, jsonb_build_object(
    'pemilik_dari', v.pemilik, 'pemilik_ke', v_pemilik, 'tindakan', v_tindakan, 'tenggat', p_tenggat));
  return jsonb_build_object('ok', true, 'pesan', 'Tindak lanjut disimpan.');
end
$$;

-- ================================================================ penawaran: susun dan terbitkan

-- Menyimpan draf versi penawaran. Satu peluang punya paling banyak satu draf; versi yang sudah terbit tidak diubah.
create function public.penawaran_simpan(p_peluang_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v        public.peluang;
  v_id     uuid;
  v_versi  integer;
  angka    constant text := '^[0-9]{1,13}([.][0-9]{1,2})?$';
  v_sewa   numeric;
  v_lama   integer;
  v_skema  text := p ->> 'skema';
  v_bagi   numeric;
  v_dep    numeric;
  v_bebas  integer;
  v_mulai  date;
  v_terima text := coalesce(nullif(p ->> 'penerima_sewa', ''), 'belum_dipastikan');
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa menyusun penawaran.');
  end if;
  select * into v from public.peluang where id = p_peluang_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang tidak ditemukan.');
  end if;
  if coalesce(array_position(public.urutan_tahap(), v.tahap), 0) not between 6 and 9 then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran disusun sejak tahap survei lokasi sampai tahap persetujuan.');
  end if;
  if coalesce(p ->> 'sewa_tahunan', '') !~ angka then
    return jsonb_build_object('ok', false, 'pesan', 'Isi sewa per tahun dengan angka saja, tanpa titik atau koma ribuan.');
  end if;
  if coalesce(p ->> 'lama_sewa_bulan', '') !~ '^[0-9]{1,3}$' or (p ->> 'lama_sewa_bulan')::integer not between 1 and 360 then
    return jsonb_build_object('ok', false, 'pesan', 'Isi lama sewa dalam bulan, antara 1 dan 360.');
  end if;
  if v_skema is null or v_skema not in ('sewa_tetap', 'bagi_hasil', 'campuran') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilih skema sewa dulu.');
  end if;
  if v_terima not in ('belum_dipastikan', 'pertamina', 'pemilik_spbu', 'dibagi') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan penerima sewa tidak dikenal.');
  end if;
  v_sewa := (p ->> 'sewa_tahunan')::numeric;
  v_lama := (p ->> 'lama_sewa_bulan')::integer;
  if v_skema <> 'sewa_tetap' then
    if coalesce(p ->> 'bagi_hasil_pct', '') !~ '^[0-9]{1,3}([.][0-9]{1,2})?$' or (p ->> 'bagi_hasil_pct')::numeric not between 0.01 and 100 then
      return jsonb_build_object('ok', false, 'pesan', 'Isi persentase bagi hasil, lebih dari 0 sampai 100.');
    end if;
    v_bagi := (p ->> 'bagi_hasil_pct')::numeric;
  end if;
  if coalesce(p ->> 'deposit', '') ~ angka then v_dep := (p ->> 'deposit')::numeric; end if;
  v_bebas := case when coalesce(p ->> 'bebas_sewa_bulan', '') ~ '^[0-9]{1,2}$' then least((p ->> 'bebas_sewa_bulan')::integer, 36) else 0 end;
  if coalesce(p ->> 'mulai_rencana', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then v_mulai := (p ->> 'mulai_rencana')::date; end if;

  select id into v_id from public.penawaran_versi where peluang_id = p_peluang_id and status = 'draf';
  if v_id is null then
    select coalesce(max(versi), 0) + 1 into v_versi from public.penawaran_versi where peluang_id = p_peluang_id;
    insert into public.penawaran_versi (peluang_id, versi, sewa_tahunan, lama_sewa_bulan, skema, bagi_hasil_pct, deposit,
                                        bebas_sewa_bulan, mulai_rencana, penerima_sewa, catatan, dibuat_oleh)
    values (p_peluang_id, v_versi, v_sewa, v_lama, v_skema, v_bagi, v_dep, v_bebas, v_mulai, v_terima,
            nullif(left(btrim(coalesce(p ->> 'catatan', '')), 1000), ''), public.email_saya())
    returning id into v_id;
  else
    update public.penawaran_versi
    set sewa_tahunan = v_sewa, lama_sewa_bulan = v_lama, skema = v_skema, bagi_hasil_pct = v_bagi, deposit = v_dep,
        bebas_sewa_bulan = v_bebas, mulai_rencana = v_mulai, penerima_sewa = v_terima,
        catatan = nullif(left(btrim(coalesce(p ->> 'catatan', '')), 1000), ''), dibuat = now(), dibuat_oleh = public.email_saya()
    where id = v_id;
  end if;
  update public.peluang set diubah = now() where id = p_peluang_id;
  return jsonb_build_object('ok', true, 'pesan', 'Draf penawaran tersimpan.', 'id', v_id);
end
$$;

-- Menerbitkan draf: menjadi versi yang berlaku, versi sebelumnya digantikan, persetujuan lama gugur,
-- dan empat persetujuan baru dibuka untuk versi ini.
create function public.penawaran_terbitkan(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d       public.penawaran_versi;
  v       public.peluang;
  v_boleh jsonb;
  v_gugur integer;
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

-- ================================================================ persetujuan

-- Memutuskan satu persetujuan atas versi penawaran yang berlaku.
--   pihak nfr: hanya admin atau penyetuju NFR, dan bukan penyusun versi itu.
--   pihak dealer, tenant, hsse: selama portalnya belum ada, dicatat tim NFR atas nama pihak itu,
--   wajib dengan keterangan wewenang dan rujukan bukti.
create function public.persetujuan_putuskan(p_id uuid, p_keputusan text, p_alasan text default null,
                                           p_bukti text default null, p_wewenang text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s          public.persetujuan;
  d          public.penawaran_versi;
  v          public.peluang;
  v_alasan   text := nullif(left(btrim(coalesce(p_alasan, '')), 1000), '');
  v_bukti    text := nullif(left(btrim(coalesce(p_bukti, '')), 500), '');
  v_wewenang text := nullif(left(btrim(coalesce(p_wewenang, '')), 300), '');
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa mencatat persetujuan.');
  end if;
  if p_keputusan not in ('disetujui', 'minta_revisi', 'ditolak') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan keputusan tidak dikenal.');
  end if;
  select * into s from public.persetujuan where id = p_id for update;
  if s.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Persetujuan tidak ditemukan.');
  end if;
  select * into d from public.penawaran_versi where id = s.penawaran_id;
  select * into v from public.peluang where id = s.peluang_id;
  if s.gugur or d.status <> 'diterbitkan' then
    return jsonb_build_object('ok', false, 'pesan', 'Persetujuan ini untuk versi penawaran yang sudah digantikan.');
  end if;
  if s.status <> 'menunggu' then
    return jsonb_build_object('ok', false, 'pesan', 'Persetujuan ini sudah diputuskan. Perubahan syarat butuh versi penawaran baru.');
  end if;
  if v.tahap <> 'persetujuan' then
    return jsonb_build_object('ok', false, 'pesan', 'Persetujuan dicatat saat peluang berada di tahap persetujuan.');
  end if;
  if p_keputusan <> 'disetujui' and (v_alasan is null or length(v_alasan) < 10) then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis alasannya dulu, paling sedikit 10 huruf.');
  end if;

  if s.pihak = 'nfr' then
    if coalesce(public.peran_nfr(), '') not in ('nfr_admin', 'nfr_penyetuju') then
      return jsonb_build_object('ok', false, 'pesan', 'Persetujuan NFR diberikan admin atau penyetuju NFR. Analis tidak memegang wewenang ini.');
    end if;
    if d.dibuat_oleh is not null and d.dibuat_oleh = public.email_saya() then
      return jsonb_build_object('ok', false, 'pesan', 'Versi penawaran ini Anda susun sendiri, jadi persetujuan NFR harus dari orang lain.');
    end if;
  else
    if v_wewenang is null or length(v_wewenang) < 5 then
      return jsonb_build_object('ok', false, 'pesan', 'Tulis siapa yang memutuskan dan dalam kapasitas apa, misalnya nama dan jabatannya.');
    end if;
    if v_bukti is null or length(v_bukti) < 10 then
      return jsonb_build_object('ok', false, 'pesan', 'Tulis rujukan buktinya, misalnya nomor surat, tanggal email, atau berita acara.');
    end if;
  end if;

  update public.persetujuan
  set status = p_keputusan, penyetuju = auth.uid(), penyetuju_email = public.email_saya(), atas_nama = (s.pihak <> 'nfr'),
      wewenang = case when s.pihak = 'nfr' then public.peran_nfr() else v_wewenang end,
      alasan = v_alasan, bukti = v_bukti, diputuskan = now()
  where id = p_id;
  update public.peluang set diubah = now() where id = s.peluang_id;
  perform public.audit_catat('persetujuan_diputuskan', 'peluang', s.peluang_id::text, jsonb_build_object(
    'persetujuan_id', p_id, 'pihak', s.pihak, 'keputusan', p_keputusan, 'alasan', v_alasan, 'bukti', v_bukti,
    'wewenang', v_wewenang, 'atas_nama', s.pihak <> 'nfr', 'penawaran_id', d.id, 'versi', d.versi));
  return jsonb_build_object('ok', true, 'pesan',
    case p_keputusan when 'disetujui' then 'Persetujuan dicatat.'
                     when 'minta_revisi' then 'Permintaan revisi dicatat. Susun versi penawaran baru untuk menjawabnya.'
                     else 'Penolakan dicatat.' end);
end
$$;

-- ================================================================ kontrak: tanda tangan dan mulai beroperasi

create function public.kontrak_catat_tanda_tangan(p_peluang_id uuid, p_tanggal date, p_nomor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v       public.peluang;
  v_versi public.penawaran_versi;
  v_nomor text := nullif(left(btrim(coalesce(p_nomor, '')), 100), '');
begin
  if coalesce(public.peran_nfr(), '') not in ('nfr_admin', 'nfr_penyetuju') then
    return jsonb_build_object('ok', false, 'pesan', 'Tanda tangan kontrak dicatat admin atau penyetuju NFR.');
  end if;
  select * into v from public.peluang where id = p_peluang_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang tidak ditemukan.');
  end if;
  if v.tahap <> 'kontrak' then
    return jsonb_build_object('ok', false, 'pesan', 'Tanda tangan dicatat saat peluang berada di tahap kontrak.');
  end if;
  if exists (select 1 from public.kontrak_peluang where peluang_id = p_peluang_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Tanda tangan kontrak peluang ini sudah dicatat.');
  end if;
  if p_tanggal is null or p_tanggal > current_date then
    return jsonb_build_object('ok', false, 'pesan', 'Isi tanggal tanda tangan. Tanggalnya tidak boleh di masa depan.');
  end if;
  if v_nomor is null or length(v_nomor) < 3 then
    return jsonb_build_object('ok', false, 'pesan', 'Isi nomor kontraknya.');
  end if;
  select * into v_versi from public.penawaran_versi where peluang_id = p_peluang_id and status = 'diterbitkan';
  if v_versi.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Tidak ada versi penawaran yang berlaku untuk ditandatangani.');
  end if;
  insert into public.kontrak_peluang (peluang_id, penawaran_id, nomor, tanggal_tanda_tangan, dicatat_oleh)
  values (p_peluang_id, v_versi.id, v_nomor, p_tanggal, public.email_saya());
  update public.peluang set diubah = now() where id = p_peluang_id;
  perform public.audit_catat('kontrak_ditandatangani', 'peluang', p_peluang_id::text, jsonb_build_object(
    'nomor', v_nomor, 'tanggal', p_tanggal, 'penawaran_id', v_versi.id, 'versi', v_versi.versi));
  return jsonb_build_object('ok', true, 'pesan', 'Tanda tangan kontrak dicatat.');
end
$$;

create function public.kontrak_catat_aktif(p_peluang_id uuid, p_tanggal date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.peluang;
  k public.kontrak_peluang;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa mencatat mulai beroperasi.');
  end if;
  select * into v from public.peluang where id = p_peluang_id for update;
  select * into k from public.kontrak_peluang where peluang_id = p_peluang_id;
  if v.id is null or k.peluang_id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Kontrak peluang ini belum dicatat ditandatangani.');
  end if;
  if v.tahap <> 'aktivasi' then
    return jsonb_build_object('ok', false, 'pesan', 'Mulai beroperasi dicatat saat peluang berada di tahap aktivasi.');
  end if;
  if p_tanggal is null or p_tanggal > current_date or p_tanggal < k.tanggal_tanda_tangan then
    return jsonb_build_object('ok', false, 'pesan', 'Isi tanggal mulai beroperasi: setelah tanda tangan kontrak dan tidak di masa depan.');
  end if;
  update public.kontrak_peluang set aktif_sejak = p_tanggal, aktif_dicatat = now(), aktif_dicatat_oleh = public.email_saya()
  where peluang_id = p_peluang_id;
  update public.peluang set diubah = now() where id = p_peluang_id;
  perform public.audit_catat('outlet_aktif', 'peluang', p_peluang_id::text, jsonb_build_object('aktif_sejak', p_tanggal));
  return jsonb_build_object('ok', true, 'pesan', 'Tanggal mulai beroperasi dicatat.');
end
$$;

-- ================================================================ kueri baca

create or replace function public.peluang_rinci(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
with p as (select * from public.peluang where id = p_id)
select case when not exists (select 1 from p) then null else jsonb_build_object(
  'peluang', (select to_jsonb(p) from p),
  'calon', (select to_jsonb(c) from public.calon_tenant c, p where c.id = p.calon_id),
  'tenant', (select jsonb_build_object('id', t.id, 'nama', t.nama, 'segmen_utama', t.segmen_utama, 'spbu', t.spbu, 'lahan', t.lahan)
             from public.v_tenant_profil t, p where t.kunci = p.tenant_kunci),
  'lahan', (select jsonb_build_object(
        'status', l.status, 'luas_m2', nullif(l.luas_m2, 0), 'daya_w', l.daya_w, 'tarif_tahunan', l.tarif_tahunan,
        'posisi', l.posisi, 'lantai', l.lantai, 'alamat', s.alamat)
      from public.lahan l join public.spbu s on s.id = l.spbu_id, p
      where l.lahan_id = p.lahan_id and not l.duplikat limit 1),
  'syarat', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'pihak', s.pihak, 'urut', s.urut, 'butir', s.butir, 'terpenuhi', s.terpenuhi,
        'diubah', s.diubah, 'diubah_oleh', s.diubah_oleh) order by s.pihak, s.urut)
      from public.peluang_syarat s where s.peluang_id = p_id), '[]'::jsonb),
  'riwayat', coalesce((select jsonb_agg(jsonb_build_object(
        'tahap_dari', r.tahap_dari, 'tahap_ke', r.tahap_ke, 'oleh', r.oleh, 'catatan', r.catatan, 'waktu', r.waktu)
        order by r.waktu desc, r.id desc)
      from public.peluang_riwayat r where r.peluang_id = p_id), '[]'::jsonb),
  -- syarat masuk tahap berikutnya; kosong bila peluang sudah di tahap terakhir atau sudah berakhir
  'tahap_berikut', (select t.berikut from p cross join lateral (
        select (public.urutan_tahap())[array_position(public.urutan_tahap(), p.tahap) + 1] as berikut) t),
  'syarat_berikut', (select case when t.berikut is null then '[]'::jsonb else public.peluang_syarat_masuk(p.id, t.berikut) end
      from p cross join lateral (
        select (public.urutan_tahap())[array_position(public.urutan_tahap(), p.tahap) + 1] as berikut) t),
  'penawaran', coalesce((select jsonb_agg(to_jsonb(v) order by v.versi desc)
      from public.penawaran_versi v where v.peluang_id = p_id), '[]'::jsonb),
  'persetujuan', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('versi', v.versi)
        order by s.gugur, v.versi desc, array_position(array['nfr', 'dealer', 'tenant', 'hsse'], s.pihak))
      from public.persetujuan s join public.penawaran_versi v on v.id = s.penawaran_id
      where s.peluang_id = p_id), '[]'::jsonb),
  'kontrak', (select to_jsonb(k) || jsonb_build_object('versi', v.versi)
      from public.kontrak_peluang k join public.penawaran_versi v on v.id = k.penawaran_id where k.peluang_id = p_id),
  'audit', coalesce((select jsonb_agg(jsonb_build_object('waktu', a.waktu, 'oleh', a.aktor_email, 'peristiwa', a.peristiwa, 'data', a.data - 'syarat' - 'isi')
        order by a.waktu desc, a.id desc)
      from public.audit_peristiwa a where a.entitas = 'peluang' and a.entitas_id = p_id::text
        and a.peristiwa not in ('tahap_diubah', 'catatan_diubah', 'syarat_diubah')), '[]'::jsonb),
  'anggota', public.anggota_nfr()
) end
$$;

-- Daftar peluang, kini dengan tindakan berikut dan tenggat. p_tahap menerima satu tahap,
-- 'berjalan' (semua yang belum berakhir), 'berakhir', atau 'terlambat' (tenggat sudah lewat).
create or replace function public.peluang_daftar(
  p_tahap text default null, p_cari text default null, p_halaman integer default 1, p_per_halaman integer default 25
) returns jsonb
language sql stable set search_path = '' as $$
with
semua as (
  select p.id, p.lahan_id, p.lahan_kode, p.spbu_id, p.spbu_nomor, p.kota, p.provinsi, p.segmen, p.skor, p.tahap,
         p.pemilik, p.dibuat, p.diubah, p.tindakan_berikut, p.tenggat,
         (p.tenggat is not null and p.tenggat < current_date and not (p.tahap = any (public.hasil_akhir()))) as terlambat,
         case when p.calon_id is not null then 'calon' else 'tenant' end as jenis_pihak,
         coalesce(c.nama_usaha, p.tenant_nama) as pihak,
         (select count(*) from public.peluang_syarat s where s.peluang_id = p.id and s.terpenuhi) as syarat_terpenuhi,
         (select count(*) from public.peluang_syarat s where s.peluang_id = p.id) as syarat_total
  from public.peluang p
  left join public.calon_tenant c on c.id = p.calon_id
),
cari as (
  select * from semua s
  where nullif(btrim(p_cari), '') is null or s.pihak ilike '%' || btrim(p_cari) || '%'
     or s.lahan_kode ilike '%' || btrim(p_cari) || '%' or s.spbu_nomor ilike '%' || btrim(p_cari) || '%'
),
cocok as (
  select * from cari
  where case coalesce(p_tahap, 'semua')
          when 'semua' then true
          when 'berjalan' then not (tahap = any (public.hasil_akhir()))
          when 'berakhir' then tahap = any (public.hasil_akhir())
          when 'terlambat' then terlambat
          else tahap = p_tahap end
),
halaman as (
  select * from cocok order by terlambat desc, tenggat nulls last, diubah desc, id
  limit greatest(1, least(coalesce(p_per_halaman, 25), 100))
  offset (greatest(coalesce(p_halaman, 1), 1) - 1) * greatest(1, least(coalesce(p_per_halaman, 25), 100))
)
select jsonb_build_object(
  'total', (select count(*) from cocok),
  'per_tahap', coalesce((select jsonb_object_agg(x.tahap, x.n) from (select tahap, count(*) as n from cari group by tahap) x), '{}'::jsonb),
  'terlambat', (select count(*) from cari where terlambat),
  'baris', coalesce((select jsonb_agg(to_jsonb(h) order by h.terlambat desc, h.tenggat nulls last, h.diubah desc, h.id) from halaman h), '[]'::jsonb)
)
$$;

-- ---------------------------------------------------------------- hak panggil

revoke execute on function
  public.urutan_tahap(), public.hasil_akhir(), public.peluang_syarat_masuk(uuid, text), public.anggota_nfr(),
  public.peluang_tindak_lanjut(uuid, text, text, date), public.penawaran_simpan(uuid, jsonb), public.penawaran_terbitkan(uuid),
  public.persetujuan_putuskan(uuid, text, text, text, text), public.kontrak_catat_tanda_tangan(uuid, date, text),
  public.kontrak_catat_aktif(uuid, date)
from public, anon;

grant execute on function
  public.urutan_tahap(), public.hasil_akhir(), public.peluang_syarat_masuk(uuid, text), public.anggota_nfr(),
  public.peluang_tindak_lanjut(uuid, text, text, date), public.penawaran_simpan(uuid, jsonb), public.penawaran_terbitkan(uuid),
  public.persetujuan_putuskan(uuid, text, text, text, text), public.kontrak_catat_tanda_tangan(uuid, date, text),
  public.kontrak_catat_aktif(uuid, date)
to authenticated;

notify pgrst, 'reload schema';
