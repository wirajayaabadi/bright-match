"use client";

import { ArrowLeft, X } from "lucide-react";
import type { Keyakinan } from "@/lib/data-kecocokan";
import { barisBanding, type LokasiDinilai } from "@/lib/temukan/rekomendasi";

/**
 * Perbandingan sampai tiga lokasi, berdampingan. Tabelnya menggulung di dalam bingkainya sendiri pada
 * layar sempit, jadi halaman tidak ikut melebar. Tanda "unggul" hanya ada di tiga baris yang memang punya arah:
 * skor kecocokan, kesesuaian preferensi, dan tarif acuan terendah.
 */
export default function BandingLokasi({
  daftar,
  keyakinan,
  onHapus,
  onKembali,
}: {
  daftar: LokasiDinilai[];
  keyakinan: Record<string, Keyakinan | null | undefined>;
  onHapus: (lahanId: string) => void;
  onKembali: () => void;
}) {
  const baris = barisBanding(daftar, keyakinan);
  return (
    <section aria-labelledby="judul-banding" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 id="judul-banding" className="text-lg font-bold text-ink">
          Perbandingan {daftar.length} lokasi
        </h2>
        <button type="button" onClick={onKembali} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[15px] font-semibold text-ink hover:border-brand-blue/60">
          <ArrowLeft aria-hidden="true" className="size-4.5" />
          Kembali ke daftar
        </button>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Yang ditebalkan unggul di baris itu. Baris lain adalah fakta tanpa penilaian. Tarif adalah tarif acuan Brightspace, bukan penawaran.
      </p>
      <div tabIndex={0} role="region" aria-label="Tabel perbandingan, bisa digulung ke samping" className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-white shadow-card">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line align-top">
              <th scope="col" className="w-40 px-4 py-3 text-left text-xs font-semibold tracking-wide text-subtle uppercase">
                Yang dibandingkan
              </th>
              {daftar.map(({ lokasi: l }) => (
                <th key={l.lahan_id} scope="col" className="px-4 py-3 text-left">
                  <span className="angka block text-[15px] font-bold text-ink">SPBU {l.spbu_nomor}</span>
                  <span className="angka block text-xs font-semibold text-subtle">ruang {l.kode}</span>
                  <button
                    type="button"
                    onClick={() => onHapus(l.lahan_id)}
                    className="mt-1 -ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted hover:text-ink hover:underline"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                    Keluarkan
                    <span className="sr-only"> ruang {l.kode} dari perbandingan</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => (
              <tr key={b.nama} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-4 py-2.5 text-left font-semibold text-muted">
                  {b.nama}
                </th>
                {b.nilai.map((v, i) => (
                  <td key={daftar[i].lokasi.lahan_id} className={`angka px-4 py-2.5 ${b.unggul.includes(i) ? "font-bold text-ink" : "text-ink"}`}>
                    {v}
                    {b.unggul.includes(i) && <span className="sr-only"> (unggul)</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
