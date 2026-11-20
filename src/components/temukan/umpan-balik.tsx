"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useId, useState } from "react";
import { kirimUmpan } from "@/app/aksi-temukan";
import type { Peran, Potret } from "@/lib/temukan/tipe";

const ALASAN: { nilai: string; nama: string }[] = [
  { nilai: "tarif", nama: "Tarif tidak sesuai" },
  { nilai: "lokasi", nama: "Lokasi kurang cocok" },
  { nilai: "ruang", nama: "Ruang tidak sesuai" },
  { nilai: "data", nama: "Datanya kurang lengkap" },
  { nilai: "lain", nama: "Alasan lain" },
];

/**
 * Umpan balik atas satu rekomendasi: sesuai atau kurang sesuai, dan bila kurang, satu alasan dari daftar.
 * Tanpa teks bebas dan tanpa identitas. Dipakai untuk menilai apakah urutan rekomendasi masuk akal.
 * Penilaian bisa diubah; yang terakhir yang disimpan.
 */
export default function UmpanBalik({
  peran,
  lahanId,
  segmen = null,
  subjek,
  awal,
  potret,
}: {
  peran: Peran;
  lahanId: string;
  segmen?: string | null;
  /** Yang dinilai, untuk label tombol: "ruang 3415138-IN-001" atau "makanan & minuman untuk ruang …". */
  subjek: string;
  awal: { nilai: "sesuai" | "kurang"; alasan: string | null } | null;
  potret: Potret & { urut?: number };
}) {
  const id = useId();
  const [nilai, setNilai] = useState<"sesuai" | "kurang" | null>(awal?.nilai ?? null);
  const [alasan, setAlasan] = useState<string | null>(awal?.alasan ?? null);
  const [gagal, setGagal] = useState(false);

  function kirim(n: "sesuai" | "kurang", a: string | null) {
    const sebelum = { nilai, alasan };
    setNilai(n);
    setAlasan(n === "kurang" ? a : null);
    setGagal(false);
    kirimUmpan({ peran, lahanId, segmen, nilai: n, alasan: n === "kurang" ? a : null, potret })
      .then((h) => {
        if (!h.ok) throw new Error(h.pesan);
      })
      .catch(() => {
        setNilai(sebelum.nilai);
        setAlasan(sebelum.alasan);
        setGagal(true);
      });
  }

  const tombol = (aktif: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors duration-150 ${
      aktif ? "border-brand-blue bg-brand-blue-soft text-brand-blue-strong" : "border-line bg-white text-muted hover:border-brand-blue/60 hover:text-ink"
    }`;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div role="group" aria-labelledby={`${id}-tanya`} className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p id={`${id}-tanya`} className="text-sm text-muted">
          Apakah rekomendasi ini sesuai?
        </p>
        <button type="button" onClick={() => kirim("sesuai", null)} aria-pressed={nilai === "sesuai"} className={tombol(nilai === "sesuai")}>
          <ThumbsUp aria-hidden="true" className="size-4" />
          Sesuai
          <span className="sr-only">: {subjek}</span>
        </button>
        <button type="button" onClick={() => kirim("kurang", alasan)} aria-pressed={nilai === "kurang"} className={tombol(nilai === "kurang")}>
          <ThumbsDown aria-hidden="true" className="size-4" />
          Kurang sesuai
          <span className="sr-only">: {subjek}</span>
        </button>
      </div>
      {nilai === "kurang" && (
        <fieldset className="temukan-masuk mt-3">
          <legend className="text-sm font-semibold text-ink">
            Apa yang kurang sesuai? <span className="font-normal text-subtle">(opsional)</span>
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ALASAN.map((a) => (
              <label
                key={a.nilai}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm font-semibold transition-colors duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue ${
                  alasan === a.nilai ? "border-brand-blue bg-brand-blue-soft text-brand-blue-strong" : "border-line bg-white text-muted hover:border-brand-blue/60 hover:text-ink"
                }`}
              >
                <input type="radio" name={`${id}-alasan`} value={a.nilai} checked={alasan === a.nilai} onChange={() => kirim("kurang", a.nilai)} className="sr-only" />
                {a.nama}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p role="status" className="mt-2 min-h-5 text-xs text-subtle">
        {gagal ? (
          <span className="font-medium text-brand-red-strong">Penilaian belum tersimpan. Periksa sambungan Anda, lalu coba lagi.</span>
        ) : nilai ? (
          "Terima kasih. Penilaian ini dipakai untuk memperbaiki urutan rekomendasi, tanpa identitas Anda."
        ) : (
          ""
        )}
      </p>
    </div>
  );
}
