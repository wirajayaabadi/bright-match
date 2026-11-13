import Link from "next/link";
import type { Peluang } from "@/lib/data";
import { n, pct, rp } from "@/lib/format";

const th = "px-4 py-3 text-xs font-semibold tracking-wide text-subtle uppercase";
const td = "px-4 py-3 angka";

/**
 * Tabel peluang per wilayah. Batang di kolom "Lahan kosong" membandingkan
 * jumlah lahan kosong antarbaris; angkanya tetap tertulis di sampingnya.
 */
export default function TabelPeluang({
  baris,
  kolomNama,
  nama,
  href,
}: {
  baris: Peluang[];
  kolomNama: string;
  nama: (b: Peluang) => string;
  href?: (b: Peluang) => string;
}) {
  const maks = Math.max(1, ...baris.map((b) => b.lahan_kosong));

  return (
    <div className="relative overflow-x-auto rounded-xl border border-line bg-white shadow-card">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className={th}>
              {kolomNama}
            </th>
            <th scope="col" className={`${th} text-right`}>
              SPBU
            </th>
            <th scope="col" className={`${th} text-right`}>
              Lahan
            </th>
            <th scope="col" className={th}>
              Lahan kosong
            </th>
            <th scope="col" className={`${th} text-right`}>
              Okupansi
            </th>
            <th scope="col" className={`${th} text-right`}>
              Potensi sewa/tahun
            </th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => {
            const label = nama(b);
            return (
              <tr key={label} className="border-b border-line last:border-b-0 hover:bg-canvas/70">
                <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                  {href ? (
                    <Link href={href(b)} className="underline-offset-2 hover:text-brand-blue-strong hover:underline">
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                </th>
                <td className={`${td} text-right text-muted`}>{n(b.spbu)}</td>
                <td className={`${td} text-right text-muted`}>{n(b.lahan)}</td>
                <td className={td}>
                  <div className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-right font-semibold text-ink">{n(b.lahan_kosong)}</span>
                    <span aria-hidden="true" className="h-2 flex-1 rounded-full bg-canvas">
                      <span
                        className="block h-2 rounded-full bg-brand-blue"
                        style={{ width: `${(100 * b.lahan_kosong) / maks}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className={`${td} text-right text-muted`}>{pct(b.okupansi_pct)}</td>
                <td className={`${td} text-right font-semibold text-ink`}>
                  {b.potensi_sewa_bertarif > 0 ? rp(b.potensi_sewa_bertarif) : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CatatanPotensi() {
  return (
    <p className="mt-3 text-xs leading-relaxed text-subtle">
      Potensi sewa hanya menjumlahkan lahan kosong yang tarifnya tercantum dan wajar. Lahan kosong tanpa tarif belum
      dihitung.
    </p>
  );
}
