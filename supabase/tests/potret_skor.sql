-- Uji otomatis potret skor dan keyakinan data. Satu transaksi yang dibatalkan di akhir.

\set ON_ERROR_STOP on
\set QUIET on
-- Bila uji gagal di tengah, psql berhenti tanpa menutup transaksi. Batas ini menutup sesi yang tertinggal,
-- dan membuat uji lain gagal cepat dengan pesan jelas, bukan menggantung menunggu kuncinya.
set idle_in_transaction_session_timeout = '30s';
set lock_timeout = '45s';
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000031', 'analis4@uji.invalid'),
  ('00000000-0000-4000-a000-000000000033', 'tenant4@uji.invalid');
insert into public.organisasi (id, nama, jenis, demo) values ('00000000-0000-4000-b000-000000000031', 'Tenant Uji 4', 'tenant', true);
insert into public.keanggotaan (user_id, organisasi_id, peran)
select '00000000-0000-4000-a000-000000000031', id, 'nfr_analis' from public.organisasi where jenis = 'nfr';
insert into public.keanggotaan (user_id, organisasi_id, peran) values
  ('00000000-0000-4000-a000-000000000033', '00000000-0000-4000-b000-000000000031', 'tenant_admin');

do $_$ begin perform public.deteksi_masalah_data(); end $_$;

-- Pasangan yang pasti lolos syarat wajib: diambil dari hasil kecocokan sendiri.
create temp table _bahan on commit drop as
select k.lahan_id, k.tenant_id, k.skor, null::uuid as peluang
from (select l.lahan_id from public.lahan l where l.status = 'Tersedia' and not l.duplikat and l.tarif_tahunan is not null and l.luas_m2 > 0
        and not exists (select 1 from public.masalah_data m where l.lahan_id = any (m.lahan_ids))
        and not exists (select 1 from public.peluang p where p.lahan_id = l.lahan_id)
        and not exists (select 1 from public.status_lahan s where s.lahan_id = l.lahan_id)
      order by l.lahan_id limit 1) x
cross join lateral public.kecocokan(p_lahan_id => x.lahan_id, p_batas => 1) k;
grant select, update on _bahan to authenticated;

do $$ begin
  assert (select count(*) from _bahan) = 1, 'Bahan uji: butuh satu pasangan lahan dan tenant yang lolos syarat wajib.';
  assert public.keyakinan_data((select lahan_id from _bahan)) ->> 'tingkat' in ('sedang', 'rendah'), 'Lahan yang belum diverifikasi tidak boleh berkeyakinan tinggi.';
end $$;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000031","email":"analis4@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare
  v    jsonb;
  v_p  uuid;
  v_b  record;
begin
  select * into v_b from _bahan;
  -- skor dari klien diabaikan
  v_p := public.peluang_buat(v_b.lahan_id, null, v_b.tenant_id, 3);
  update _bahan set peluang = v_p;
  assert (select skor from public.peluang where id = v_p) = v_b.skor, 'Skor peluang harus dihitung server, bukan diambil dari klien.';
  assert (select count(*) from public.hasil_kecocokan where peluang_id = v_p) = 1, 'Potret skor harus dibuat saat peluang dibuat.';
  assert (select lolos and skor = v_b.skor and versi_model = public.versi_model_kecocokan() and rinci ? 'poin_tipe' and rinci ? 'poin_jaringan'
                 and keyakinan ? 'tingkat' and jsonb_array_length(sumber) = 2 and dihitung_oleh = 'analis4@uji.invalid'
          from public.hasil_kecocokan where peluang_id = v_p),
    'Potret harus memuat versi model, poin tiap komponen, keyakinan data, dan tanggal sumber.';

  -- potret lama tidak ditimpa
  v := public.peluang_potret_ulang(v_p);
  assert (v ->> 'ok')::boolean and (select count(*) from public.hasil_kecocokan where peluang_id = v_p) = 2, 'Hitung ulang harus menambah potret, bukan menimpa.';
  v := public.peluang_kecocokan(v_p);
  assert (v ->> 'jumlah')::int = 2 and v -> 'potret' ->> 'skor' is not null and v -> 'keyakinan_kini' ? 'butir', 'Rincian potret harus terbaca halaman.';
  begin
    update public.hasil_kecocokan set skor = 100;
    assert false, 'Potret skor tidak boleh bisa diubah langsung.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- setelah lahan terverifikasi, keyakinan data naik; skor tidak berubah karenanya
insert into public.status_lahan (spbu_id, lahan_id, lahan_kode, status_data, kesiapan, sidik_sumber, diverifikasi, diverifikasi_oleh)
select l.spbu_id, l.lahan_id, l.kode, 'terverifikasi', 'siap', public.sidik_lahan(l), now(), 'persiapan-uji'
from public.lahan l, _bahan b where l.lahan_id = b.lahan_id and not l.duplikat;
do $$
declare v jsonb := public.keyakinan_data((select lahan_id from _bahan));
begin
  assert (v -> 'butir' -> 0 ->> 'ok')::boolean, 'Butir verifikasi harus terpenuhi setelah lahan terverifikasi.';
  assert v ->> 'tingkat' = case when (v ->> 'terpenuhi')::int >= 6 then 'tinggi' else 'sedang' end, 'Tingkat keyakinan harus mengikuti jumlah butir yang terpenuhi.';
end $$;

do $_$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000033","email":"tenant4@uji.invalid","role":"authenticated"}', true); end $_$;
set local role authenticated;
do $$
declare v jsonb;
begin
  assert (select count(*) from public.hasil_kecocokan) = 0, 'Tenant tidak boleh membaca potret skor.';
  assert public.keyakinan_data((select lahan_id from _bahan)) is null, 'Tenant tidak boleh membaca keyakinan data lewat fungsi NFR.';
  v := public.peluang_potret_ulang((select peluang from _bahan));
  assert not (v ->> 'ok')::boolean, 'Tenant tidak boleh menghitung ulang skor.';
  begin
    perform public.keyakinan_data_inti((select lahan_id from _bahan));
    assert false, 'Fungsi inti tidak boleh bisa dipanggil pengguna.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
\echo 'LULUS: semua uji potret skor (skor dihitung server, potret tidak ditimpa, keyakinan data terpisah, isolasi tenant).'
