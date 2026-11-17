-- Ruang kerja pengguna (nfr, tenant, dealer) disalin ke app_metadata agar ikut di token masuk.
-- Dipakai kerangka aplikasi untuk mengarahkan pengguna ke ruang kerjanya tanpa bertanya ke basis data
-- di setiap permintaan. Ini hanya untuk navigasi: penjaga data tetap Row Level Security.
-- Token lama baru memuat nilai ini setelah diperbarui (paling lama satu jam) atau setelah masuk ulang.

create function public.ruang_kerja_sinkron() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_ruang text;
begin
  select case when bool_or(o.jenis = 'nfr') then 'nfr'
              when bool_or(o.jenis = 'dealer') then 'dealer'
              when bool_or(o.jenis = 'tenant') then 'tenant' end
  into v_ruang
  from public.keanggotaan k join public.organisasi o on o.id = k.organisasi_id
  where k.user_id = v_user;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'ruang'
                          || case when v_ruang is null then '{}'::jsonb else jsonb_build_object('ruang', v_ruang) end
  where id = v_user;
  return null;
end
$$;

revoke execute on function public.ruang_kerja_sinkron() from public, anon, authenticated;

create trigger ruang_kerja_sinkron after insert or update or delete on public.keanggotaan
  for each row execute function public.ruang_kerja_sinkron();

-- Keanggotaan yang sudah ada.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('ruang', x.ruang)
from (
  select k.user_id,
         case when bool_or(o.jenis = 'nfr') then 'nfr' when bool_or(o.jenis = 'dealer') then 'dealer' else 'tenant' end as ruang
  from public.keanggotaan k join public.organisasi o on o.id = k.organisasi_id
  group by k.user_id
) x
where u.id = x.user_id;
