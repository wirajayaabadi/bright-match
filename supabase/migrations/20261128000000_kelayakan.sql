-- Bright Match 2.0 · irisan ketujuh: studio kelayakan untuk tenant.
--
-- Tenant menghitung kelayakan usahanya di satu lokasi dari asumsinya sendiri dan syarat sewa di versi penawaran
-- yang berlaku, lalu menyimpan skenarionya sebagai versi. Versi yang tersimpan tidak pernah diubah.
--
-- Asumsi keuangan tenant bersifat rahasia. Tabelnya tidak punya kebijakan baca sama sekali: tim NFR pun tidak
-- bisa membacanya, baik lewat tabel maupun lewat fungsi. Hanya anggota organisasi tenant pemilik skenario,
-- lewat dua fungsi di bawah. Jejak audit hanya mencatat bahwa satu versi disimpan, tanpa isinya.

create table public.skenario_kelayakan (
  id               uuid primary key default gen_random_uuid(),
  peluang_id       uuid not null references public.peluang (id) on delete cascade,
  organisasi_id    uuid not null references public.organisasi (id) on delete cascade,
  versi            integer not null,
  nama             text not null,
  model            text not null check (model in ('ritel', 'ev', 'atm', 'umum')),
  penawaran_versi  integer not null,                 -- versi penawaran yang syarat sewanya dipakai
  sewa             jsonb not null,                   -- syarat sewa saat itu, disalin dari versi penawaran (data yang diimpor)
  asumsi           jsonb not null,                   -- asumsi pengguna
  hasil            jsonb not null,                   -- hasil hitungan model untuk tiga skenario
  dibuat           timestamptz not null default now(),
  dibuat_oleh      text,
  unique (peluang_id, organisasi_id, versi)
);

comment on table public.skenario_kelayakan is
  'Skenario kelayakan yang disimpan tenant. Rahasia: tanpa kebijakan baca, hanya lewat fungsi untuk organisasi pemiliknya.';

alter table public.skenario_kelayakan enable row level security;
revoke all on public.skenario_kelayakan from anon, authenticated;

-- Menyimpan satu versi skenario. Syarat sewa diambil dari versi penawaran yang berlaku, bukan dari klien.
create function public.kelayakan_simpan(p_peluang_id uuid, p_nama text, p_model text, p_asumsi jsonb, p_hasil jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org   uuid;
  d       public.penawaran_versi;
  v_nama  text := nullif(left(btrim(coalesce(p_nama, '')), 80), '');
  v_versi integer;
begin
  if not public.tenant_boleh_lihat(p_peluang_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Penawaran ini tidak ditemukan.');
  end if;
  if p_model not in ('ritel', 'ev', 'atm', 'umum') then
    return jsonb_build_object('ok', false, 'pesan', 'Pilihan model usaha tidak dikenal.');
  end if;
  if v_nama is null or length(v_nama) < 2 then
    return jsonb_build_object('ok', false, 'pesan', 'Beri nama skenario ini dulu, misalnya "Dasar" atau "Buka 24 jam".');
  end if;
  if jsonb_typeof(p_asumsi) is distinct from 'object' or jsonb_typeof(p_hasil) is distinct from 'object'
     or pg_column_size(p_asumsi) > 8000 or pg_column_size(p_hasil) > 32000 then
    return jsonb_build_object('ok', false, 'pesan', 'Isi skenario tidak bisa disimpan. Muat ulang halaman lalu coba lagi.');
  end if;
  select organisasi_tenant into v_org from public.peluang where id = p_peluang_id;
  select * into d from public.penawaran_versi where peluang_id = p_peluang_id and status = 'diterbitkan';
  select coalesce(max(versi), 0) + 1 into v_versi from public.skenario_kelayakan where peluang_id = p_peluang_id and organisasi_id = v_org;
  if v_versi > 50 then
    return jsonb_build_object('ok', false, 'pesan', 'Sudah ada 50 versi untuk penawaran ini. Hubungi tim Non Fuel Retail bila perlu lebih.');
  end if;
  insert into public.skenario_kelayakan (peluang_id, organisasi_id, versi, nama, model, penawaran_versi, sewa, asumsi, hasil, dibuat_oleh)
  values (p_peluang_id, v_org, v_versi, v_nama, p_model, d.versi,
          jsonb_build_object('sewa_tahunan', d.sewa_tahunan, 'lama_sewa_bulan', d.lama_sewa_bulan, 'bebas_sewa_bulan', d.bebas_sewa_bulan,
                             'deposit', coalesce(d.deposit, 0), 'bagi_hasil_pct', coalesce(d.bagi_hasil_pct, 0)),
          p_asumsi, p_hasil, public.email_saya());
  -- isi skenario sengaja tidak masuk jejak audit
  perform public.audit_catat('skenario_kelayakan_disimpan', 'peluang', p_peluang_id::text, jsonb_build_object('versi', v_versi, 'organisasi_id', v_org));
  return jsonb_build_object('ok', true, 'pesan', 'Skenario disimpan sebagai versi ' || v_versi || '.', 'versi', v_versi);
end
$$;

-- Versi skenario milik organisasi pengguna untuk satu penawaran, yang terbaru dulu.
create function public.kelayakan_daftar(p_peluang_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.tenant_boleh_lihat(p_peluang_id) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'versi', s.versi, 'nama', s.nama, 'model', s.model, 'penawaran_versi', s.penawaran_versi,
                                        'sewa', s.sewa, 'asumsi', s.asumsi, 'hasil', s.hasil, 'dibuat', s.dibuat, 'dibuat_oleh', s.dibuat_oleh)
                     order by s.versi desc)
    from public.skenario_kelayakan s
    where s.peluang_id = p_peluang_id
      and s.organisasi_id = (select p.organisasi_tenant from public.peluang p where p.id = p_peluang_id)
  ), '[]'::jsonb) end
$$;

revoke execute on function public.kelayakan_simpan(uuid, text, text, jsonb, jsonb), public.kelayakan_daftar(uuid) from public, anon;
grant execute on function public.kelayakan_simpan(uuid, text, text, jsonb, jsonb), public.kelayakan_daftar(uuid) to authenticated;

notify pgrst, 'reload schema';
