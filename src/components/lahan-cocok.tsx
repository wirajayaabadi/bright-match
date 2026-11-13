import Link from "next/link";
import type { Pasangan } from "@/lib/data-tahap1";
import { daya, luas, rp } from "@/lib/format";
import { RincianSkor, Skor } from "./skor";
import { tautan } from "./tabel";
import TombolPeluang from "./tombol-peluang";

/**
 * Daftar lahan kosong yang cocok untuk satu pihak (tenant eksisting atau calon tenant),
 * dengan skor, alasan, dan tombol untuk menjadikannya peluang.
 */
export default function LahanCocok({
  lahan,
  tenantId,
  calonId,
  peluang = {},
}: {
  lahan: Pasangan[];
  tenantId?: string;
  calonId?: string;
  /** lahan_id → id peluang yang sudah dibuat untuk pihak ini */
  peluang?: Record<string, string>;
}) {
  return (
    <ol className="space-y-3">
      {lahan.map((p) => (
        <li key={p.lahan_id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 rounded-xl border border-line bg-white p-4 shadow-card">
          <Skor nilai={p.skor} />
          <div>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/kecocokan/lahan/${p.lahan_id}`} className={`${tautan} text-base`}>
                  {p.kode}
                </Link>
                <Link href={`/lokasi/${p.spbu_id}`} className="text-sm text-muted underline-offset-2 hover:underline">
                  SPBU {p.spbu_nomor}
                </Link>
                <span className="text-sm text-subtle">
                  {p.kota ?? "–"}, {p.provinsi}
                </span>
              </div>
              {peluang[p.lahan_id] ? (
                <Link href={`/pipeline/${peluang[p.lahan_id]}`} className="text-xs font-semibold text-brand-green-strong underline-offset-2 hover:underline">
                  Sudah menjadi peluang
                </Link>
              ) : (
                <TombolPeluang lahanId={p.lahan_id} tenantId={tenantId} calonId={calonId} skor={p.skor} />
              )}
            </div>
            <p className="angka mt-1 text-sm text-ink">
              {luas(p.luas_m2)} · {p.posisi ?? "–"} · {daya(p.daya_w)} ·{" "}
              {p.tarif_tahunan != null ? `${rp(p.tarif_tahunan)}/th` : "tarif belum tercantum"}
            </p>
            <div className="mt-2">
              <RincianSkor p={p} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
