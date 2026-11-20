"use client";

import { daya, luas } from "@/lib/format";
import IsianAnggaran from "@/components/temukan/isian-anggaran";
import IsianKolom from "@/components/temukan/isian-kolom";
import { PilihGrup } from "@/components/temukan/kartu-pilihan";
import PilihRuang, { type MuatanSpbu } from "@/components/temukan/pilih-ruang";
import PilihSpbu from "@/components/temukan/pilih-spbu";
import PilihWilayah from "@/components/temukan/pilih-wilayah";
import { letakRuang } from "@/lib/temukan/ringkas";
import type { JawabAnggaran, JawabIsian, JawabRuang, JawabSpbu, JawabWilayah, Jawaban, NilaiJawab, Pertanyaan, SpbuUmum, Wilayah } from "@/lib/temukan/tipe";

export type Konteks = {
  wilayah: Wilayah[];
  spbuSaya: SpbuUmum[];
  muatan: MuatanSpbu;
  onMuatLagi: () => void;
};

/** Data yang sudah tercatat untuk ruang yang dipilih: dikonfirmasi, bukan diketik ulang. */
function DataTercatat({ jawaban, muatan }: { jawaban: Jawaban; muatan: MuatanSpbu }) {
  const spbu = muatan.status === "ada" ? muatan.spbu : null;
  if (!spbu) return null;
  const pilih = jawaban.ruang as JawabRuang | undefined;
  const ruang = pilih?.semua || !pilih ? spbu.ruang : spbu.ruang.filter((r) => pilih.lahan.some((l) => l.lahan_id === r.lahan_id));
  if (ruang.length === 0 && spbu.fasilitas.length === 0) return null;
  return (
    <section aria-label="Data yang sudah tercatat" className="mb-6 rounded-xl border border-line bg-white p-5">
      <h2 className="text-sm font-bold text-ink">Yang sudah tercatat di Brightspace</h2>
      {ruang.length > 0 && (
        <dl className="mt-2 divide-y divide-line text-sm">
          {ruang.map((r) => (
            <div key={r.lahan_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
              <dt className="angka font-semibold text-ink">{r.kode}</dt>
              <dd className="angka text-muted">
                {[r.luas_m2 != null ? luas(r.luas_m2) : "luas belum tercatat", ...letakRuang(r), r.daya_w != null ? `daya ${daya(r.daya_w)}` : "daya belum tercatat"].join(" · ")}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {spbu.fasilitas.length > 0 && (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          <span className="font-semibold text-ink">Fasilitas SPBU:</span> {spbu.fasilitas.join(", ")}
        </p>
      )}
    </section>
  );
}

/**
 * Menampilkan satu pertanyaan menurut jenisnya (QuestionRenderer). Komponen ini tidak tahu isi
 * kuesioner: pertanyaan baru dengan jenis yang sudah ada cukup ditambahkan di berkas versi.
 */
export default function TampilPertanyaan({
  p,
  nilai,
  jawaban,
  galat,
  konteks,
  onUbah,
  onSentuh,
}: {
  p: Pertanyaan;
  nilai: unknown;
  jawaban: Jawaban;
  galat: Record<string, string>;
  konteks: Konteks;
  onUbah: (nilai: NilaiJawab | undefined) => void;
  onSentuh: (kolom: string) => void;
}) {
  switch (p.jenis) {
    case "pilih":
      return <PilihGrup p={p} nilai={Array.isArray(nilai) ? (nilai as string[]) : []} onUbah={onUbah} />;
    case "wilayah":
      return <PilihWilayah nilai={nilai as JawabWilayah | undefined} pilihan={konteks.wilayah} maks={p.maks} onUbah={onUbah} />;
    case "anggaran":
      return <IsianAnggaran p={p} nilai={nilai as JawabAnggaran | undefined} galat={galat} onUbah={onUbah} onSentuh={onSentuh} />;
    case "isian":
      return (
        <>
          {p.kolom.some((c) => c.id === "data_tercatat") && <DataTercatat jawaban={jawaban} muatan={konteks.muatan} />}
          <IsianKolom p={p} nilai={nilai as JawabIsian | undefined} jawaban={jawaban} galat={galat} onUbah={onUbah} onSentuh={onSentuh} />
        </>
      );
    case "spbu":
      return <PilihSpbu nilai={nilai as JawabSpbu | undefined} spbuSaya={konteks.spbuSaya} galat={galat} onUbah={onUbah} onSentuh={onSentuh} />;
    case "ruang":
      return (
        <PilihRuang
          spbu={jawaban.spbu as JawabSpbu | undefined}
          muatan={konteks.muatan}
          nilai={nilai as JawabRuang | undefined}
          onUbah={onUbah}
          onMuatLagi={konteks.onMuatLagi}
        />
      );
  }
}
