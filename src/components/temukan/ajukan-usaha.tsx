"use client";

import { CircleCheck } from "lucide-react";
import { useId, useState } from "react";
import { ajukanUsaha, type HasilTindak } from "@/app/aksi-temukan";
import type { Potret } from "@/lib/temukan/tipe";

/**
 * Pengelola SPBU berwenang: mengajukan ketertarikan menghadirkan satu jenis usaha di satu ruang.
 * Tidak mengikat dan tidak memilih tenant: tim Non Fuel Retail yang menindaklanjuti dan mengusulkan calonnya.
 */
export default function AjukanUsaha({
  spbuId,
  lahanId,
  kode,
  segmen,
  namaUsaha,
  tercatat,
  potret,
}: {
  spbuId: string;
  lahanId: string;
  kode: string;
  segmen: string;
  namaUsaha: string;
  tercatat: boolean;
  potret: Potret;
}) {
  const id = useId();
  const [buka, setBuka] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [menunggu, setMenunggu] = useState(false);
  const [selesai, setSelesai] = useState(tercatat);
  const [hasil, setHasil] = useState<HasilTindak | null>(null);

  if (selesai) {
    return (
      <p role="status" className="mt-3 flex min-h-11 items-center gap-2 text-sm text-muted">
        <CircleCheck aria-hidden="true" className="size-4.5 shrink-0 text-brand-green-strong" />
        Ketertarikan Anda pada {namaUsaha.toLowerCase()} untuk ruang ini sudah tercatat. Tidak mengikat; tim Non Fuel Retail akan menindaklanjutinya.
      </p>
    );
  }

  async function kirim() {
    setMenunggu(true);
    setHasil(null);
    try {
      const h = await ajukanUsaha({ spbuId, lahanId, segmen, catatan, potret });
      if (h.ok || h.kode === "sudah") setSelesai(true);
      else setHasil(h);
    } catch {
      setHasil({ ok: false, pesan: "Ketertarikan belum terkirim. Periksa sambungan Anda, lalu coba lagi." });
    } finally {
      setMenunggu(false);
    }
  }

  if (!buka) {
    return (
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-blue-strong"
      >
        Ajukan ketertarikan
        <span className="sr-only">
          &nbsp;pada {namaUsaha.toLowerCase()} untuk ruang {kode}
        </span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void kirim();
      }}
      className="temukan-masuk mt-3 rounded-lg border border-line bg-canvas p-4"
    >
      <label htmlFor={`${id}-catatan`} className="block text-sm font-semibold text-ink">
        Catatan untuk tim Non Fuel Retail <span className="font-normal text-subtle">(opsional)</span>
      </label>
      <textarea
        id={`${id}-catatan`}
        rows={2}
        maxLength={500}
        value={catatan}
        onChange={(e) => setCatatan(e.target.value)}
        aria-describedby={`${id}-bantu`}
        className="mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink focus:border-brand-blue"
      />
      <p id={`${id}-bantu`} className="mt-1 text-xs leading-relaxed text-subtle">
        Ini belum memilih tenant dan belum menjadi keputusan. Tim Non Fuel Retail mengusulkan calon dan penawarannya lewat alur persetujuan yang biasa.
      </p>
      {hasil && !hasil.ok && (
        <p role="alert" className="mt-3 rounded-lg bg-brand-red-soft px-3.5 py-2.5 text-sm font-medium text-brand-red-strong">
          {hasil.pesan}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2.5">
        <button type="submit" aria-busy={menunggu} className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white hover:bg-brand-blue-strong">
          {menunggu ? "Mengirim…" : `Kirim ketertarikan pada ${namaUsaha.toLowerCase()}`}
        </button>
        <button type="button" onClick={() => setBuka(false)} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-[15px] font-semibold text-ink hover:border-brand-blue/60">
          Batal
        </button>
      </div>
    </form>
  );
}
