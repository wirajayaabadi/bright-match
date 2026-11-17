import { TombolHitungUlang } from "@/components/alur-peluang";
import { IsiKeyakinan } from "@/components/keyakinan-data";
import { RincianSkor, Skor } from "@/components/skor";
import { getPeluangKecocokan } from "@/lib/data-kecocokan";
import { tanggal } from "@/lib/format";

/**
 * Potret skor sebuah peluang: skor, versi model, penjelasan, tanggal sumber data, dan keyakinan data,
 * semuanya seperti saat dihitung. Potret lama tidak ditimpa; hitung ulang menambah potret baru.
 */
export default async function PotretSkorPeluang({ peluangId, bolehUbah }: { peluangId: string; bolehUbah: boolean }) {
  const hasil = await getPeluangKecocokan(peluangId);
  if (!hasil.data) return null;
  const { potret: p, jumlah } = hasil.data;

  return (
    <section>
      <h2 className="text-base font-bold text-ink">Skor kecocokan</h2>
      <p className="mt-1 mb-4 max-w-3xl text-sm leading-relaxed text-muted">
        Skor menilai seberapa cocok usaha ini dengan lahannya. Skor bukan perkiraan peluang berhasil atau keuntungan.
      </p>
      {p ? (
        <div className="grid gap-4">
          <div className="rounded-xl border border-line bg-white px-4 py-3.5 shadow-card">
            <div className="flex flex-wrap items-start gap-4">
              {p.skor != null ? <Skor nilai={p.skor} /> : <span className="text-sm font-bold text-brand-red-strong">Tidak lolos syarat wajib</span>}
              <p className="min-w-0 flex-1 basis-64 text-sm leading-relaxed text-muted">
                Dihitung {tanggal(p.dihitung)} oleh {p.dihitung_oleh ?? "sistem"} dengan model versi {p.versi_model}. Data:{" "}
                {p.sumber.map((s) => `${s.nama} per ${s.per_tanggal ? tanggal(s.per_tanggal) : "tanggal tidak tercatat"}`).join("; ")}.
                {jumlah > 1 && ` Ini potret ke-${jumlah}; potret sebelumnya tetap tersimpan.`}
              </p>
            </div>
            {p.rinci ? (
              <div className="mt-3 border-t border-line pt-3">
                <RincianSkor p={p.rinci} />
              </div>
            ) : (
              <p className="mt-3 border-t border-line pt-3 text-sm leading-relaxed text-muted">
                Saat dihitung, pasangan ini tidak memenuhi salah satu syarat wajib (luas, posisi, daya, tarif, atau wilayah), jadi tidak ada skor.
              </p>
            )}
          </div>
          <IsiKeyakinan k={p.keyakinan} judul="Keyakinan data saat skor dihitung" />
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-white px-4 py-3.5 text-sm leading-relaxed text-muted shadow-card">
          Peluang ini dibuat sebelum potret skor ada, jadi dasar skornya tidak tersimpan. Hitung ulang untuk menyimpan potret dari data saat ini.
        </p>
      )}
      {bolehUbah && (
        <div className="mt-3">
          <TombolHitungUlang id={peluangId} />
        </div>
      )}
    </section>
  );
}
