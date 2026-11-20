"use client";

import { useId } from "react";
import { KartuPilihan } from "@/components/temukan/kartu-pilihan";
import { rpRingkas } from "@/lib/temukan/ringkas";
import type { JawabAnggaran, Pertanyaan, RentangAnggaran } from "@/lib/temukan/tipe";

const AWAL: JawabAnggaran = { pilihan: "", min: null, maks: null, fleksibel: false, satuan: "tahun" };
const titik = new Intl.NumberFormat("id-ID");
const kolom = "mt-1.5 block min-h-12 w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-subtle focus:border-brand-blue";

function namaRentang(r: RentangAnggaran, bagi: number) {
  const min = r.min != null ? rpRingkas(r.min / bagi) : null;
  const maks = r.maks != null ? rpRingkas(r.maks / bagi) : null;
  return min && maks ? `${min} – ${maks}` : maks ? `Sampai ${maks}` : `Di atas ${min}`;
}

/**
 * Anggaran sewa. Pengguna boleh berpikir per bulan atau per tahun; yang disimpan selalu rupiah per tahun,
 * supaya bisa dibandingkan dengan tarif Brightspace.
 */
export default function IsianAnggaran({
  p,
  nilai,
  galat,
  onUbah,
  onSentuh,
}: {
  p: Extract<Pertanyaan, { jenis: "anggaran" }>;
  nilai: JawabAnggaran | undefined;
  galat: Record<string, string>;
  onUbah: (nilai: JawabAnggaran) => void;
  onSentuh: (kolom: string) => void;
}) {
  const v = nilai ?? AWAL;
  const id = useId();
  const bagi = v.satuan === "bulan" ? 12 : 1;
  const per = v.satuan === "bulan" ? "per bulan" : "per tahun";
  const tampil = (x: number | null) => (x == null ? "" : titik.format(Math.round(x / bagi)));
  const baca = (teks: string) => {
    const angka = teks.replace(/\D/g, "").slice(0, 13);
    return angka === "" ? null : Number(angka) * bagi;
  };

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Satuan anggaran" className="inline-flex rounded-lg border border-line bg-white p-1 text-sm">
        {(["tahun", "bulan"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onUbah({ ...v, satuan: s })}
            aria-pressed={v.satuan === s}
            className={`min-h-10 rounded-md px-4 font-semibold transition-colors duration-150 ${v.satuan === s ? "bg-brand-blue text-white" : "text-muted hover:text-ink"}`}
          >
            {s === "tahun" ? "Per tahun" : "Per bulan"}
          </button>
        ))}
      </div>

      <div className="grid gap-2.5">
        {p.rentang.map((r) => (
          <KartuPilihan
            key={r.nilai}
            pilihan={{ nilai: r.nilai, nama: `${namaRentang(r, bagi)} ${per}`, ket: bagi === 12 ? `Setara ${namaRentang(r, 1).replace(/^[SD]/, (h) => h.toLowerCase())} per tahun` : undefined }}
            nama={p.id}
            jenis="radio"
            padat
            terpilih={v.pilihan === r.nilai}
            onUbah={() => onUbah({ ...v, pilihan: r.nilai, min: r.min, maks: r.maks })}
          />
        ))}
        <KartuPilihan
          pilihan={{ nilai: "sendiri", nama: "Isi angka sendiri" }}
          nama={p.id}
          jenis="radio"
          padat
          terpilih={v.pilihan === "sendiri"}
          onUbah={() => onUbah({ ...v, pilihan: "sendiri", min: null, maks: null })}
        />
        <KartuPilihan
          pilihan={{ nilai: "belum", nama: "Belum menentukan anggaran", ket: "Lokasi tidak disaring menurut tarif sewa." }}
          nama={p.id}
          jenis="radio"
          padat
          terpilih={v.pilihan === "belum"}
          onUbah={() => onUbah({ ...v, pilihan: "belum", min: null, maks: null, fleksibel: true })}
        />
      </div>

      {v.pilihan === "sendiri" && (
        <div className="temukan-masuk grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-maks`} className="block text-sm font-semibold text-ink">
              Anggaran tertinggi <span className="font-normal text-subtle">(Rp {per})</span>
            </label>
            <input
              id={`${id}-maks`}
              data-kolom="maks"
              inputMode="numeric"
              autoComplete="off"
              value={tampil(v.maks)}
              onChange={(e) => onUbah({ ...v, maks: baca(e.target.value) })}
              onBlur={() => onSentuh("maks")}
              aria-invalid={galat.maks ? true : undefined}
              aria-describedby={galat.maks ? `${id}-maks-galat` : undefined}
              className={`${kolom} angka ${galat.maks ? "border-brand-red" : "border-line"}`}
            />
            {galat.maks && (
              <p id={`${id}-maks-galat`} className="mt-1 text-sm text-brand-red-strong">
                {galat.maks}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${id}-min`} className="block text-sm font-semibold text-ink">
              Anggaran terendah <span className="font-normal text-subtle">(opsional)</span>
            </label>
            <input
              id={`${id}-min`}
              data-kolom="min"
              inputMode="numeric"
              autoComplete="off"
              value={tampil(v.min)}
              onChange={(e) => onUbah({ ...v, min: baca(e.target.value) })}
              onBlur={() => onSentuh("min")}
              aria-invalid={galat.min ? true : undefined}
              aria-describedby={galat.min ? `${id}-min-galat` : undefined}
              className={`${kolom} angka ${galat.min ? "border-brand-red" : "border-line"}`}
            />
            {galat.min && (
              <p id={`${id}-min-galat`} className="mt-1 text-sm text-brand-red-strong">
                {galat.min}
              </p>
            )}
          </div>
        </div>
      )}

      {v.pilihan !== "" && v.pilihan !== "belum" && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[15px] text-ink">
          <input type="checkbox" checked={v.fleksibel} onChange={(e) => onUbah({ ...v, fleksibel: e.target.checked })} className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand-blue)]" />
          <span>
            Anggaran saya masih fleksibel
            <span className="block text-sm text-muted">Lokasi sedikit di atas anggaran tetap ditampilkan, dengan tanda yang jelas.</span>
          </span>
        </label>
      )}
    </div>
  );
}
