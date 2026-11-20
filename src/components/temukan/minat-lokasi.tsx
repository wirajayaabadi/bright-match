"use client";

import { Bookmark, BookmarkCheck, CircleCheck } from "lucide-react";
import { useId, useState } from "react";
import { type HasilTindak, nyatakanMinat } from "@/app/aksi-temukan";
import { tanggal } from "@/lib/format";
import type { Potret } from "@/lib/temukan/tipe";

const kedua = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-brand-blue/60";

/** Pengunjung tanpa akun: menandai lokasi untuk diteruskan saat mendaftar. Bukan minat resmi. */
export function TandaiLokasi({ ditandai, penuh, kode, onUbah }: { ditandai: boolean; penuh: boolean; kode: string; onUbah: () => void }) {
  const Ikon = ditandai ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      onClick={onUbah}
      aria-pressed={ditandai}
      aria-disabled={penuh && !ditandai}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-[15px] font-semibold transition-colors duration-150 ${
        ditandai ? "border-brand-blue bg-brand-blue-soft text-brand-blue-strong" : penuh ? "border-line bg-white text-subtle" : "border-line bg-white text-ink hover:border-brand-blue/60"
      }`}
    >
      <Ikon aria-hidden="true" className="size-4.5" />
      {ditandai ? "Ditandai" : "Tandai untuk diminati"}
      <span className="sr-only">: ruang {kode}</span>
    </button>
  );
}

/**
 * Tenant berakun: menyatakan minat pada satu lokasi. Formulirnya satu kolom catatan, jadi dibuka di dalam kartu.
 * Minat tidak mengikat dan tidak membuat peluang; tim Non Fuel Retail yang menindaklanjutinya.
 */
export function NyatakanMinat({
  lahanId,
  kode,
  tercatat,
  potret,
  onTercatat,
}: {
  lahanId: string;
  kode: string;
  /** Tanggal minat yang sudah tercatat, bila ada. */
  tercatat: string | null;
  potret: () => Potret;
  onTercatat: () => void;
}) {
  const id = useId();
  const [buka, setBuka] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [menunggu, setMenunggu] = useState(false);
  const [hasil, setHasil] = useState<HasilTindak | null>(null);

  if (tercatat) {
    return (
      <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-muted">
        <CircleCheck aria-hidden="true" className="size-4.5 shrink-0 text-brand-green-strong" />
        Minat tercatat{tercatat === "baru" ? "" : ` ${tanggal(tercatat)}`}. Tidak mengikat; tim Non Fuel Retail akan menghubungi Anda.
      </p>
    );
  }

  async function kirim() {
    setMenunggu(true);
    setHasil(null);
    try {
      const h = await nyatakanMinat({ lahanId, catatan, potret: potret() });
      if (h.ok || h.kode === "sudah") onTercatat();
      else setHasil(h);
    } catch {
      setHasil({ ok: false, pesan: "Minat belum terkirim. Periksa sambungan Anda, lalu coba lagi." });
    } finally {
      setMenunggu(false);
    }
  }

  if (!buka) {
    return (
      <button
        type="button"
        onClick={() => setBuka(true)}
        aria-expanded={false}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brand-blue-strong"
      >
        Nyatakan minat
        <span className="sr-only"> pada ruang {kode}</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void kirim();
      }}
      className="temukan-masuk w-full rounded-lg border border-line bg-canvas p-4"
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
        Minat tidak mengikat dan belum menjadi penawaran. Tim Non Fuel Retail menghubungi organisasi Anda untuk langkah berikutnya.
      </p>
      {hasil && !hasil.ok && (
        <p role="alert" className="mt-3 rounded-lg bg-brand-red-soft px-3.5 py-2.5 text-sm font-medium text-brand-red-strong">
          {hasil.pesan}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2.5">
        <button type="submit" aria-busy={menunggu} className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-[15px] font-semibold text-white hover:bg-brand-blue-strong">
          {menunggu ? "Mengirim…" : `Kirim minat pada ruang ${kode}`}
        </button>
        <button type="button" onClick={() => setBuka(false)} className={kedua}>
          Batal
        </button>
      </div>
    </form>
  );
}
