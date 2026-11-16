-- Foto untuk halaman daftar (Profil lokasi, Mesin kecocokan): satu panggilan untuk satu halaman berisi
-- paling banyak 100 SPBU dan 100 lahan, agar daftar tidak memanggil basis data per baris.

create function public.gambar_daftar(p_spbu text[] default null, p_lahan text[] default null) returns jsonb
language sql stable set search_path = '' as $$
select jsonb_build_object(
  'spbu', coalesce((
    select jsonb_object_agg(x.spbu_id, public.daftar_gambar(x.spbu_id, null, 'spbu'))
    from (select distinct g.spbu_id from public.gambar g
          where g.jenis = 'spbu' and g.spbu_id = any ((coalesce(p_spbu, '{}'))[1:100])) x
  ), '{}'::jsonb),
  'lahan', coalesce((
    select jsonb_object_agg(x.lahan_id, public.daftar_gambar(x.spbu_id, x.lahan_id, 'lahan'))
    from (select distinct g.spbu_id, g.lahan_id from public.gambar g
          where g.jenis = 'lahan' and g.lahan_id = any ((coalesce(p_lahan, '{}'))[1:100])) x
  ), '{}'::jsonb)
)
$$;

revoke execute on function public.gambar_daftar(text[], text[]) from public, anon;
grant execute on function public.gambar_daftar(text[], text[]) to authenticated;

notify pgrst, 'reload schema';
