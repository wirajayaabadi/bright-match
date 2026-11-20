"use client";

import { Check, ChevronDown, ChevronUp } from "lucide-react";
import Ikon from "@/components/temukan/ikon";
import type { Pertanyaan, Pilihan } from "@/lib/temukan/tipe";

/**
 * Kartu pilihan (OptionCard). Di baliknya tetap radio atau kotak centang asli, jadi panah, spasi,
 * dan pembaca layar bekerja seperti biasa. Kartu tidak pernah dinonaktifkan: bila batas pilihan
 * tercapai, pesannya muncul di bawah.
 */
export function KartuPilihan({
  pilihan,
  nama,
  jenis,
  terpilih,
  urutan,
  padat,
  onUbah,
}: {
  pilihan: Pilihan;
  nama: string;
  jenis: "radio" | "checkbox";
  terpilih: boolean;
  /** Nomor urut pada pertanyaan berperingkat. */
  urutan?: number;
  padat?: boolean;
  onUbah: () => void;
}) {
  return (
    <label
      className={`group relative flex cursor-pointer items-start gap-3 rounded-xl border bg-white transition-colors duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue ${
        padat ? "min-h-12 px-4 py-3" : "min-h-[72px] p-4"
      } ${terpilih ? "border-brand-blue bg-brand-blue-soft/50 shadow-[inset_0_0_0_1px_var(--color-brand-blue)]" : "border-line hover:border-brand-blue/60"}`}
    >
      <input type={jenis} name={nama} value={pilihan.nilai} checked={terpilih} onChange={onUbah} className="sr-only" />
      {pilihan.ikon && (
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-lg transition-colors duration-150 ${
            terpilih ? "bg-brand-blue text-white" : "bg-canvas text-muted group-hover:text-brand-blue-strong"
          }`}
        >
          <Ikon nama={pilihan.ikon} />
        </span>
      )}
      <span className="min-w-0 flex-1 self-center">
        <span className="block text-[15px] leading-snug font-semibold text-ink">{pilihan.nama}</span>
        {pilihan.ket && <span className="mt-0.5 block text-sm leading-snug text-muted">{pilihan.ket}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-6 shrink-0 place-items-center self-center border text-xs font-bold ${jenis === "radio" || urutan ? "rounded-full" : "rounded-md"} ${
          terpilih ? "border-brand-blue bg-brand-blue text-white" : "border-line bg-white text-transparent"
        }`}
      >
        {terpilih && (urutan ? <span className="temukan-centang angka">{urutan}</span> : <Check className="temukan-centang size-3.5" strokeWidth={3} />)}
      </span>
    </label>
  );
}

/** Pertanyaan pilihan: satu, banyak, atau berperingkat. */
export function PilihGrup({
  p,
  nilai,
  onUbah,
}: {
  p: Extract<Pertanyaan, { jenis: "pilih" }>;
  nilai: string[];
  onUbah: (nilai: string[]) => void;
}) {
  const tunggal = p.maks === 1;
  const penuh = !tunggal && nilai.length >= p.maks;

  function pilih(o: Pilihan) {
    if (tunggal) return onUbah([o.nilai]);
    if (nilai.includes(o.nilai)) return onUbah(nilai.filter((x) => x !== o.nilai));
    if (o.eksklusif) return onUbah([o.nilai]);
    const tanpaEksklusif = nilai.filter((x) => !p.pilihan.find((y) => y.nilai === x)?.eksklusif);
    if (tanpaEksklusif.length >= p.maks) return; // pesan batas sudah tampil di bawah
    onUbah([...tanpaEksklusif, o.nilai]);
  }

  function geser(i: number, arah: -1 | 1) {
    const j = i + arah;
    if (j < 0 || j >= nilai.length) return;
    const baru = [...nilai];
    [baru[i], baru[j]] = [baru[j], baru[i]];
    onUbah(baru);
  }

  return (
    <div>
      <div className={p.tata === "daftar" ? "grid gap-2.5" : "grid gap-3 sm:grid-cols-2"}>
        {p.pilihan.map((o) => (
          <KartuPilihan
            key={o.nilai}
            pilihan={o}
            nama={p.id}
            jenis={tunggal ? "radio" : "checkbox"}
            terpilih={nilai.includes(o.nilai)}
            urutan={p.urut && nilai.includes(o.nilai) ? nilai.indexOf(o.nilai) + 1 : undefined}
            padat={p.tata === "daftar"}
            onUbah={() => pilih(o)}
          />
        ))}
      </div>
      {!tunggal && (
        <p aria-live="polite" className="mt-3 text-sm text-muted">
          {penuh ? `Sudah ${p.maks} pilihan. Lepas satu dulu bila ingin menggantinya.` : p.maks < p.pilihan.length ? `${nilai.length} dari ${p.maks} dipilih.` : ""}
        </p>
      )}
      {p.urut && nilai.length > 1 && (
        <div className="mt-5 rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-bold text-ink">Urutan Anda</h2>
          <ol className="mt-2 divide-y divide-line">
            {nilai.map((v, i) => {
              const nama = p.pilihan.find((o) => o.nilai === v)?.nama ?? v;
              return (
                <li key={v} className="flex items-center gap-3 py-1.5">
                  <span className="angka grid size-6 shrink-0 place-items-center rounded-full bg-brand-blue text-xs font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1 text-[15px] text-ink">{nama}</span>
                  <button
                    type="button"
                    onClick={() => geser(i, -1)}
                    aria-disabled={i === 0}
                    aria-label={`Naikkan ${nama}`}
                    className={`grid size-11 place-items-center rounded-lg ${i === 0 ? "text-line" : "text-muted hover:bg-canvas hover:text-ink"}`}
                  >
                    <ChevronUp aria-hidden="true" className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => geser(i, 1)}
                    aria-disabled={i === nilai.length - 1}
                    aria-label={`Turunkan ${nama}`}
                    className={`grid size-11 place-items-center rounded-lg ${i === nilai.length - 1 ? "text-line" : "text-muted hover:bg-canvas hover:text-ink"}`}
                  >
                    <ChevronDown aria-hidden="true" className="size-5" />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
