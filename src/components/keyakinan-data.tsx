import { Lencana } from "@/components/tabel";
import { getKeyakinanData, type Keyakinan, TINGKAT_KEYAKINAN } from "@/lib/data-kecocokan";

const WARNA = { tinggi: "hijau", sedang: "kuning", rendah: "merah" } as const;

/**
 * Keyakinan data satu lahan: seberapa bisa datanya dipercaya. Sengaja dipisah dari skor kecocokan:
 * skor menilai cocok tidaknya usaha dengan lahan, keyakinan menilai mutu data di balik penilaian itu.
 */
export function IsiKeyakinan({ k, judul = "Keyakinan data" }: { k: Keyakinan; judul?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5 text-sm shadow-card">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold text-ink">{judul}</span>
        <Lencana warna={WARNA[k.tingkat]}>
          {TINGKAT_KEYAKINAN[k.tingkat].nama}: {k.terpenuhi} dari {k.total} butir
        </Lencana>
      </p>
      <p className="mt-1 leading-relaxed text-muted">
        {TINGKAT_KEYAKINAN[k.tingkat].arti} Ini bukan bagian dari skor kecocokan.
      </p>
      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {k.butir.map((b) => (
          <li key={b.nama} className="flex gap-2 leading-relaxed">
            <span className={`shrink-0 font-semibold ${b.ok ? "text-brand-green-strong" : "text-brand-red-strong"}`}>{b.ok ? "Ada:" : "Belum:"}</span>
            <span className="text-ink">{b.nama}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Keyakinan data saat ini, untuk kartu lahan. Tidak merender apa pun bila belum bisa dibaca. */
export default async function KeyakinanData({ lahanId }: { lahanId: string }) {
  const hasil = await getKeyakinanData(lahanId);
  if (!hasil.data) return null;
  return <IsiKeyakinan k={hasil.data} />;
}
