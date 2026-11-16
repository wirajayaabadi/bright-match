-- Foto SPBU, foto lahan, dan logo outlet dari Brightspace.
-- Berkasnya disimpan di object storage (Cloudflare R2); tabel ini hanya menyimpan kuncinya.
-- Diisi dari supabase/gambar/gambar.csv.gz (hasil scripts/export_gambar.py) lewat npm run db:gambar.

create table public.gambar (
  id        bigint generated always as identity primary key,
  spbu_id   text not null references public.spbu (id) on delete cascade,
  lahan_id  text,                                      -- id lahan di Brightspace; null untuk foto SPBU
  jenis     text not null check (jenis in ('spbu', 'lahan', 'logo_outlet')),
  urutan    integer not null,                          -- urutan tampil di Brightspace, mulai dari 1
  label     text,                                      -- dari nama berkas asli, mis. "Pintu Masuk"
  diunggah  timestamp,                                 -- waktu unggah ke Brightspace, dari nama berkas
  kunci     text not null,                             -- kunci objek di bucket
  lebar     integer,
  tinggi    integer,
  check ((jenis = 'spbu') = (lahan_id is null))
);

comment on table public.gambar is
  'Gambar Brightspace per SPBU dan per lahan. Alamat gambar = NEXT_PUBLIC_GAMBAR_URL + "/" + kunci.';
comment on column public.gambar.kunci is
  'brightspace/<aa>/<sha256>.webp (sisi terpanjang 1600 px). Thumbnail 480 px: kunci yang sama dengan akhiran -480.webp.';

create index gambar_spbu_idx on public.gambar (spbu_id, jenis, urutan);
create index gambar_lahan_idx on public.gambar (lahan_id, spbu_id) where lahan_id is not null;

alter table public.gambar enable row level security;
create policy "Pengguna masuk boleh membaca gambar"
  on public.gambar for select to authenticated using (true);
revoke all on public.gambar from anon;
grant select on public.gambar to authenticated;

-- Daftar gambar sebagai larik jsonb, urut seperti di Brightspace.
create function public.daftar_gambar(p_spbu_id text, p_lahan_id text, p_jenis text) returns jsonb
language sql stable set search_path = '' as $$
select coalesce(jsonb_agg(jsonb_build_object(
         'kunci', g.kunci, 'lebar', g.lebar, 'tinggi', g.tinggi, 'label', g.label, 'diunggah', g.diunggah
       ) order by g.urutan, g.id), '[]'::jsonb)
from public.gambar g
where g.spbu_id = p_spbu_id and g.jenis = p_jenis
  and g.lahan_id is not distinct from p_lahan_id
$$;

-- Semua foto satu SPBU: foto SPBU, lalu foto tiap lahan (kunci objek = id lahan di Brightspace).
create function public.gambar_spbu(p_id text) returns jsonb
language sql stable set search_path = '' as $$
select jsonb_build_object(
  'spbu', public.daftar_gambar(p_id, null, 'spbu'),
  'lahan', coalesce((
    select jsonb_object_agg(x.lahan_id, public.daftar_gambar(p_id, x.lahan_id, 'lahan'))
    from (select distinct g.lahan_id from public.gambar g where g.spbu_id = p_id and g.jenis = 'lahan') x
  ), '{}'::jsonb)
)
$$;

-- Foto satu lahan beserta foto SPBU-nya. null bila lahan tidak ada.
create function public.gambar_lahan(p_lahan_id text) returns jsonb
language sql stable set search_path = '' as $$
select jsonb_build_object(
  'lahan', public.daftar_gambar(l.spbu_id, l.lahan_id, 'lahan'),
  'spbu', public.daftar_gambar(l.spbu_id, null, 'spbu')
)
from public.lahan l
where l.lahan_id = p_lahan_id and not l.duplikat
limit 1
$$;

revoke execute on function public.daftar_gambar(text, text, text) from public, anon;
grant execute on function public.daftar_gambar(text, text, text) to authenticated;
revoke execute on function public.gambar_spbu(text) from public, anon;
grant execute on function public.gambar_spbu(text) to authenticated;
revoke execute on function public.gambar_lahan(text) from public, anon;
grant execute on function public.gambar_lahan(text) to authenticated;

notify pgrst, 'reload schema';
