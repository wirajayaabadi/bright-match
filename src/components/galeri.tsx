"use client";

/* Gambar sudah berupa WebP dua ukuran di object storage, jadi tidak perlu lewat pengoptimal next/image. */
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { type Gambar, gambarSiap, labelGambar, urlGambar } from "@/lib/gambar";
import { tanggal } from "@/lib/format";

type Props = {
  gambar: Gambar[];
  /** Menjelaskan isi foto untuk pembaca layar, mis. "SPBU 3415138" atau "lahan 3415138-IN-002". */
  subjek: string;
  /** "kisi": deretan thumbnail. "mini": satu thumbnail kecil dengan jumlah foto, untuk sel tabel. */
  tampilan?: "kisi" | "mini";
  /** Jumlah thumbnail paling banyak pada tampilan kisi; sisanya dibuka lewat petak terakhir. */
  maks?: number;
  /** true bila thumbnail harus langsung dimuat, mis. di kartu yang akan dicetak. */
  segera?: boolean;
  /** Kelas kisi, untuk mengatur jumlah kolom. */
  kisi?: string;
};

/**
 * Thumbnail foto yang membuka penampil layar penuh. Tidak merender apa pun bila tidak ada foto
 * atau alamat bucket (NEXT_PUBLIC_GAMBAR_URL) belum diisi.
 */
export default function Galeri({
  gambar,
  subjek,
  tampilan = "kisi",
  maks = 6,
  segera = false,
  kisi = "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6",
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [indeks, setIndeks] = useState(0);
  const [terbuka, setTerbuka] = useState(false);

  if (!gambarSiap || gambar.length === 0) return null;

  const total = gambar.length;
  const buka = (i: number) => {
    setIndeks(i);
    setTerbuka(true);
    dialog.current?.showModal();
  };
  const geser = (langkah: number) => setIndeks((i) => (i + langkah + total) % total);
  const kini = gambar[Math.min(indeks, total - 1)];
  const alt = (g: Gambar, i: number) => `Foto ${subjek}${labelGambar(g) ? `: ${labelGambar(g)}` : ""} (${i + 1} dari ${total})`;
  const tampil = gambar.slice(0, maks);
  const sisa = total - tampil.length;

  return (
    <>
      {tampilan === "mini" ? (
        <button
          type="button"
          onClick={() => buka(0)}
          aria-label={`Lihat ${total} foto ${subjek}`}
          className="group relative block h-12 w-16 overflow-hidden rounded-md border border-line bg-canvas"
        >
          <img
            src={urlGambar(gambar[0].kunci, true)}
            alt=""
            width={64}
            height={48}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-opacity group-hover:opacity-85"
          />
          {total > 1 && (
            <span className="angka absolute right-0.5 bottom-0.5 rounded bg-ink/75 px-1 text-[10px] leading-4 font-semibold text-white">
              {total}
            </span>
          )}
        </button>
      ) : (
        <ul className={`grid gap-2 ${kisi}`}>
          {tampil.map((g, i) => (
            <li key={`${g.kunci}-${i}`}>
              <button
                type="button"
                onClick={() => buka(i)}
                className="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-canvas"
              >
                <img
                  src={urlGambar(g.kunci, true)}
                  alt={alt(g, i)}
                  loading={segera ? "eager" : "lazy"}
                  decoding="async"
                  className="h-full w-full object-cover transition-opacity group-hover:opacity-85"
                />
                {i === tampil.length - 1 && sisa > 0 && (
                  <span className="tidak-cetak angka absolute inset-0 grid place-items-center bg-ink/60 text-sm font-bold text-white">
                    +{sisa} foto
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialog}
        aria-label={`Foto ${subjek}`}
        onClose={() => setTerbuka(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close(); // klik di luar foto menutup penampil
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") geser(1);
          if (e.key === "ArrowLeft") geser(-1);
        }}
        className="tidak-cetak m-auto max-h-[100dvh] w-full max-w-5xl bg-transparent p-3 text-left backdrop:bg-ink/80 sm:p-6"
      >
        {terbuka && (
          <figure className="overflow-hidden rounded-xl bg-white shadow-card">
            <div className="relative grid min-h-[40dvh] place-items-center bg-ink">
              <img
                key={kini.kunci}
                src={urlGambar(kini.kunci)}
                alt={alt(kini, indeks)}
                width={kini.lebar ?? undefined}
                height={kini.tinggi ?? undefined}
                className="max-h-[calc(100dvh-9rem)] w-auto max-w-full object-contain"
              />
              {total > 1 && (
                <>
                  <TombolGeser arah="kiri" onClick={() => geser(-1)} />
                  <TombolGeser arah="kanan" onClick={() => geser(1)} />
                </>
              )}
            </div>
            <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="min-w-0 text-ink">
                <span className="angka font-semibold">
                  {indeks + 1} dari {total}
                </span>
                {labelGambar(kini) && <span className="text-muted"> · {labelGambar(kini)}</span>}
                {kini.diunggah && <span className="text-subtle"> · diunggah {tanggal(kini.diunggah)}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-4">
                <a
                  href={urlGambar(kini.kunci)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-brand-blue-strong underline-offset-2 hover:underline"
                >
                  Buka ukuran penuh
                </a>
                <button
                  type="button"
                  autoFocus
                  onClick={() => dialog.current?.close()}
                  className="inline-flex min-h-9 items-center rounded-lg border border-line bg-white px-3 font-semibold text-ink hover:border-subtle"
                >
                  Tutup
                </button>
              </span>
            </figcaption>
          </figure>
        )}
      </dialog>
    </>
  );
}

function TombolGeser({ arah, onClick }: { arah: "kiri" | "kanan"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={arah === "kiri" ? "Foto sebelumnya" : "Foto berikutnya"}
      className={`absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-card hover:bg-white ${
        arah === "kiri" ? "left-3" : "right-3"
      }`}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={arah === "kiri" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"} />
      </svg>
    </button>
  );
}
