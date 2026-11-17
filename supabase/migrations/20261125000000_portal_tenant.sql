-- Bright Match 2.0 · irisan keempat (bagian B): portal tenant, tahap pertama.
--
-- 1. Admin NFR mengelola organisasi dan anggotanya dari aplikasi (sebelumnya hanya lewat SQL).
-- 2. Peluang yang sudah punya versi penawaran terbit bisa dibagikan ke satu organisasi tenant.
-- 3. Anggota organisasi itu melihat HANYA penawaran yang dibagikan ke organisasinya, lewat fungsi khusus
--    yang memilih kolom yang aman: tidak ada nama tenant lain, nilai kontrak pihak lain, catatan internal,
--    maupun data lahan lain. Tabel NFR tetap tertutup bagi mereka lewat Row Level Security.
-- 4. Tenant menanggapi: berminat, minta survei lokasi, bertanya, atau menolak dengan alasan.
--    Menyatakan minat tidak mengikat dan tidak memindahkan tahap; tim NFR yang menindaklanjuti.
-- 5. Admin tenant memutuskan persetujuan pihaknya sendiri atas versi yang berlaku, menggantikan
--    pencatatan "atas nama" oleh tim NFR.

-- Kolom berbagi ditambahkan lebih dulu karena fungsi di bawah merujuknya.
alter table public.peluang
  add column organisasi_tenant uuid references public.organisasi (id) on delete set null,
  add column dibagikan timestamptz,
  add column dibagikan_oleh text;

create index peluang_organisasi_idx on public.peluang (organisasi_tenant) where organisasi_tenant is not null;

comment on column public.peluang.organisasi_tenant is 'Organisasi tenant yang boleh melihat penawaran ini di portalnya.';

-- ================================================================ organisasi dan anggota (admin NFR)

create function public.organisasi_daftar() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'nama', o.nama, 'jenis', o.jenis, 'demo', o.demo,
           'anggota', coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'peran', k.peran) order by u.email)
                                from public.keanggotaan k join auth.users u on u.id = k.user_id
                                where k.organisasi_id = o.id), '[]'::jsonb),
           'peluang', (select count(*) from public.peluang p where p.organisasi_tenant = o.id))
         order by case o.jenis when 'nfr' then 1 when 'tenant' then 2 else 3 end, o.nama), '[]'::jsonb)
  from public.organisasi o
  where public.adalah_nfr()
$$;

create function public.organisasi_buat(p_nama text, p_jenis text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_nama text := nullif(left(btrim(coalesce(p_nama, '')), 120), '');
  v_id   uuid;
begin
  if coalesce(public.peran_nfr(), '') <> 'nfr_admin' then
    return jsonb_build_object('ok', false, 'pesan', 'Organisasi dibuat admin NFR.');
  end if;
  if p_jenis not in ('tenant', 'dealer') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilih jenis organisasi: tenant atau dealer.');
  end if;
  if v_nama is null or length(v_nama) < 3 then
    return jsonb_build_object('ok', false, 'pesan', 'Isi nama organisasinya, paling sedikit 3 huruf.');
  end if;
  if exists (select 1 from public.organisasi where lower(nama) = lower(v_nama)) then
    return jsonb_build_object('ok', false, 'pesan', 'Organisasi dengan nama itu sudah ada.');
  end if;
  insert into public.organisasi (nama, jenis) values (v_nama, p_jenis) returning id into v_id;
  perform public.audit_catat('organisasi_dibuat', 'organisasi', v_id::text, jsonb_build_object('nama', v_nama, 'jenis', p_jenis));
  return jsonb_build_object('ok', true, 'pesan', 'Organisasi dibuat.', 'id', v_id);
end
$$;

-- Menghubungkan akun yang sudah ada ke satu organisasi. Akun dibuat lebih dulu di Supabase (Authentication).
create function public.keanggotaan_atur(p_email text, p_organisasi_id uuid, p_peran text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user  uuid;
  v_jenis text;
begin
  if coalesce(public.peran_nfr(), '') <> 'nfr_admin' then
    return jsonb_build_object('ok', false, 'pesan', 'Anggota diatur admin NFR.');
  end if;
  select jenis into v_jenis from public.organisasi where id = p_organisasi_id;
  if v_jenis is null then
    return jsonb_build_object('ok', false, 'pesan', 'Organisasi tidak ditemukan.');
  end if;
  if (v_jenis = 'nfr' and p_peran not in ('nfr_admin', 'nfr_analis', 'nfr_penyetuju', 'auditor'))
     or (v_jenis = 'tenant' and p_peran not in ('tenant_admin', 'tenant_perwakilan'))
     or (v_jenis = 'dealer' and p_peran not in ('dealer_admin', 'dealer_operator')) then
    return jsonb_build_object('ok', false, 'pesan', 'Peran itu tidak berlaku untuk jenis organisasi ini.');
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    return jsonb_build_object('ok', false, 'pesan',
      'Belum ada akun dengan email itu. Buat dulu akunnya di dasbor Supabase (Authentication, Users), lalu hubungkan di sini.');
  end if;
  if v_user = auth.uid() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda sendiri diubah oleh admin lain, supaya tidak ada admin yang terkunci.');
  end if;
  insert into public.keanggotaan (user_id, organisasi_id, peran) values (v_user, p_organisasi_id, p_peran)
  on conflict (user_id, organisasi_id) do update set peran = excluded.peran;
  perform public.audit_catat('keanggotaan_diatur', 'organisasi', p_organisasi_id::text, jsonb_build_object('email', v_email, 'peran', p_peran));
  return jsonb_build_object('ok', true, 'pesan', 'Anggota tersimpan. Perannya berlaku setelah ia masuk ulang.');
end
$$;

create function public.keanggotaan_hapus(p_email text, p_organisasi_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if coalesce(public.peran_nfr(), '') <> 'nfr_admin' then
    return jsonb_build_object('ok', false, 'pesan', 'Anggota diatur admin NFR.');
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(coalesce(p_email, '')));
  if v_user = auth.uid() then
    return jsonb_build_object('ok', false, 'pesan', 'Anda tidak bisa mengeluarkan diri sendiri.');
  end if;
  delete from public.keanggotaan where user_id = v_user and organisasi_id = p_organisasi_id;
  if not found then
    return jsonb_build_object('ok', false, 'pesan', 'Orang itu bukan anggota organisasi ini.');
  end if;
  perform public.audit_catat('keanggotaan_dihapus', 'organisasi', p_organisasi_id::text, jsonb_build_object('email', lower(p_email)));
  return jsonb_build_object('ok', true, 'pesan', 'Anggota dikeluarkan dari organisasi.');
end
$$;

-- ================================================================ membagikan penawaran

create table public.tanggapan_tenant (
  id             bigint generated always as identity primary key,
  peluang_id     uuid not null references public.peluang (id) on delete cascade,
  organisasi_id  uuid not null references public.organisasi (id) on delete cascade,
  jenis          text not null check (jenis in ('berminat', 'minta_survei', 'tanya', 'menolak')),
  pesan          text,
  oleh           uuid references auth.users (id) on delete set null,
  oleh_email     text,
  waktu          timestamptz not null default now()
);

create index tanggapan_peluang_idx on public.tanggapan_tenant (peluang_id, waktu desc);

comment on table public.tanggapan_tenant is 'Tanggapan tenant atas penawaran yang dibagikan. Menyatakan minat tidak mengikat.';

alter table public.tanggapan_tenant enable row level security;
create policy "Tim NFR membaca tanggapan tenant" on public.tanggapan_tenant for select to authenticated using ((select public.adalah_nfr()));
revoke all on public.tanggapan_tenant from anon, authenticated;
grant select on public.tanggapan_tenant to authenticated;

-- Membagikan penawaran ke satu organisasi tenant (atau berhenti membagikan bila p_organisasi_id null).
create function public.peluang_bagikan(p_id uuid, p_organisasi_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v     public.peluang;
  v_org record;
begin
  if not public.boleh_ubah_nfr() then
    return jsonb_build_object('ok', false, 'pesan', 'Peran Anda tidak bisa membagikan penawaran.');
  end if;
  select * into v from public.peluang where id = p_id for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'pesan', 'Peluang tidak ditemukan.');
  end if;
  if p_organisasi_id is null then
    update public.peluang set organisasi_tenant = null, dibagikan = null, dibagikan_oleh = null, diubah = now() where id = p_id;
    perform public.audit_catat('penawaran_berhenti_dibagikan', 'peluang', p_id::text, jsonb_build_object('organisasi_dari', v.organisasi_tenant));
    return jsonb_build_object('ok', true, 'pesan', 'Penawaran tidak lagi dibagikan.');
  end if;
  select id, nama, jenis into v_org from public.organisasi where id = p_organisasi_id;
  if v_org.id is null or v_org.jenis <> 'tenant' then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran hanya bisa dibagikan ke organisasi tenant.');
  end if;
  if not exists (select 1 from public.penawaran_versi where peluang_id = p_id and status = 'diterbitkan') then
    return jsonb_build_object('ok', false, 'pesan', 'Terbitkan dulu satu versi penawaran. Draf tidak dibagikan ke tenant.');
  end if;
  update public.peluang set organisasi_tenant = p_organisasi_id, dibagikan = now(), dibagikan_oleh = public.email_saya(), diubah = now()
  where id = p_id;
  perform public.audit_catat('penawaran_dibagikan', 'peluang', p_id::text, jsonb_build_object(
    'organisasi_id', p_organisasi_id, 'organisasi', v_org.nama, 'organisasi_dari', v.organisasi_tenant));
  return jsonb_build_object('ok', true, 'pesan', 'Penawaran dibagikan ke ' || v_org.nama || '.');
end
$$;

-- Untuk halaman peluang NFR: organisasi yang dibagikan, pilihan organisasi tenant, dan tanggapan yang masuk.
create function public.peluang_portal(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'organisasi', (select jsonb_build_object('id', o.id, 'nama', o.nama, 'demo', o.demo) from public.organisasi o where o.id = p.organisasi_tenant),
    'dibagikan', p.dibagikan, 'dibagikan_oleh', p.dibagikan_oleh,
    'pilihan', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nama', o.nama, 'demo', o.demo) order by o.nama)
                         from public.organisasi o where o.jenis = 'tenant'), '[]'::jsonb),
    'tanggapan', coalesce((select jsonb_agg(jsonb_build_object('jenis', t.jenis, 'pesan', t.pesan, 'oleh', t.oleh_email, 'waktu', t.waktu)
                                            order by t.waktu desc, t.id desc)
                           from public.tanggapan_tenant t where t.peluang_id = p.id), '[]'::jsonb)
  )
  from public.peluang p where p.id = p_id
$$;

-- ================================================================ portal tenant (fungsi khusus, kolom aman saja)

-- true bila pengguna yang masuk anggota organisasi tenant yang dibagikan penawaran ini.
create function public.tenant_boleh_lihat(p_peluang_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.peluang p
    join public.keanggotaan k on k.organisasi_id = p.organisasi_tenant and k.user_id = auth.uid()
    join public.organisasi o on o.id = k.organisasi_id and o.jenis = 'tenant'
    where p.id = p_peluang_id
      and exists (select 1 from public.penawaran_versi v where v.peluang_id = p.id and v.status = 'diterbitkan'))
$$;

-- Status penawaran dalam bahasa tenant, tanpa membuka tahap internal NFR.
create function public.status_untuk_tenant(p_tahap text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_tahap in ('menolak', 'ditarik', 'ditolak', 'kalah', 'batal') then 'berakhir'
    when p_tahap = 'persetujuan' then 'menunggu_persetujuan'
    when p_tahap = 'kontrak' then 'tanda_tangan'
    when p_tahap in ('aktivasi', 'pemantauan') then 'berjalan'
    else 'ditawarkan' end
$$;

create function public.tenant_penawaran_daftar() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.dibagikan desc), '[]'::jsonb)
  from (
    select p.id, p.lahan_kode, p.spbu_nomor, p.kota, p.provinsi, p.dibagikan,
           public.status_untuk_tenant(p.tahap) as status,
           o.nama as organisasi,
           v.versi, v.sewa_tahunan, v.lama_sewa_bulan, v.diterbitkan,
           nullif(l.luas_m2, 0) as luas_m2, l.posisi,
           (select g.kunci from public.gambar g where g.spbu_id = p.spbu_id and g.lahan_id = p.lahan_id and g.jenis = 'lahan'
            order by g.urutan, g.id limit 1) as foto,
           (select t.jenis from public.tanggapan_tenant t where t.peluang_id = p.id order by t.waktu desc, t.id desc limit 1) as tanggapan_terakhir
    from public.peluang p
    join public.keanggotaan k on k.organisasi_id = p.organisasi_tenant and k.user_id = auth.uid()
    join public.organisasi o on o.id = k.organisasi_id and o.jenis = 'tenant'
    join public.penawaran_versi v on v.peluang_id = p.id and v.status = 'diterbitkan'
    left join public.lahan l on l.spbu_id = p.spbu_id and l.lahan_id = p.lahan_id and not l.duplikat
  ) x
$$;

-- Satu penawaran untuk tenant: lokasi, ruang, foto, syarat yang ditawarkan, lingkungan, alasan kecocokan,
-- mutu data, dan langkah yang tersedia. null bila bukan untuk organisasi pengguna.
create function public.tenant_penawaran_rinci(p_peluang_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.tenant_boleh_lihat(p_peluang_id) then null else (
    select jsonb_build_object(
      'id', p.id, 'lahan_kode', p.lahan_kode, 'status', public.status_untuk_tenant(p.tahap), 'dibagikan', p.dibagikan,
      'pihak', coalesce(c.nama_usaha, p.tenant_nama), 'segmen', p.segmen,
      'peran_saya', (select k.peran from public.keanggotaan k where k.organisasi_id = p.organisasi_tenant and k.user_id = auth.uid()),
      'spbu', jsonb_build_object('nomor', s.nomor, 'alamat', s.alamat, 'kota', s.kota, 'provinsi', s.provinsi, 'lat', s.lat, 'lng', s.lng,
                                 'fasilitas', s.fasilitas),
      'ruang', (select jsonb_build_object('luas_m2', nullif(l.luas_m2, 0), 'panjang_m', l.panjang_m, 'lebar_m', l.lebar_m, 'tinggi_m', l.tinggi_m,
                                          'posisi', l.posisi, 'lantai', l.lantai, 'daya_w', l.daya_w)
                from public.lahan l where l.spbu_id = p.spbu_id and l.lahan_id = p.lahan_id and not l.duplikat limit 1),
      'foto_lahan', public.daftar_gambar(p.spbu_id, p.lahan_id, 'lahan'),
      'foto_spbu', public.daftar_gambar(p.spbu_id, null, 'spbu'),
      'syarat', (select to_jsonb(v) - 'id' - 'peluang_id' - 'dibuat_oleh' - 'diterbitkan_oleh' - 'dibuat'
                 from public.penawaran_versi v where v.peluang_id = p.id and v.status = 'diterbitkan'),
      'lingkungan', (select jsonb_build_object('tipe_lokasi', e.tipe_lokasi, 'penduduk_3km', e.penduduk_3km, 'poi_1km', e.poi_1km)
                     from public.spbu_lingkungan e where e.spbu_id = p.spbu_id),
      'terdekat', coalesce((select jsonb_agg(to_jsonb(q) order by q.jarak_m)
                            from (select nama, jenis, jarak_m from public.poi_sekitar where spbu_id = p.spbu_id order by jarak_m limit 5) q), '[]'::jsonb),
      -- jenis usaha yang sudah ada di SPBU: jenisnya saja, tanpa nama tenant dan nilai kontrak
      'usaha_ada', coalesce((select jsonb_agg(distinct x.segmen) from public.lahan x
                             where x.spbu_id = p.spbu_id and x.status = 'Tersewa' and not x.duplikat), '[]'::jsonb),
      'kecocokan', (select jsonb_build_object('skor', h.skor, 'lolos', h.lolos, 'versi_model', h.versi_model, 'dihitung', h.dihitung, 'rinci', h.rinci)
                    from public.hasil_kecocokan h where h.peluang_id = p.id order by h.dihitung desc, h.id desc limit 1),
      'keyakinan', public.keyakinan_data_inti(p.lahan_id),
      'kesiapan', (select jsonb_build_object('kesiapan', st.kesiapan, 'status_data', st.status_data, 'pembatasan', st.pembatasan)
                   from public.v_status_lahan st where st.spbu_id = p.spbu_id and st.lahan_id = p.lahan_id limit 1),
      'sumber', coalesce((select jsonb_agg(jsonb_build_object('nama', sd.nama, 'per_tanggal', sd.per_tanggal) order by sd.kunci)
                          from public.sumber_data sd), '[]'::jsonb),
      'persetujuan', (select jsonb_build_object('id', a.id, 'status', a.status, 'diputuskan', a.diputuskan, 'alasan', a.alasan)
                      from public.persetujuan a join public.penawaran_versi v on v.id = a.penawaran_id
                      where a.peluang_id = p.id and a.pihak = 'tenant' and not a.gugur and v.status = 'diterbitkan'),
      'boleh_putuskan', p.tahap = 'persetujuan',
      'tanggapan', coalesce((select jsonb_agg(jsonb_build_object('jenis', t.jenis, 'pesan', t.pesan, 'oleh', t.oleh_email, 'waktu', t.waktu)
                                              order by t.waktu desc, t.id desc)
                             from public.tanggapan_tenant t where t.peluang_id = p.id), '[]'::jsonb)
    )
    from public.peluang p
    join public.spbu s on s.id = p.spbu_id
    left join public.calon_tenant c on c.id = p.calon_id
    where p.id = p_peluang_id
  ) end
$$;

-- Tanggapan tenant. Tidak mengikat dan tidak memindahkan tahap: tim NFR yang menindaklanjuti.
create function public.tenant_tanggapi(p_peluang_id uuid, p_jenis text, p_pesan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v       public.peluang;
  v_pesan text := nullif(left(btrim(coalesce(p_pesan, '')), 1000), '');
begin
  if not public.tenant_boleh_lihat(p_peluang_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran ini tidak ditemukan.');
  end if;
  if p_jenis not in ('berminat', 'minta_survei', 'tanya', 'menolak') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan tanggapan tidak dikenal.');
  end if;
  select * into v from public.peluang where id = p_peluang_id;
  if v.tahap = any (public.hasil_akhir()) then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran ini sudah berakhir, jadi tidak bisa ditanggapi lagi.');
  end if;
  if p_jenis in ('tanya', 'menolak') and (v_pesan is null or length(v_pesan) < 10) then
    return jsonb_build_object('ok', false, 'pesan',
      case p_jenis when 'tanya' then 'Tulis pertanyaannya dulu, paling sedikit 10 huruf.'
                   else 'Tulis alasannya dulu, paling sedikit 10 huruf. Alasan membantu kami menawarkan lokasi yang lebih cocok.' end);
  end if;
  insert into public.tanggapan_tenant (peluang_id, organisasi_id, jenis, pesan, oleh, oleh_email)
  values (p_peluang_id, v.organisasi_tenant, p_jenis, v_pesan, auth.uid(), public.email_saya());
  perform public.audit_catat('tenant_' || p_jenis, 'peluang', p_peluang_id::text, jsonb_build_object('pesan', v_pesan, 'organisasi_id', v.organisasi_tenant));
  return jsonb_build_object('ok', true, 'pesan',
    case p_jenis when 'berminat' then 'Minat Anda tercatat dan tidak mengikat. Tim Non Fuel Retail akan menghubungi Anda.'
                 when 'minta_survei' then 'Permintaan survei lokasi tercatat. Tim Non Fuel Retail akan mengatur jadwalnya dengan Anda.'
                 when 'tanya' then 'Pertanyaan Anda terkirim ke tim Non Fuel Retail.'
                 else 'Penolakan Anda tercatat. Terima kasih atas alasannya.' end);
end
$$;

-- Admin tenant memutuskan persetujuan pihaknya atas versi yang berlaku.
create function public.tenant_putuskan(p_peluang_id uuid, p_keputusan text, p_alasan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v        public.peluang;
  s        public.persetujuan;
  d        public.penawaran_versi;
  v_peran  text;
  v_org    text;
  v_alasan text := nullif(left(btrim(coalesce(p_alasan, '')), 1000), '');
begin
  if not public.tenant_boleh_lihat(p_peluang_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran ini tidak ditemukan.');
  end if;
  select * into v from public.peluang where id = p_peluang_id for update;
  select k.peran, o.nama into v_peran, v_org
  from public.keanggotaan k join public.organisasi o on o.id = k.organisasi_id
  where k.organisasi_id = v.organisasi_tenant and k.user_id = auth.uid();
  if v_peran <> 'tenant_admin' then
    return jsonb_build_object('ok', false, 'pesan', 'Keputusan atas nama organisasi diambil admin tenant. Minta admin organisasi Anda memutuskannya.');
  end if;
  if p_keputusan not in ('disetujui', 'minta_revisi', 'ditolak') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan keputusan tidak dikenal.');
  end if;
  if v.tahap <> 'persetujuan' then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran ini belum sampai tahap persetujuan. Anda bisa menyatakan minat atau bertanya dulu.');
  end if;
  select * into d from public.penawaran_versi where peluang_id = p_peluang_id and status = 'diterbitkan';
  select * into s from public.persetujuan where penawaran_id = d.id and pihak = 'tenant' and not gugur for update;
  if s.id is null or s.status <> 'menunggu' then
    return jsonb_build_object('ok', false, 'pesan', 'Keputusan organisasi Anda atas versi ini sudah tercatat. Perubahan syarat butuh versi penawaran baru.');
  end if;
  if p_keputusan <> 'disetujui' and (v_alasan is null or length(v_alasan) < 10) then
    return jsonb_build_object('ok', false, 'pesan', 'Tulis alasannya dulu, paling sedikit 10 huruf.');
  end if;
  update public.persetujuan
  set status = p_keputusan, penyetuju = auth.uid(), penyetuju_email = public.email_saya(), atas_nama = false,
      wewenang = 'Admin tenant, ' || v_org, alasan = v_alasan, diputuskan = now()
  where id = s.id;
  update public.peluang set diubah = now() where id = p_peluang_id;
  perform public.audit_catat('persetujuan_diputuskan', 'peluang', p_peluang_id::text, jsonb_build_object(
    'persetujuan_id', s.id, 'pihak', 'tenant', 'keputusan', p_keputusan, 'alasan', v_alasan, 'atas_nama', false,
    'wewenang', 'Admin tenant, ' || v_org, 'penawaran_id', d.id, 'versi', d.versi));
  return jsonb_build_object('ok', true, 'pesan',
    case p_keputusan when 'disetujui' then 'Persetujuan organisasi Anda tercatat untuk versi ' || d.versi || '.'
                     when 'minta_revisi' then 'Permintaan revisi tercatat. Tim Non Fuel Retail akan menyusun versi baru.'
                     else 'Penolakan organisasi Anda tercatat.' end);
end
$$;

-- ---------------------------------------------------------------- hak panggil

revoke execute on function
  public.organisasi_daftar(), public.organisasi_buat(text, text), public.keanggotaan_atur(text, uuid, text),
  public.keanggotaan_hapus(text, uuid), public.peluang_bagikan(uuid, uuid), public.peluang_portal(uuid),
  public.tenant_boleh_lihat(uuid), public.status_untuk_tenant(text), public.tenant_penawaran_daftar(),
  public.tenant_penawaran_rinci(uuid), public.tenant_tanggapi(uuid, text, text), public.tenant_putuskan(uuid, text, text)
from public, anon;

grant execute on function
  public.organisasi_daftar(), public.organisasi_buat(text, text), public.keanggotaan_atur(text, uuid, text),
  public.keanggotaan_hapus(text, uuid), public.peluang_bagikan(uuid, uuid), public.peluang_portal(uuid),
  public.tenant_boleh_lihat(uuid), public.status_untuk_tenant(text), public.tenant_penawaran_daftar(),
  public.tenant_penawaran_rinci(uuid), public.tenant_tanggapi(uuid, text, text), public.tenant_putuskan(uuid, text, text)
to authenticated;

notify pgrst, 'reload schema';
