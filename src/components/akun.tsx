import { keluar } from "@/app/login/actions";
import { getProfilSaya } from "@/lib/data-validasi";
import { getEmailPengguna } from "@/lib/data";
import { PERAN } from "@/lib/validasi";

/** Email, organisasi, dan peran pengguna yang sedang masuk, serta tombol keluar. */
export default async function Akun() {
  const [email, profil] = await Promise.all([getEmailPengguna(), getProfilSaya()]);
  if (!email) return null;
  const anggota = profil.data?.keanggotaan[0];

  return (
    <div className="flex items-center justify-between gap-3 lg:block">
      <div className="min-w-0">
        <p className="truncate text-xs text-subtle" title={email}>
          {email}
        </p>
        {anggota && (
          <p className="truncate text-xs font-semibold text-muted" title={anggota.organisasi}>
            {PERAN[anggota.peran] ?? anggota.peran}
          </p>
        )}
      </div>
      <form action={keluar} className="shrink-0 lg:mt-2">
        <button
          type="submit"
          className="min-h-11 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-muted transition-colors hover:border-subtle hover:text-ink"
        >
          Keluar
        </button>
      </form>
    </div>
  );
}
