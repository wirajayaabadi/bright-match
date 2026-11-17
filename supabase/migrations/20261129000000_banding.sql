-- Banding sampai tiga penawaran untuk tenant. Satu panggilan untuk halaman /ruang-kerja/banding.
-- Hanya membaca: tidak ada tabel baru. Isinya sama dengan yang sudah boleh dilihat tenant di rincian penawaran,
-- ditambah ringkasan skenario kelayakan terbaru milik organisasinya sendiri.

create function public.tenant_penawaran_banding(p_ids uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  -- yang diminta: buang yang kembar dan yang bukan milik organisasi pengguna, pertahankan urutan, paling banyak tiga
  select coalesce(array_agg(y.id order by y.urut), '{}') into v_ids
  from (
    select x.id, x.urut
    from (select u.id, min(u.urut) as urut from unnest((coalesce(p_ids, '{}'))[1:12]) with ordinality u(id, urut) group by u.id) x
    where public.tenant_boleh_lihat(x.id)
    order by x.urut limit 3
  ) y;

  -- tanpa pilihan: tiga penawaran terbaru yang belum berakhir
  if cardinality(coalesce(p_ids, '{}')) = 0 then
    select coalesce(array_agg(y.id order by y.dibagikan desc), '{}') into v_ids
    from (
      select p.id, p.dibagikan
      from public.peluang p
      join public.keanggotaan k on k.organisasi_id = p.organisasi_tenant and k.user_id = auth.uid()
      join public.organisasi o on o.id = k.organisasi_id and o.jenis = 'tenant'
      where exists (select 1 from public.penawaran_versi v where v.peluang_id = p.id and v.status = 'diterbitkan')
        and public.status_untuk_tenant(p.tahap) <> 'berakhir'
      order by p.dibagikan desc limit 3
    ) y;
  end if;

  return jsonb_build_object(
    'daftar', public.tenant_penawaran_daftar(),
    'sumber', coalesce((select jsonb_agg(jsonb_build_object('nama', sd.nama, 'per_tanggal', sd.per_tanggal) order by sd.kunci)
                        from public.sumber_data sd), '[]'::jsonb),
    'banding', coalesce((
      select jsonb_agg(
        (public.tenant_penawaran_rinci(t.id) - 'foto_spbu' - 'tanggapan' - 'sumber' - 'terdekat' - 'persetujuan' - 'boleh_putuskan' - 'peran_saya')
        || jsonb_build_object('kelayakan', (
             select jsonb_build_object('versi', s.versi, 'nama', s.nama, 'model', s.model, 'penawaran_versi', s.penawaran_versi,
                                       'dibuat', s.dibuat, 'dasar', s.hasil -> 'dasar')
             from public.skenario_kelayakan s
             join public.peluang p on p.id = s.peluang_id and p.organisasi_tenant = s.organisasi_id
             where s.peluang_id = t.id
             order by s.versi desc limit 1))
        order by t.urut)
      from unnest(v_ids) with ordinality t(id, urut)), '[]'::jsonb));
end $$;

revoke execute on function public.tenant_penawaran_banding(uuid[]) from public, anon;
grant execute on function public.tenant_penawaran_banding(uuid[]) to authenticated;

notify pgrst, 'reload schema';
