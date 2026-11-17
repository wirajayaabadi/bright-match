import Link from "next/link";
import { getStatusLahan } from "@/lib/data-status";
import { getMasalahLahan } from "@/lib/data-validasi";

/**
 * Peringatan kualitas data untuk satu lahan. Temuan kritis yang belum diputuskan menahan penawaran resmi
 * (dijaga juga di basis data saat peluang masuk tahap penawaran). Tidak merender apa pun bila lahan bersih.
 * `cetak`: versi ringkas yang ikut tercetak di kartu penawaran.
 */
export default async function PeringatanData({ lahanId, cetak = false }: { lahanId: string; cetak?: boolean }) {
  const masalah = await getMasalahLahan(lahanId);
  const kritis = masalah.filter((m) => m.tingkat === "kritis");

  if (cetak) {
    // Di kartu yang dicetak: tandai draf selama lahan belum boleh ditawarkan resmi, apa pun alasannya.
    const status = await getStatusLahan(lahanId);
    const boleh = status.data?.boleh;
    if (!boleh || boleh.boleh) return null;
    return (
      <p role="note" className="mb-5 rounded-lg border-2 border-brand-red px-4 py-3 text-sm leading-relaxed font-semibold text-brand-red-strong">
        Draf internal, belum penawaran resmi. {boleh.alasan}
      </p>
    );
  }
  if (masalah.length === 0) return null;

  const lain = masalah.length - kritis.length;
  return (
    <section
      aria-label="Kualitas data lahan"
      className={`tidak-cetak mb-6 rounded-xl border px-4 py-3.5 text-sm leading-relaxed ${
        kritis.length > 0 ? "border-brand-red bg-brand-red-soft text-brand-red-strong" : "border-line bg-white text-muted"
      }`}
    >
      <p className="font-bold">
        {kritis.length > 0
          ? "Lahan ini belum boleh ditawarkan resmi"
          : `Ada ${masalah.length} catatan kualitas data untuk lahan ini`}
      </p>
      <ul className="mt-1.5 space-y-1">
        {(kritis.length > 0 ? kritis : masalah).map((m) => (
          <li key={m.id}>
            {m.ringkasan}.{" "}
            <Link href={`/validasi/${m.id}`} className="font-semibold underline underline-offset-2">
              Lihat bukti dan putuskan
            </Link>
          </li>
        ))}
      </ul>
      {kritis.length > 0 && (
        <p className="mt-1.5">
          Peluang masih bisa dijajaki sampai survei lokasi. Tahap penawaran terbuka setelah temuan di atas diputuskan
          {lain > 0 ? `. Ada ${lain} catatan lain yang tidak menahan penawaran` : ""}.
        </p>
      )}
    </section>
  );
}
