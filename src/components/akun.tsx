import { keluar } from "@/app/login/actions";
import { getEmailPengguna } from "@/lib/data";

/** Email pengguna yang sedang masuk dan tombol keluar. */
export default async function Akun() {
  const email = await getEmailPengguna();
  if (!email) return null;

  return (
    <div className="flex items-center justify-between gap-3 lg:block">
      <p className="truncate text-xs text-subtle" title={email}>
        {email}
      </p>
      <form action={keluar} className="lg:mt-2">
        <button
          type="submit"
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-subtle hover:text-ink"
        >
          Keluar
        </button>
      </form>
    </div>
  );
}
