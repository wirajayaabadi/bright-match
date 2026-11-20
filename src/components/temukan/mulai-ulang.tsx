"use client";

import { useRef, useState } from "react";
import { hapusTemukan } from "@/app/aksi-temukan";
import { NAMA_PERAN } from "@/lib/temukan/kuesioner";
import type { Peran } from "@/lib/temukan/tipe";

/**
 * "Mulai ulang" menghapus jawaban yang tersimpan, jadi selalu lewat dialog konfirmasi yang menyebut
 * apa yang dihapus. Dialog bawaan peramban mengurung fokus dan menutup dengan Esc.
 */
export default function MulaiUlang({ peran, className, onSelesai }: { peran: Peran; className?: string; onSelesai: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [menunggu, setMenunggu] = useState(false);
  const [gagal, setGagal] = useState(false);
  const nama = NAMA_PERAN[peran].singkat.toLowerCase();

  async function hapus() {
    setMenunggu(true);
    setGagal(false);
    try {
      const hasil = await hapusTemukan(peran);
      if (!hasil.ok) throw new Error("gagal");
      dialog.current?.close();
      onSelesai();
    } catch {
      setGagal(true);
    } finally {
      setMenunggu(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={className}>
        Mulai ulang
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`mulai-ulang-${peran}`}
        className="temukan-dialog m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-white p-6 shadow-card"
      >
        <h2 id={`mulai-ulang-${peran}`} className="text-lg font-bold text-ink">
          Hapus jawaban {nama}?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Semua jawaban {nama} yang tersimpan dihapus dan Anda mulai lagi dari pertanyaan pertama. Jawaban yang dihapus tidak bisa dikembalikan.
        </p>
        {gagal && (
          <p role="alert" className="mt-3 text-sm text-brand-red-strong">
            Jawaban belum terhapus. Periksa sambungan Anda, lalu coba lagi.
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => dialog.current?.close()} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-[15px] font-semibold text-ink hover:border-brand-blue/60">
            Batal
          </button>
          <button
            type="button"
            onClick={hapus}
            aria-busy={menunggu}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-red-strong px-4 text-[15px] font-semibold text-white hover:brightness-90"
          >
            {menunggu ? "Menghapus…" : "Hapus jawaban"}
          </button>
        </div>
      </dialog>
    </>
  );
}
