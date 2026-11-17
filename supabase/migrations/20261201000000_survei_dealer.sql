-- Jadwal survei di portal pengelola SPBU.
-- 1. Pengelola melihat survei yang sudah dijadwalkan di SPBU yang dikelolanya: tanggal, jam, ruang, jenis usaha, pendamping.
--    Nama calon tenant, syarat sewa, dan catatan survei tidak ikut: baru dibuka saat usulannya sampai tahap persetujuan.
-- 2. Pengelola menandai "sudah tahu". Tim NFR melihat tanda itu. Bila jadwal berubah, tandanya gugur.

alter table public.survei_lokasi
  add column diketahui_dealer timestamptz,
  add column diketahui_oleh   text;

comment on column public.survei_lokasi.diketahui_dealer is 'Kapan pengelola SPBU menandai jadwal ini sudah diketahui. Gugur bila jadwal berubah.';

create function public.survei_gugurkan_diketahui() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.diketahui_dealer := null;
  new.diketahui_oleh := null;
  return new;
end
$$;
revoke execute on function public.survei_gugurkan_diketahui() from public, anon, authenticated;

create trigger survei_jadwal_berubah before update on public.survei_lokasi
for each row when (old.jadwal_tanggal is distinct from new.jadwal_tanggal or old.jadwal_jam is distinct from new.jadwal_jam)
execute function public.survei_gugurkan_diketahui();

-- Survei terjadwal yang belum lewat, di SPBU yang dikelola organisasi pengguna. p_spbu_id menyaring ke satu SPBU.
create function public.dealer_survei(p_spbu_id text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) - 'urut_jam' order by x.jadwal_tanggal, x.urut_jam, x.lahan_kode), '[]'::jsonb)
  from (
    select s.id, p.spbu_id, p.spbu_nomor, p.lahan_id, p.lahan_kode, nullif(l.luas_m2, 0) as luas_m2, l.posisi, p.segmen,
           s.jadwal_tanggal, to_char(s.jadwal_jam, 'HH24:MI') as jadwal_jam, s.jadwal_jam as urut_jam, s.pendamping,
           s.diketahui_dealer as diketahui, s.diketahui_oleh
    from public.survei_lokasi s
    join public.peluang p on p.id = s.peluang_id
    join public.hak_spbu h on h.spbu_id = p.spbu_id
    join public.keanggotaan k on k.organisasi_id = h.organisasi_dealer and k.user_id = auth.uid()
    join public.organisasi o on o.id = h.organisasi_dealer and o.jenis = 'dealer'
    left join public.lahan l on l.spbu_id = p.spbu_id and l.lahan_id = p.lahan_id and not l.duplikat
    where s.status = 'dijadwalkan' and s.jadwal_tanggal >= public.hari_ini_wib()
      and (p_spbu_id is null or p.spbu_id = p_spbu_id)
  ) x
$$;

create function public.dealer_survei_ketahui(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.survei_lokasi;
  v public.peluang;
begin
  select * into s from public.survei_lokasi where id = p_id for update;
  if s.id is not null then
    select * into v from public.peluang where id = s.peluang_id;
  end if;
  if s.id is null or not public.dealer_kelola_spbu(v.spbu_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Jadwal survei ini tidak ditemukan.');
  end if;
  if s.status <> 'dijadwalkan' then
    return jsonb_build_object('ok', false, 'pesan', 'Survei ini sudah tidak terjadwal. Muat ulang halaman untuk melihat keadaan terbarunya.');
  end if;
  if s.diketahui_dealer is not null then
    return jsonb_build_object('ok', true, 'pesan', 'Jadwal ini sudah ditandai diketahui.');
  end if;
  update public.survei_lokasi set diketahui_dealer = now(), diketahui_oleh = public.email_saya() where id = p_id;
  perform public.audit_catat('survei_diketahui_dealer', 'peluang', s.peluang_id::text,
    jsonb_build_object('survei_id', s.id, 'spbu_id', v.spbu_id, 'tanggal', s.jadwal_tanggal, 'jam', to_char(s.jadwal_jam, 'HH24:MI')));
  return jsonb_build_object('ok', true, 'pesan', 'Tercatat. Tim Non Fuel Retail melihat bahwa Anda sudah mengetahui jadwal ini.');
end
$$;

-- Untuk tim NFR: ditambah keterangan apakah SPBU-nya sudah ditautkan ke organisasi pengelola.
create or replace function public.survei_peluang(p_peluang_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(
    (to_jsonb(s) - 'jadwal_jam') || jsonb_build_object(
      'jadwal_jam', to_char(s.jadwal_jam, 'HH24:MI'),
      'dealer_terhubung', exists (select 1 from public.peluang p join public.hak_spbu h on h.spbu_id = p.spbu_id
                                  where p.id = s.peluang_id and h.organisasi_dealer is not null))
    order by s.dibuat desc), '[]'::jsonb)
  from public.survei_lokasi s where s.peluang_id = p_peluang_id
$$;

revoke execute on function public.dealer_survei(text), public.dealer_survei_ketahui(uuid) from public, anon;
grant execute on function public.dealer_survei(text), public.dealer_survei_ketahui(uuid) to authenticated;

notify pgrst, 'reload schema';
