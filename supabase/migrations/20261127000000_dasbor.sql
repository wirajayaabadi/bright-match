-- Bright Match 2.0 · irisan keenam: dasbor eksekutif NFR.
--
-- Satu panggilan untuk beranda. Semua angka dihitung dari data yang ada; yang belum punya sumber data
-- (pendapatan terealisasi) dikembalikan null dan ditampilkan sebagai "belum ada data", bukan nol.
-- Tiga nilai uang dipisah tegas:
--   perkiraan   = tarif Brightspace lahan kosong (belum ada pihak yang berminat)
--   ditawarkan  = sewa per tahun di versi penawaran yang berlaku pada peluang yang masih berjalan
--   terkontrak  = sewa per tahun di versi yang kontraknya sudah dicatat ditandatangani

create function public.dasbor_nfr() returns jsonb
language sql stable set search_path = '' as $$
  with
  -- Dihitung langsung dari tabelnya, bukan lewat v_status_lahan: view itu memeriksa temuan per lahan,
  -- terlalu lambat untuk ribuan lahan sekaligus. Di sini lahan bersengketa dikumpulkan satu kali.
  sengketa as materialized (
    select distinct unnest(m.lahan_ids) as lahan_id
    from public.masalah_data m where m.tingkat = 'kritis' and m.status in ('terbuka', 'ditinjau')
  ),
  kosong as materialized (
    select l.lahan_id, l.spbu_id,
           coalesce(s.status_ruang, 'tersedia') as status_ruang,
           case when g.lahan_id is not null then 'disengketakan'
                when s.status_data = 'terverifikasi' and s.sidik_sumber = public.sidik_lahan(l) then 'terverifikasi'
                else 'belum_diverifikasi' end as status_data,
           h.spbu_id is not null as hak_pasti
    from public.lahan l
    left join public.status_lahan s on s.spbu_id = l.spbu_id and s.lahan_id = l.lahan_id
    left join sengketa g on g.lahan_id = l.lahan_id
    left join public.hak_spbu h on h.spbu_id = l.spbu_id and h.status = 'dipastikan'
    where l.status = 'Tersedia' and not l.duplikat
  ),
  berjalan as (select p.* from public.peluang p where not (p.tahap = any (public.hasil_akhir()))),
  berlaku as (
    select v.*, p.tahap from public.penawaran_versi v join public.peluang p on p.id = v.peluang_id
    where v.status = 'diterbitkan'
  )
  select jsonb_build_object(
    'spbu', (select count(*) from public.spbu),
    'lahan', (select count(*) from public.lahan where not duplikat),
    'lahan_tersewa', (select count(*) from public.lahan where not duplikat and status = 'Tersewa'),
    'lahan_kosong', (select count(*) from kosong),
    'kosong_terverifikasi', (select count(*) from kosong where status_ruang = 'tersedia' and status_data = 'terverifikasi'),
    'kosong_boleh_ditawarkan', (select count(*) from kosong where status_ruang = 'tersedia' and status_data = 'terverifikasi' and hak_pasti),
    'kosong_tertahan_temuan', (select count(*) from kosong where status_data = 'disengketakan'),
    'kosong_ditahan', (select count(*) from kosong where status_ruang <> 'tersedia'),
    'spbu_wewenang_pasti', (select count(*) from public.hak_spbu where status = 'dipastikan'),
    'peluang_berjalan', (select count(*) from berjalan),
    'peluang_berakhir', (select count(*) from public.peluang p where p.tahap = any (public.hasil_akhir())),
    'peluang_terlambat', (select count(*) from berjalan where tenggat is not null and tenggat < current_date),
    'peluang_tanpa_pemilik', (select count(*) from berjalan where pemilik is null),
    'peluang_tanpa_tindakan', (select count(*) from berjalan where tindakan_berikut is null),
    -- peluang di tahap penawaran ke atas: yang sudah punya versi terbit, dan yang belum (dibuat sebelum aturan versi)
    'peluang_berversi', (select count(*) from berjalan p where array_position(public.urutan_tahap(), p.tahap) >= 7
                         and exists (select 1 from public.penawaran_versi v where v.peluang_id = p.id and v.status = 'diterbitkan')),
    'peluang_tanpa_versi', (select count(*) from berjalan p where array_position(public.urutan_tahap(), p.tahap) >= 7
                            and not exists (select 1 from public.penawaran_versi v where v.peluang_id = p.id and v.status = 'diterbitkan')),
    'per_tahap', coalesce((select jsonb_object_agg(x.tahap, x.n) from (select tahap, count(*) as n from berjalan group by tahap) x), '{}'::jsonb),
    'persetujuan_menunggu', (select count(*) from public.persetujuan a join berlaku b on b.id = a.penawaran_id
                             where not a.gugur and a.status = 'menunggu' and b.tahap = 'persetujuan'),
    'inspeksi_menunggu', (select count(*) from public.inspeksi_lahan where status = 'diajukan'),
    'temuan_kritis', (select count(*) from public.masalah_data where tingkat = 'kritis' and status in ('terbuka', 'ditinjau')),
    'tanggapan_tenant_7hari', (select count(*) from public.tanggapan_tenant where waktu > now() - interval '7 days'),
    'kontrak_ditandatangani', (select count(*) from public.kontrak_peluang),
    'outlet_beroperasi', (select count(*) from public.kontrak_peluang where aktif_sejak is not null),
    'nilai', jsonb_build_object(
      'perkiraan_tahunan', (select coalesce(sum(l.tarif_tahunan), 0) from public.lahan l where l.status = 'Tersedia' and not l.duplikat),
      'perkiraan_lahan', (select count(*) from public.lahan l where l.status = 'Tersedia' and not l.duplikat and l.tarif_tahunan is not null),
      'ditawarkan_tahunan', (select coalesce(sum(b.sewa_tahunan), 0) from berlaku b where not (b.tahap = any (public.hasil_akhir()))
                             and not exists (select 1 from public.kontrak_peluang k where k.peluang_id = b.peluang_id)),
      'ditawarkan_peluang', (select count(*) from berlaku b where not (b.tahap = any (public.hasil_akhir()))
                             and not exists (select 1 from public.kontrak_peluang k where k.peluang_id = b.peluang_id)),
      'terkontrak_tahunan', (select coalesce(sum(v.sewa_tahunan), 0) from public.kontrak_peluang k join public.penawaran_versi v on v.id = k.penawaran_id),
      'terkontrak_masa_sewa', (select coalesce(sum(v.sewa_tahunan * greatest(0, v.lama_sewa_bulan - v.bebas_sewa_bulan) / 12.0), 0)
                               from public.kontrak_peluang k join public.penawaran_versi v on v.id = k.penawaran_id),
      -- belum ada sumber data pembayaran sewa: sengaja null, bukan nol
      'terealisasi', null
    ),
    'sumber', coalesce((select jsonb_agg(jsonb_build_object('nama', s.nama, 'per_tanggal', s.per_tanggal) order by s.kunci) from public.sumber_data s), '[]'::jsonb)
  )
$$;

revoke execute on function public.dasbor_nfr() from public, anon;
grant execute on function public.dasbor_nfr() to authenticated;

notify pgrst, 'reload schema';
