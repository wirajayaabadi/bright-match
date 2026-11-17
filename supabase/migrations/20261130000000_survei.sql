-- Jadwal survei lokasi.
-- 1. Tenant mengusulkan sampai tiga waktu (tanggal dan pagi/siang/sore) atas penawaran yang dibagikan kepadanya.
-- 2. Tim NFR menetapkan jadwal: tanggal, jam setempat, dan pendamping. Boleh juga menjadwalkan tanpa permintaan.
-- 3. Setelah tanggalnya lewat, tim NFR mencatat survei selesai beserta hasilnya. Kedua pihak bisa membatalkan.
-- Satu peluang hanya punya satu survei yang berjalan. Survei tidak memindahkan tahap peluang.

create table public.survei_lokasi (
  id                uuid primary key default gen_random_uuid(),
  peluang_id        uuid not null references public.peluang (id) on delete cascade,
  organisasi_id     uuid references public.organisasi (id) on delete set null,  -- tenant yang meminta; null bila dijadwalkan NFR tanpa permintaan
  status            text not null check (status in ('diminta', 'dijadwalkan', 'selesai', 'dibatalkan')),
  usulan            jsonb not null default '[]'::jsonb,                         -- [{"tanggal":"2026-11-24","waktu":"pagi"}], paling banyak tiga
  catatan_tenant    text,
  diminta           timestamptz,
  diminta_oleh      text,
  jadwal_tanggal    date,
  jadwal_jam        time,                                                       -- jam setempat di lokasi SPBU
  pendamping        text,                                                       -- anggota NFR yang mendampingi; terlihat oleh tenant
  catatan_jadwal    text,                                                       -- catatan untuk tenant, mis. titik temu
  dijadwalkan       timestamptz,
  dijadwalkan_oleh  text,
  hasil             text,                                                       -- catatan internal NFR; tidak terlihat oleh tenant
  selesai           timestamptz,
  selesai_oleh      text,
  alasan_batal      text,
  dibatalkan        timestamptz,
  dibatalkan_oleh   text,
  dibatalkan_pihak  text check (dibatalkan_pihak in ('tenant', 'nfr')),
  dibuat            timestamptz not null default now()
);

create unique index survei_lokasi_satu_berjalan on public.survei_lokasi (peluang_id) where status in ('diminta', 'dijadwalkan');
create index survei_lokasi_peluang_idx on public.survei_lokasi (peluang_id, dibuat desc);

comment on table public.survei_lokasi is 'Permintaan dan jadwal survei lokasi per peluang. Kolom hasil adalah catatan internal NFR.';

alter table public.survei_lokasi enable row level security;
create policy "Tim NFR membaca survei lokasi" on public.survei_lokasi for select to authenticated using ((select public.adalah_nfr()));
revoke all on public.survei_lokasi from anon, authenticated;
grant select on public.survei_lokasi to authenticated;

-- Hari ini menurut WIB. Zona WITA dan WIT lebih dulu, jadi "besok WIB" tidak pernah berarti hari yang sudah lewat di sana.
create function public.hari_ini_wib() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

-- ================================================================ tenant

create function public.tenant_survei_minta(p_peluang_id uuid, p_usulan jsonb, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v          public.peluang;
  v_catatan  text := nullif(left(btrim(coalesce(p_catatan, '')), 500), '');
  v_hari     date := public.hari_ini_wib();
  v_bersih   jsonb := '[]'::jsonb;
  v_butir    jsonb;
  v_tanggal  date;
  v_id       uuid;
begin
  if not public.tenant_boleh_lihat(p_peluang_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran ini tidak ditemukan.');
  end if;
  select * into v from public.peluang where id = p_peluang_id for update;
  if v.tahap = any (public.hasil_akhir()) then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran ini sudah berakhir, jadi survei tidak bisa diminta lagi.');
  end if;
  if exists (select 1 from public.survei_lokasi where peluang_id = p_peluang_id and status in ('diminta', 'dijadwalkan')) then
    return jsonb_build_object('ok', false, 'pesan', 'Sudah ada survei yang berjalan untuk penawaran ini. Batalkan dulu bila ingin mengusulkan waktu lain.');
  end if;
  if p_usulan is null or jsonb_typeof(p_usulan) <> 'array' or jsonb_array_length(p_usulan) = 0 then
    return jsonb_build_object('ok', false, 'pesan', 'Usulkan paling sedikit satu tanggal survei.');
  end if;
  if jsonb_array_length(p_usulan) > 3 then
    return jsonb_build_object('ok', false, 'pesan', 'Usulkan paling banyak tiga waktu.');
  end if;
  for v_butir in select * from jsonb_array_elements(p_usulan) loop
    if jsonb_typeof(v_butir) <> 'object' or coalesce(v_butir ->> 'tanggal', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(v_butir ->> 'waktu', '') not in ('pagi', 'siang', 'sore') then
      return jsonb_build_object('ok', false, 'pesan', 'Tiap usulan butuh tanggal dan pilihan pagi, siang, atau sore.');
    end if;
    begin
      v_tanggal := (v_butir ->> 'tanggal')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'pesan', 'Salah satu tanggal tidak ada di kalender. Periksa lagi tanggalnya.');
    end;
    if v_tanggal <= v_hari then
      return jsonb_build_object('ok', false, 'pesan', 'Usulkan tanggal mulai besok, supaya tim sempat mengaturnya.');
    end if;
    if v_tanggal > v_hari + 90 then
      return jsonb_build_object('ok', false, 'pesan', 'Usulkan tanggal dalam 90 hari ke depan.');
    end if;
    if v_bersih @> jsonb_build_array(jsonb_build_object('tanggal', v_tanggal, 'waktu', v_butir ->> 'waktu')) then
      return jsonb_build_object('ok', false, 'pesan', 'Ada dua usulan yang sama. Ganti salah satunya.');
    end if;
    v_bersih := v_bersih || jsonb_build_object('tanggal', v_tanggal, 'waktu', v_butir ->> 'waktu');
  end loop;

  insert into public.survei_lokasi (peluang_id, organisasi_id, status, usulan, catatan_tenant, diminta, diminta_oleh)
  values (p_peluang_id, v.organisasi_tenant, 'diminta', v_bersih, v_catatan, now(), public.email_saya())
  returning id into v_id;
  -- tetap tercatat sebagai tanggapan, supaya muncul di daftar tanggapan dan hitungan beranda NFR
  insert into public.tanggapan_tenant (peluang_id, organisasi_id, jenis, pesan, oleh, oleh_email)
  values (p_peluang_id, v.organisasi_tenant, 'minta_survei',
          'Usulan waktu: ' || (select string_agg(to_char((u ->> 'tanggal')::date, 'DD-MM-YYYY') || ' ' || (u ->> 'waktu'), '; ') from jsonb_array_elements(v_bersih) u)
          || coalesce('. ' || v_catatan, ''),
          auth.uid(), public.email_saya());
  perform public.audit_catat('survei_diminta', 'peluang', p_peluang_id::text,
    jsonb_build_object('survei_id', v_id, 'usulan', v_bersih, 'organisasi_id', v.organisasi_tenant));
  return jsonb_build_object('ok', true, 'pesan', 'Permintaan survei terkirim. Tim Non Fuel Retail akan menetapkan jadwalnya.');
end
$$;

create function public.tenant_survei_batalkan(p_peluang_id uuid, p_alasan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s         public.survei_lokasi;
  v_alasan  text := nullif(left(btrim(coalesce(p_alasan, '')), 500), '');
begin
  if not public.tenant_boleh_lihat(p_peluang_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran ini tidak ditemukan.');
  end if;
  select * into s from public.survei_lokasi where peluang_id = p_peluang_id and status in ('diminta', 'dijadwalkan') for update;
  if s.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Tidak ada survei yang berjalan untuk dibatalkan.');
  end if;
  update public.survei_lokasi
  set status = 'dibatalkan', alasan_batal = v_alasan, dibatalkan = now(), dibatalkan_oleh = public.email_saya(), dibatalkan_pihak = 'tenant'
  where id = s.id;
  perform public.audit_catat('survei_dibatalkan', 'peluang', p_peluang_id::text,
    jsonb_build_object('survei_id', s.id, 'pihak', 'tenant', 'status_sebelum', s.status, 'alasan', v_alasan));
  return jsonb_build_object('ok', true, 'pesan', 'Survei dibatalkan. Anda bisa mengusulkan waktu baru kapan saja.');
end
$$;

-- Survei satu penawaran untuk tenant. Tanpa catatan hasil dan tanpa identitas staf NFR selain pendamping.
create function public.tenant_survei(p_peluang_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.tenant_boleh_lihat(p_peluang_id) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'status', s.status, 'usulan', s.usulan, 'catatan_tenant', s.catatan_tenant, 'diminta', s.diminta, 'diminta_oleh', s.diminta_oleh,
      'jadwal_tanggal', s.jadwal_tanggal, 'jadwal_jam', to_char(s.jadwal_jam, 'HH24:MI'), 'pendamping', s.pendamping, 'catatan_jadwal', s.catatan_jadwal,
      'selesai', s.selesai, 'alasan_batal', case when s.dibatalkan_pihak = 'tenant' or s.status = 'dibatalkan' then s.alasan_batal end,
      'dibatalkan', s.dibatalkan, 'dibatalkan_pihak', s.dibatalkan_pihak) order by s.dibuat desc)
    from public.survei_lokasi s where s.peluang_id = p_peluang_id), '[]'::jsonb) end
$$;

-- ================================================================ tim NFR

-- Menetapkan atau mengubah jadwal. Bila belum ada permintaan, membuat survei baru yang langsung terjadwal.
create function public.survei_jadwalkan(p_peluang_id uuid, p_tanggal date, p_jam text, p_pendamping text, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v             public.peluang;
  s             public.survei_lokasi;
  v_pendamping  text := nullif(left(btrim(coalesce(p_pendamping, '')), 120), '');
  v_catatan     text := nullif(left(btrim(coalesce(p_catatan, '')), 500), '');
  v_jam         time;
  v_hari        date := public.hari_ini_wib();
  v_id          uuid;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Jadwal survei ditetapkan analis, penyetuju, atau admin NFR.');
  end if;
  select * into v from public.peluang where id = p_peluang_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang tidak ditemukan.');
  end if;
  if v.tahap = any (public.hasil_akhir()) then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang ini sudah berakhir, jadi survei tidak dijadwalkan lagi.');
  end if;
  if p_tanggal is null or p_tanggal < v_hari then
    return jsonb_build_object('ok', false, 'pesan', 'Isi tanggal survei. Tanggalnya tidak boleh sudah lewat.');
  end if;
  if p_tanggal > v_hari + 180 then
    return jsonb_build_object('ok', false, 'pesan', 'Jadwalkan survei dalam 180 hari ke depan.');
  end if;
  if coalesce(p_jam, '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    return jsonb_build_object('ok', false, 'pesan', 'Isi jam survei, misalnya 10:00.');
  end if;
  v_jam := p_jam::time;
  if v_pendamping is null or length(v_pendamping) < 3 then
    return jsonb_build_object('ok', false, 'pesan', 'Isi nama pendamping dari tim NFR, supaya tenant tahu siapa yang ditemui.');
  end if;

  select * into s from public.survei_lokasi where peluang_id = p_peluang_id and status in ('diminta', 'dijadwalkan') for update;
  if s.id is null then
    insert into public.survei_lokasi (peluang_id, organisasi_id, status, jadwal_tanggal, jadwal_jam, pendamping, catatan_jadwal, dijadwalkan, dijadwalkan_oleh)
    values (p_peluang_id, v.organisasi_tenant, 'dijadwalkan', p_tanggal, v_jam, v_pendamping, v_catatan, now(), public.email_saya())
    returning id into v_id;
  else
    v_id := s.id;
    update public.survei_lokasi
    set status = 'dijadwalkan', jadwal_tanggal = p_tanggal, jadwal_jam = v_jam, pendamping = v_pendamping, catatan_jadwal = v_catatan,
        dijadwalkan = now(), dijadwalkan_oleh = public.email_saya()
    where id = s.id;
  end if;
  update public.peluang set diubah = now() where id = p_peluang_id;
  perform public.audit_catat(case when s.status = 'dijadwalkan' then 'survei_dijadwalkan_ulang' else 'survei_dijadwalkan' end, 'peluang', p_peluang_id::text,
    jsonb_build_object('survei_id', v_id, 'tanggal', p_tanggal, 'jam', p_jam, 'pendamping', v_pendamping,
                       'sebelum', case when s.status = 'dijadwalkan' then jsonb_build_object('tanggal', s.jadwal_tanggal, 'jam', to_char(s.jadwal_jam, 'HH24:MI'), 'pendamping', s.pendamping) end));
  return jsonb_build_object('ok', true, 'pesan', case when s.status = 'dijadwalkan' then 'Jadwal survei diubah.' else 'Jadwal survei ditetapkan.' end);
end
$$;

create function public.survei_selesai(p_id uuid, p_hasil text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s        public.survei_lokasi;
  v_hasil  text := nullif(left(btrim(coalesce(p_hasil, '')), 2000), '');
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Hasil survei dicatat analis, penyetuju, atau admin NFR.');
  end if;
  select * into s from public.survei_lokasi where id = p_id for update;
  if s.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Survei tidak ditemukan.');
  end if;
  if s.status <> 'dijadwalkan' then
    return jsonb_build_object('ok', false, 'pesan', 'Hanya survei yang sudah dijadwalkan yang bisa dicatat selesai.');
  end if;
  if s.jadwal_tanggal > public.hari_ini_wib() then
    return jsonb_build_object('ok', false, 'pesan', 'Survei ini belum sampai tanggalnya. Ubah jadwalnya bila survei dimajukan.');
  end if;
  if v_hasil is null or length(v_hasil) < 10 then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis hasil surveinya dulu, paling sedikit 10 huruf.');
  end if;
  update public.survei_lokasi set status = 'selesai', hasil = v_hasil, selesai = now(), selesai_oleh = public.email_saya() where id = p_id;
  update public.peluang set diubah = now() where id = s.peluang_id;
  perform public.audit_catat('survei_selesai', 'peluang', s.peluang_id::text, jsonb_build_object('survei_id', s.id, 'tanggal', s.jadwal_tanggal, 'hasil', v_hasil));
  return jsonb_build_object('ok', true, 'pesan', 'Survei dicatat selesai.');
end
$$;

create function public.survei_batalkan(p_id uuid, p_alasan text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s         public.survei_lokasi;
  v_alasan  text := nullif(left(btrim(coalesce(p_alasan, '')), 500), '');
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Survei dibatalkan analis, penyetuju, atau admin NFR.');
  end if;
  select * into s from public.survei_lokasi where id = p_id for update;
  if s.id is null or s.status not in ('diminta', 'dijadwalkan') then
    return jsonb_build_object('ok', false, 'pesan', 'Tidak ada survei yang berjalan untuk dibatalkan.');
  end if;
  if v_alasan is null or length(v_alasan) < 10 then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis alasannya dulu, paling sedikit 10 huruf. Alasan ini terlihat oleh tenant.');
  end if;
  update public.survei_lokasi
  set status = 'dibatalkan', alasan_batal = v_alasan, dibatalkan = now(), dibatalkan_oleh = public.email_saya(), dibatalkan_pihak = 'nfr'
  where id = p_id;
  update public.peluang set diubah = now() where id = s.peluang_id;
  perform public.audit_catat('survei_dibatalkan', 'peluang', s.peluang_id::text,
    jsonb_build_object('survei_id', s.id, 'pihak', 'nfr', 'status_sebelum', s.status, 'alasan', v_alasan));
  return jsonb_build_object('ok', true, 'pesan', 'Survei dibatalkan.');
end
$$;

-- Semua survei satu peluang untuk tim NFR, yang terbaru dulu. Dibaca dengan hak pengguna, jadi RLS berlaku.
create function public.survei_peluang(p_peluang_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg((to_jsonb(s) - 'jadwal_jam') || jsonb_build_object('jadwal_jam', to_char(s.jadwal_jam, 'HH24:MI')) order by s.dibuat desc), '[]'::jsonb)
  from public.survei_lokasi s where s.peluang_id = p_peluang_id
$$;

revoke execute on function public.tenant_survei_minta(uuid, jsonb, text), public.tenant_survei_batalkan(uuid, text), public.tenant_survei(uuid),
  public.survei_jadwalkan(uuid, date, text, text, text), public.survei_selesai(uuid, text), public.survei_batalkan(uuid, text),
  public.survei_peluang(uuid), public.hari_ini_wib() from public, anon;
grant execute on function public.tenant_survei_minta(uuid, jsonb, text), public.tenant_survei_batalkan(uuid, text), public.tenant_survei(uuid),
  public.survei_jadwalkan(uuid, date, text, text, text), public.survei_selesai(uuid, text), public.survei_batalkan(uuid, text),
  public.survei_peluang(uuid), public.hari_ini_wib() to authenticated;

notify pgrst, 'reload schema';
