-- Temukan peluang, fase D: analitik, umpan balik rekomendasi, dan retensi.
-- 1. Peristiwa dicatat di server oleh pemicu basis data, bukan oleh skrip di peramban, sehingga tidak bisa dipalsukan
--    dari luar selain tiga peristiwa tampilan (rekomendasi dibuat, dilihat, diklik), yang dibatasi per sesi.
-- 2. Tanpa data pribadi: tidak ada akun, email, alamat IP, atau teks bebas. Sesi dikenali lewat pseudonim (sidik id
--    barisnya). Isi jawaban hanya disimpan untuk pertanyaan pilihan, dan wilayah hanya sampai provinsi.
-- 3. Retensi 180 hari untuk peristiwa dan umpan balik. Tabelnya tertutup; tim NFR hanya membaca angka gabungan.

create table public.peristiwa_temukan (
  id         bigint generated always as identity primary key,
  waktu      timestamptz not null default now(),
  sesi       text not null,                      -- pseudonim sesi: sidik id baris sesi_temukan, bukan kunci cookie
  peran      text not null check (peran in ('tenant', 'dealer')),
  peristiwa  text not null check (peristiwa in (
               'discovery_started', 'role_selected', 'question_answered', 'question_skipped', 'discovery_completed',
               'recommendation_generated', 'recommendation_viewed', 'recommendation_clicked', 'preferences_updated',
               'tenant_interest_submitted', 'dealer_interest_submitted')),
  langkah    text,
  data       jsonb
);
create index peristiwa_temukan_jenis_idx on public.peristiwa_temukan (peristiwa, waktu);
create index peristiwa_temukan_sesi_idx on public.peristiwa_temukan (sesi, waktu);
comment on table public.peristiwa_temukan is 'Peristiwa Temukan peluang untuk analitik. Tanpa identitas; dihapus setelah 180 hari.';

create table public.umpan_temukan (
  id                bigint generated always as identity primary key,
  sesi              text not null,
  peran             text not null check (peran in ('tenant', 'dealer')),
  lahan_id          text not null,
  segmen            text,                        -- pengelola SPBU menilai jenis usaha untuk satu ruang
  nilai             text not null check (nilai in ('sesuai', 'kurang')),
  alasan            text check (alasan in ('tarif', 'lokasi', 'ruang', 'data', 'lain')),
  skor              integer,
  preferensi        integer,
  urut              integer,                     -- posisi di daftar saat dinilai
  versi_model       text,
  versi_preferensi  text,
  dibuat            timestamptz not null default now(),
  diubah            timestamptz not null default now()
);
create unique index umpan_temukan_satu_idx on public.umpan_temukan (sesi, lahan_id, coalesce(segmen, ''));
comment on table public.umpan_temukan is 'Penilaian pengguna atas satu rekomendasi: sesuai atau kurang sesuai, dengan alasan pilihan. Tanpa teks bebas.';

alter table public.peristiwa_temukan enable row level security;
alter table public.umpan_temukan enable row level security;
revoke all on public.peristiwa_temukan, public.umpan_temukan from anon, authenticated;
-- Sengaja tanpa policy: hanya fungsi di bawah yang membaca dan menulis.

create function public.temukan_pseudonim(p_id uuid) returns text
language sql immutable set search_path = '' as $$
  select left(public.temukan_sidik('analitik:' || p_id::text), 16)
$$;
revoke execute on function public.temukan_pseudonim(uuid) from public, anon, authenticated;

-- Retensi: peristiwa dan umpan balik yang lebih tua dari 180 hari dihapus. Mengembalikan jumlah yang dihapus.
create function public.temukan_retensi() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_e integer; v_u integer;
begin
  delete from public.peristiwa_temukan where waktu < now() - interval '180 days';
  get diagnostics v_e = row_count;
  delete from public.umpan_temukan where diubah < now() - interval '180 days';
  get diagnostics v_u = row_count;
  return jsonb_build_object('peristiwa', v_e, 'umpan', v_u);
end
$$;
revoke execute on function public.temukan_retensi() from public, anon, authenticated;

create function public.temukan_catat(p_sesi uuid, p_peran text, p_peristiwa text, p_langkah text default null, p_data jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.peristiwa_temukan (sesi, peran, peristiwa, langkah, data)
  values (public.temukan_pseudonim(p_sesi), p_peran, p_peristiwa, p_langkah, p_data);
  -- Tidak ada penjadwal di sini, jadi retensi dijalankan sesekali saat ada tulisan baru (kira-kira satu dari lima puluh).
  if random() < 0.02 then
    perform public.temukan_retensi();
  end if;
end
$$;
revoke execute on function public.temukan_catat(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Isi jawaban yang boleh ikut ke analitik: hanya pertanyaan pilihan, rentang anggaran, dan provinsi.
create function public.temukan_nilai_analitik(p_langkah text, p_nilai jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_langkah in ('usaha', 'rinci_otomotif', 'rinci_jasa', 'rinci_lain', 'prioritas', 'pelanggan', 'waktu', 'tujuan', 'skema')
         and jsonb_typeof(p_nilai) = 'array'
      then (select jsonb_agg(left(x, 40)) from (select x from jsonb_array_elements_text(p_nilai) x limit 8) q)
    when p_langkah = 'anggaran' and jsonb_typeof(p_nilai) = 'object' and p_nilai ->> 'pilihan' is not null
      then jsonb_build_array(left(p_nilai ->> 'pilihan', 20))
    when p_langkah = 'wilayah' and jsonb_typeof(p_nilai) = 'object'
      then case when p_nilai -> 'terbuka' = 'true'::jsonb then '["terbuka"]'::jsonb
                else (select jsonb_agg(distinct left(w ->> 'provinsi', 60))
                      from (select w from jsonb_array_elements(case when jsonb_typeof(p_nilai -> 'daftar') = 'array' then p_nilai -> 'daftar' else '[]'::jsonb end) w limit 10) q
                      where w ->> 'provinsi' is not null) end
  end
$$;
revoke execute on function public.temukan_nilai_analitik(text, jsonb) from public, anon, authenticated;

-- Pemicu: perjalanan kuesioner dibaca dari perubahan baris sesi, jadi fungsi simpan tidak perlu tahu soal analitik.
create function public.temukan_catat_sesi() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k       text;
  v_lama  jsonb := case when tg_op = 'UPDATE' then old.jawaban else '{}'::jsonb end;
  v_lewat text[] := case when tg_op = 'UPDATE' then old.dilewati else '{}'::text[] end;
begin
  if tg_op = 'INSERT' then
    perform public.temukan_catat(new.id, new.peran, 'discovery_started');
    perform public.temukan_catat(new.id, new.peran, 'role_selected');
  end if;
  for k in select jsonb_object_keys(new.jawaban) loop
    if not v_lama ? k then
      perform public.temukan_catat(new.id, new.peran, 'question_answered', k, jsonb_strip_nulls(jsonb_build_object('nilai', public.temukan_nilai_analitik(k, new.jawaban -> k))));
    elsif v_lama -> k is distinct from new.jawaban -> k then
      perform public.temukan_catat(new.id, new.peran, 'preferences_updated', k, jsonb_strip_nulls(jsonb_build_object('nilai', public.temukan_nilai_analitik(k, new.jawaban -> k))));
    end if;
  end loop;
  for k in select x from unnest(new.dilewati) x where not (x = any (v_lewat)) loop
    perform public.temukan_catat(new.id, new.peran, 'question_skipped', k);
  end loop;
  if new.selesai is not null and (tg_op = 'INSERT' or old.selesai is null) then
    perform public.temukan_catat(new.id, new.peran, 'discovery_completed', null,
      jsonb_build_object('detik', greatest(0, round(extract(epoch from (new.selesai - new.dibuat))))::integer));
  end if;
  return null;
end
$$;
revoke execute on function public.temukan_catat_sesi() from public, anon, authenticated;
create trigger sesi_temukan_analitik after insert or update of jawaban, dilewati, selesai on public.sesi_temukan
  for each row execute function public.temukan_catat_sesi();

-- Pemicu: minat yang berasal dari Temukan peluang.
create function public.temukan_catat_minat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_peran text := case when new.sumber = 'pengelola' then 'dealer' else 'tenant' end;
  v_sesi  uuid;
begin
  if new.sumber not in ('temukan', 'formulir', 'pengelola') then
    return null;
  end if;
  v_sesi := nullif(current_setting('temukan.sesi', true), '')::uuid;
  if v_sesi is null then
    select s.id into v_sesi from public.sesi_temukan s where s.user_id = auth.uid() and s.peran = v_peran;
  end if;
  if v_sesi is not null then
    perform public.temukan_catat(v_sesi, v_peran, case when v_peran = 'dealer' then 'dealer_interest_submitted' else 'tenant_interest_submitted' end, null,
      jsonb_strip_nulls(jsonb_build_object('sumber', new.sumber, 'segmen', new.segmen)));
  end if;
  return null;
end
$$;
revoke execute on function public.temukan_catat_minat() from public, anon, authenticated;
create trigger minat_lokasi_analitik after insert on public.minat_lokasi
  for each row execute function public.temukan_catat_minat();

create or replace function public.temukan_serahkan(p_token text, p_calon_token uuid) returns jsonb
language plpgsql security definer set search_path = '' set enable_nestloop = off as $$
declare
  c        public.calon_tenant;
  s        public.sesi_temukan;
  v_n      integer;
begin
  if not public.temukan_token_sah(p_token) then
    return jsonb_build_object('ok', false, 'jumlah', 0);
  end if;
  select * into c from public.calon_tenant where token = p_calon_token and dibuat_oleh = 'publik' and dibuat > now() - interval '10 minutes';
  select * into s from public.sesi_temukan
  where token_hash = public.temukan_sidik(p_token) and peran = 'tenant' and user_id is null and kedaluwarsa >= now() for update;
  if c.id is null or s.id is null or jsonb_array_length(s.diminati) = 0 then
    return jsonb_build_object('ok', true, 'jumlah', 0);
  end if;
  -- Untuk analitik: pemicu di minat_lokasi membaca sesi asal minat ini dari setelan transaksi.
  perform set_config('temukan.sesi', s.id::text, true);
  insert into public.minat_lokasi (calon_id, spbu_id, lahan_id, lahan_kode, spbu_nomor, dibuat_oleh, sumber, potret)
  select c.id, r.spbu_id, r.lahan_id, x.kode, sp.nomor, 'publik', 'formulir', public.temukan_potret_bersih(d.potret)
  from (select distinct on (q ->> 'lahan_id') q ->> 'lahan_id' as lahan_id, q -> 'potret' as potret from jsonb_array_elements(s.diminati) q limit 10) d
  join public.temukan_ruang_tampil() r on r.lahan_id = d.lahan_id
  join public.lahan x on x.spbu_id = r.spbu_id and x.lahan_id = r.lahan_id and not x.duplikat
  join public.spbu sp on sp.id = r.spbu_id
  on conflict do nothing;
  get diagnostics v_n = row_count;
  update public.sesi_temukan set diminati = '[]'::jsonb where id = s.id;
  if v_n > 0 then
    perform public.audit_catat('minat_lokasi_dari_formulir', 'calon_tenant', c.id::text, jsonb_build_object('jumlah', v_n));
  end if;
  return jsonb_build_object('ok', true, 'jumlah', v_n);
end
$$;

-- Baris sesi yang berlaku untuk pemanggil dan satu peran: preferensi akun, atau sesi cookie.
create function public.temukan_sesi_id(p_token text, p_peran text) returns uuid
language sql stable security definer set search_path = '' as $$
  select case
    when public.temukan_peran_akun() = p_peran then (select s.id from public.sesi_temukan s where s.user_id = auth.uid() and s.peran = p_peran)
    when public.temukan_token_sah(p_token) then
      (select s.id from public.sesi_temukan s where s.token_hash = public.temukan_sidik(p_token) and s.peran = p_peran and s.user_id is null and s.kedaluwarsa >= now())
  end
$$;
revoke execute on function public.temukan_sesi_id(text, text) from public, anon, authenticated;

-- Tiga peristiwa tampilan yang hanya diketahui halaman. Butuh sesi yang ada; paling banyak 300 per sesi per hari.
create function public.temukan_peristiwa(p_token text, p_peran text, p_peristiwa text, p_data jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sesi  uuid := public.temukan_sesi_id(p_token, p_peran);
  v_data  jsonb := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
begin
  if v_sesi is null or p_peristiwa is null or p_peristiwa not in ('recommendation_generated', 'recommendation_viewed', 'recommendation_clicked') then
    return jsonb_build_object('ok', false);
  end if;
  if (select count(*) from public.peristiwa_temukan e where e.sesi = public.temukan_pseudonim(v_sesi) and e.waktu > now() - interval '1 day') >= 300 then
    return jsonb_build_object('ok', false);
  end if;
  perform public.temukan_catat(v_sesi, p_peran, p_peristiwa, null, jsonb_strip_nulls(case p_peristiwa
    when 'recommendation_clicked' then jsonb_build_object(
      'aksi', case when v_data ->> 'aksi' in ('rinci', 'banding', 'tandai', 'peta', 'minat') then v_data ->> 'aksi' end,
      'urut', public.temukan_angka(v_data ->> 'urut', 1, 1000),
      'skor', public.temukan_angka(v_data ->> 'skor', 0, 100))
    else jsonb_build_object(
      'jumlah', public.temukan_angka(v_data ->> 'jumlah', 0, 100000),
      'jumlah_lain', public.temukan_angka(v_data ->> 'jumlah_lain', 0, 100000),
      'tertahan', public.temukan_angka(v_data ->> 'tertahan', 0, 100000),
      'kosong', v_data -> 'kosong' = 'true'::jsonb) end));
  return jsonb_build_object('ok', true);
end
$$;

-- Umpan balik atas satu rekomendasi. Satu penilaian per sesi per lokasi (dan jenis usaha); penilaian baru menimpa yang lama.
create function public.temukan_umpan(p_token text, p_peran text, p_lahan_id text, p_segmen text, p_nilai text, p_alasan text default null, p_potret jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sesi   uuid := public.temukan_sesi_id(p_token, p_peran);
  v_nama   text;
  v_p      jsonb := case when jsonb_typeof(p_potret) = 'object' then p_potret else '{}'::jsonb end;
  v_segmen text := case when p_peran = 'dealer' and p_segmen = any (public.segmen_calon()) then p_segmen end;
begin
  if v_sesi is null then
    return jsonb_build_object('ok', false, 'pesan', 'Jawab dulu pertanyaan Temukan peluang.');
  end if;
  if p_nilai is null or p_nilai not in ('sesuai', 'kurang') or coalesce(p_lahan_id, '') = '' or length(p_lahan_id) > 80
     or (p_alasan is not null and p_alasan not in ('tarif', 'lokasi', 'ruang', 'data', 'lain')) or (p_peran = 'dealer' and v_segmen is null) then
    return jsonb_build_object('ok', false, 'pesan', 'Penilaian tidak dikenal.');
  end if;
  v_nama := public.temukan_pseudonim(v_sesi);
  if (select count(*) from public.umpan_temukan u where u.sesi = v_nama) >= 200 then
    return jsonb_build_object('ok', false, 'pesan', 'Terima kasih, penilaian Anda sudah cukup banyak untuk sesi ini.');
  end if;
  insert into public.umpan_temukan (sesi, peran, lahan_id, segmen, nilai, alasan, skor, preferensi, urut, versi_model, versi_preferensi)
  values (v_nama, p_peran, p_lahan_id, v_segmen, p_nilai, case when p_nilai = 'kurang' then p_alasan end,
          public.temukan_angka(v_p ->> 'skor', 0, 100)::integer, public.temukan_angka(v_p ->> 'preferensi', 0, 100)::integer,
          public.temukan_angka(v_p ->> 'urut', 1, 1000)::integer, left(v_p ->> 'versi_model', 12), left(v_p ->> 'versi_preferensi', 12))
  on conflict (sesi, lahan_id, coalesce(segmen, '')) do update
    set nilai = excluded.nilai, alasan = excluded.alasan, skor = excluded.skor, preferensi = excluded.preferensi, urut = excluded.urut,
        versi_model = excluded.versi_model, versi_preferensi = excluded.versi_preferensi, diubah = now();
  return jsonb_build_object('ok', true);
end
$$;

create function public.temukan_umpan_saya(p_token text, p_peran text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('lahan_id', u.lahan_id, 'segmen', u.segmen, 'nilai', u.nilai, 'alasan', u.alasan)), '[]'::jsonb)
  from public.umpan_temukan u
  where u.sesi = public.temukan_pseudonim(public.temukan_sesi_id(p_token, p_peran)) and u.peran = p_peran
$$;

-- ================================================================ angka gabungan untuk tim NFR

-- Kohort: sesi yang mulai dalam p_hari hari terakhir. Semua angka lain dihitung untuk kohort itu.
create function public.temukan_analitik_peran(p_peran text, p_hari integer) returns jsonb
language sql stable set search_path = '' set enable_nestloop = off as $$
  with kohort as materialized (
    select e.sesi, min(e.waktu) as mulai
    from public.peristiwa_temukan e
    where e.peran = p_peran and e.peristiwa = 'discovery_started' and e.waktu >= now() - make_interval(days => p_hari)
    group by e.sesi
  ),
  e as materialized (
    select p.* from public.peristiwa_temukan p join kohort k on k.sesi = p.sesi where p.peran = p_peran
  ),
  selesai as materialized (select distinct sesi from e where peristiwa = 'discovery_completed'),
  terakhir as (
    select distinct on (x.sesi) x.sesi, x.langkah
    from e x
    where x.peristiwa in ('question_answered', 'question_skipped') and not exists (select 1 from selesai s where s.sesi = x.sesi)
    order by x.sesi, x.waktu desc, x.id desc
  ),
  pilihan as (
    select distinct on (x.sesi, x.langkah) x.sesi, x.langkah, x.data -> 'nilai' as nilai
    from e x
    where x.peristiwa in ('question_answered', 'preferences_updated') and jsonb_typeof(x.data -> 'nilai') = 'array'
    order by x.sesi, x.langkah, x.waktu desc, x.id desc
  ),
  u as (select w.* from public.umpan_temukan w join kohort k on k.sesi = w.sesi where w.peran = p_peran)
  select jsonb_build_object(
    'mulai', (select count(*) from kohort),
    'selesai', (select count(*) from selesai),
    'detik_median', (select percentile_cont(0.5) within group (order by (x.data ->> 'detik')::numeric) from e x where x.peristiwa = 'discovery_completed'),
    'pertanyaan', coalesce((
      select jsonb_agg(jsonb_build_object('langkah', q.langkah, 'dijawab', q.dijawab, 'dilewati', q.dilewati))
      from (select x.langkah,
                   count(distinct x.sesi) filter (where x.peristiwa = 'question_answered') as dijawab,
                   count(distinct x.sesi) filter (where x.peristiwa = 'question_skipped') as dilewati
            from e x where x.peristiwa in ('question_answered', 'question_skipped') and x.langkah is not null group by x.langkah) q), '[]'::jsonb),
    'berhenti', coalesce((select jsonb_agg(jsonb_build_object('langkah', q.langkah, 'sesi', q.n))
                          from (select t.langkah, count(*) as n from terakhir t group by t.langkah) q), '[]'::jsonb),
    'pilihan', coalesce((
      select jsonb_agg(jsonb_build_object('langkah', q.langkah, 'nilai', q.nilai, 'sesi', q.n))
      from (select p.langkah, v.nilai, count(distinct p.sesi) as n
            from pilihan p cross join lateral jsonb_array_elements_text(p.nilai) v (nilai)
            group by p.langkah, v.nilai order by count(distinct p.sesi) desc, p.langkah, v.nilai limit 80) q), '[]'::jsonb),
    'rekomendasi', jsonb_build_object(
      'dibuat', (select count(*) from e x where x.peristiwa = 'recommendation_generated'),
      'kosong', (select count(*) from e x where x.peristiwa = 'recommendation_generated' and x.data -> 'kosong' = 'true'::jsonb),
      'sesi_melihat', (select count(distinct x.sesi) from e x where x.peristiwa = 'recommendation_viewed'),
      'sesi_klik', (select count(distinct x.sesi) from e x where x.peristiwa = 'recommendation_clicked'),
      'sesi_minat', (select count(distinct x.sesi) from e x where x.peristiwa in ('tenant_interest_submitted', 'dealer_interest_submitted')),
      'sesi_ubah', (select count(distinct x.sesi) from e x where x.peristiwa = 'preferences_updated')),
    'umpan', jsonb_build_object(
      'sesuai', (select count(*) from u where nilai = 'sesuai'),
      'kurang', (select count(*) from u where nilai = 'kurang'),
      'skor_sesuai', (select round(avg(skor)) from u where nilai = 'sesuai'),
      'skor_kurang', (select round(avg(skor)) from u where nilai = 'kurang'),
      'alasan', coalesce((select jsonb_agg(jsonb_build_object('alasan', q.alasan, 'n', q.n))
                          from (select coalesce(alasan, 'tanpa') as alasan, count(*) as n from u where nilai = 'kurang' group by 1 order by 2 desc) q), '[]'::jsonb))
  )
$$;
revoke execute on function public.temukan_analitik_peran(text, integer) from public, anon, authenticated;

create function public.temukan_analitik(p_hari integer default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.adalah_nfr() then null else jsonb_build_object(
    'hari', greatest(1, least(coalesce(p_hari, 30), 180)),
    'retensi_hari', 180,
    'tenant', public.temukan_analitik_peran('tenant', greatest(1, least(coalesce(p_hari, 30), 180))),
    'dealer', public.temukan_analitik_peran('dealer', greatest(1, least(coalesce(p_hari, 30), 180)))
  ) end
$$;

revoke execute on function public.temukan_peristiwa(text, text, text, jsonb), public.temukan_umpan(text, text, text, text, text, text, jsonb),
  public.temukan_umpan_saya(text, text), public.temukan_analitik(integer) from public, anon;
grant execute on function public.temukan_peristiwa(text, text, text, jsonb), public.temukan_umpan(text, text, text, text, text, text, jsonb),
  public.temukan_umpan_saya(text, text) to anon, authenticated;
grant execute on function public.temukan_analitik(integer) to authenticated;

notify pgrst, 'reload schema';
