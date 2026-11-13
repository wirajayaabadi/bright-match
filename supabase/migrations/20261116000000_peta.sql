-- Peta sekitar SPBU: titik tempat Overture dalam 1 km, untuk halaman Profil lokasi.
-- Diisi dari supabase/lingkungan/tempat_peta.csv.gz (hasil scripts/eksternal/peta_tempat.py)
-- lewat npm run db:lingkungan.

create table public.tempat_peta (
  spbu_id  text primary key references public.spbu (id) on delete cascade,
  jumlah   integer not null,
  titik    jsonb not null
);

comment on table public.tempat_peta is
  'Tempat Overture dalam 1 km dari tiap SPBU berkoordinat. Satu baris per SPBU agar hemat ruang.';
comment on column public.tempat_peta.titik is
  'Larik [dx, dy, kelompok, nama], urut dari yang terdekat. dx dan dy = meter ke timur dan ke utara dari SPBU; kelompok = indeks di src/lib/peta.ts.';

alter table public.tempat_peta enable row level security;
create policy "Pengguna masuk boleh membaca peta sekitar"
  on public.tempat_peta for select to authenticated using (true);
revoke all on public.tempat_peta from anon;
grant select on public.tempat_peta to authenticated;

-- Satu SPBU beserta titik di sekitarnya. null bila SPBU tidak ada, tidak berkoordinat, atau petanya belum dimuat.
create function public.peta_spbu(p_id text) returns jsonb
language sql stable set search_path = '' as $$
select jsonb_build_object(
  'nomor', s.nomor,
  'lat', s.lat,
  'lng', s.lng,
  'jumlah', t.jumlah,
  'titik', t.titik,
  'sumber', l.sumber_tempat
)
from public.spbu s
join public.tempat_peta t on t.spbu_id = s.id
left join public.spbu_lingkungan l on l.spbu_id = s.id
where s.id = p_id and s.lat is not null and s.lng is not null
$$;

revoke execute on function public.peta_spbu(text) from public, anon;
grant execute on function public.peta_spbu(text) to authenticated;

notify pgrst, 'reload schema';
