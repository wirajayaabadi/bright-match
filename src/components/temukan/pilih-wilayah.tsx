"use client";

import { MapPin, Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { namaWilayah } from "@/lib/temukan/ringkas";
import type { JawabWilayah, Wilayah } from "@/lib/temukan/tipe";

const KOSONG: JawabWilayah = { terbuka: false, lain: false, daftar: [] };
const sama = (a: Wilayah, b: Wilayah) => a.provinsi === b.provinsi && a.kota === b.kota;

/**
 * Pemilih wilayah (LocationSelector). Pilihannya datang dari basis data: provinsi dan kota yang
 * saat ini punya ruang usaha kosong. Kotak carinya mengikuti pola combobox, jadi bisa dipakai
 * dengan papan ketik saja.
 */
export default function PilihWilayah({
  nilai,
  pilihan,
  maks,
  onUbah,
}: {
  nilai: JawabWilayah | undefined;
  pilihan: Wilayah[];
  maks: number;
  onUbah: (nilai: JawabWilayah) => void;
}) {
  const v = nilai ?? KOSONG;
  const id = useId();
  const kotak = useRef<HTMLInputElement>(null);
  const [cari, setCari] = useState("");
  const [buka, setBuka] = useState(false);
  const [sorot, setSorot] = useState(0);

  const semua = useMemo<Wilayah[]>(() => {
    const provinsi = [...new Set(pilihan.map((w) => w.provinsi))].map((p) => ({ provinsi: p, kota: null }));
    return [...provinsi, ...pilihan];
  }, [pilihan]);

  const hasil = useMemo(() => {
    const k = cari.trim().toLowerCase();
    const belum = semua.filter((w) => !v.daftar.some((x) => sama(x, w)));
    if (k === "") return belum.filter((w) => w.kota === null);
    return belum.filter((w) => (w.kota ?? w.provinsi).toLowerCase().includes(k) || (w.kota !== null && w.provinsi.toLowerCase().includes(k))).slice(0, 40);
  }, [cari, semua, v.daftar]);

  const penuh = v.daftar.length >= maks;

  function tambah(w: Wilayah) {
    if (penuh) return;
    // Memilih seluruh provinsi menggantikan kota-kota di dalamnya; memilih kota menggantikan "seluruh provinsi".
    const sisa = v.daftar.filter((x) => x.provinsi !== w.provinsi || (w.kota !== null && x.kota !== null));
    onUbah({ ...v, terbuka: false, daftar: [...sisa, w] });
    setCari("");
    setSorot(0);
    kotak.current?.focus();
  }

  function tombol(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setBuka(true);
      setSorot((s) => Math.min(s + 1, hasil.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSorot((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      // Enter di kotak cari memilih wilayah, bukan mengirim langkah.
      e.preventDefault();
      if (buka && hasil[sorot]) tambah(hasil[sorot]);
    } else if (e.key === "Escape") {
      setBuka(false);
    }
  }

  return (
    <div className="space-y-5">
      <label
        className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3 transition-colors duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue ${
          v.terbuka ? "border-brand-blue bg-brand-blue-soft/50 shadow-[inset_0_0_0_1px_var(--color-brand-blue)]" : "border-line hover:border-brand-blue/60"
        }`}
      >
        <input
          type="checkbox"
          checked={v.terbuka}
          onChange={(e) => onUbah({ ...v, terbuka: e.target.checked, lain: e.target.checked ? false : v.lain })}
          className="size-5 shrink-0 accent-[var(--color-brand-blue)]"
        />
        <span>
          <span className="block text-[15px] font-semibold text-ink">Terbuka di berbagai wilayah</span>
          <span className="block text-sm text-muted">Tampilkan lokasi dari seluruh Indonesia.</span>
        </span>
      </label>

      {!v.terbuka && (
        <div>
          <label htmlFor={`${id}-cari`} className="block text-sm font-semibold text-ink">
            Cari provinsi atau kota
          </label>
          <div className="relative mt-1.5">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-subtle" />
              <input
              ref={kotak}
              id={`${id}-cari`}
              type="text"
              role="combobox"
              aria-expanded={buka}
              aria-controls={`${id}-daftar`}
              aria-autocomplete="list"
              aria-activedescendant={buka && hasil[sorot] ? `${id}-o${sorot}` : undefined}
              autoComplete="off"
              value={cari}
              onChange={(e) => {
                setCari(e.target.value);
                setBuka(true);
                setSorot(0);
              }}
              onFocus={() => setBuka(true)}
              onBlur={() => setBuka(false)}
              onKeyDown={tombol}
              className="block min-h-12 w-full rounded-lg border border-line bg-white py-2.5 pr-3.5 pl-10 text-[15px] text-ink placeholder:text-subtle focus:border-brand-blue"
              />
            </div>
            {buka && (
              <ul
                id={`${id}-daftar`}
                role="listbox"
                aria-label="Wilayah yang punya ruang usaha kosong"
                className="mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-card sm:absolute sm:top-full sm:z-10"
              >
                {hasil.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted">
                    {pilihan.length === 0
                      ? "Daftar wilayah belum bisa dimuat. Tandai terbuka di berbagai wilayah, atau coba lagi nanti."
                      : `Belum ada ruang usaha kosong di wilayah yang cocok dengan “${cari.trim()}”. Coba nama kota atau provinsi lain.`}
                  </li>
                )}
                {hasil.map((w, i) => (
                  <li
                    key={`${w.provinsi}|${w.kota ?? ""}`}
                    id={`${id}-o${i}`}
                    role="option"
                    aria-selected={i === sorot}
                    // mousedown, bukan click: kotak cari tidak boleh kehilangan fokus dulu
                    onMouseDown={(e) => {
                      e.preventDefault();
                      tambah(w);
                    }}
                    onMouseEnter={() => setSorot(i)}
                    className={`flex min-h-11 cursor-pointer items-center gap-2.5 px-4 py-2 text-[15px] ${i === sorot ? "bg-brand-blue-soft text-brand-blue-strong" : "text-ink"}`}
                  >
                    <MapPin aria-hidden="true" className="size-4 shrink-0 text-subtle" />
                    {namaWilayah(w)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-subtle">
            {penuh ? `Sudah ${maks} wilayah. Hapus satu dulu bila ingin menambah.` : "Ketik nama kota, atau pilih satu provinsi untuk seluruh kotanya."}
          </p>

          {v.daftar.length > 0 && (
            <ul aria-label="Wilayah yang dipilih" className="mt-4 flex flex-wrap gap-2">
              {v.daftar.map((w) => (
                <li key={`${w.provinsi}|${w.kota ?? ""}`} className="inline-flex items-center rounded-lg border border-brand-blue/40 bg-brand-blue-soft/60 text-sm font-semibold text-brand-blue-strong">
                  <span className="py-2 pl-3">{namaWilayah(w)}</span>
                  <button
                    type="button"
                    onClick={() => onUbah({ ...v, daftar: v.daftar.filter((x) => !sama(x, w)) })}
                    aria-label={`Hapus ${namaWilayah(w)}`}
                    className="grid size-11 place-items-center rounded-lg hover:text-ink"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
            <input type="checkbox" checked={v.lain} onChange={(e) => onUbah({ ...v, lain: e.target.checked })} className="size-5 shrink-0 accent-[var(--color-brand-blue)]" />
            Sarankan juga wilayah lain bila pilihan saya tidak tersedia
          </label>
        </div>
      )}
    </div>
  );
}
