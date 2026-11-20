"use client";

import { Pencil } from "lucide-react";
import type { ButirRingkas } from "@/lib/temukan/ringkas";

/**
 * Ringkasan preferensi (PreferenceSummary): satu baris per pertanyaan, dengan tanda mana yang syarat
 * wajib dan mana yang preferensi, dan tombol untuk mengubah tiap jawaban.
 */
export default function RingkasanPreferensi({ butir, onUbah }: { butir: ButirRingkas[]; onUbah: (id: string) => void }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white shadow-card">
      {butir.map((b) => {
        const kosong = b.butir.length === 0;
        return (
          <li key={b.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
            <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">{b.ringkas}</p>
                <p className="text-xs text-subtle">{b.sifat === "syarat" ? "Syarat wajib" : "Preferensi"}</p>
              </div>
              {kosong ? (
                <p className="mt-1.5 text-sm text-subtle sm:mt-0.5">Dilewati</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5 sm:mt-0">
                  {b.butir.map((x) => (
                    <li key={x} className="rounded-md border border-line bg-canvas px-2.5 py-1 text-sm leading-snug text-ink">
                      {x}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => onUbah(b.id)}
              className="-my-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-brand-blue-strong hover:bg-brand-blue-soft"
            >
              <Pencil aria-hidden="true" className="size-4" />
              {kosong ? "Isi" : "Ubah"}
              <span className="sr-only"> {b.ringkas.toLowerCase()}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
