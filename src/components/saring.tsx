"use client";

import { useRef } from "react";
import type { Wilayah } from "@/lib/data-tahap1";

export const kolomSaring =
  "min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-subtle focus:border-brand-blue";

/**
 * Dua pilihan bertingkat: provinsi lalu kota. Dipakai di dalam <Form>;
 * setiap perubahan langsung mengirim form, jadi tidak perlu tombol terpisah.
 * Daftar kota mengikuti provinsi yang sedang aktif di alamat halaman.
 */
export function PilihWilayah({ wilayah, provinsi, kota }: { wilayah: Wilayah; provinsi?: string; kota?: string }) {
  const kotaRef = useRef<HTMLSelectElement>(null);
  const daftarKota = wilayah.find((w) => w.provinsi === provinsi)?.kota ?? [];

  return (
    <>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
        Provinsi
        <select
          name="provinsi"
          defaultValue={provinsi ?? ""}
          key={`p-${provinsi ?? ""}`}
          className={kolomSaring}
          onChange={(e) => {
            // Kota lama tidak berlaku lagi di provinsi baru.
            if (kotaRef.current) kotaRef.current.value = "";
            e.currentTarget.form?.requestSubmit();
          }}
        >
          <option value="">Semua provinsi</option>
          {wilayah.map((w) => (
            <option key={w.provinsi} value={w.provinsi}>
              {w.provinsi}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
        Kota / kabupaten
        <select
          ref={kotaRef}
          name="kota"
          defaultValue={kota ?? ""}
          key={`k-${provinsi ?? ""}-${kota ?? ""}`}
          disabled={daftarKota.length === 0}
          className={`${kolomSaring} disabled:bg-canvas disabled:text-subtle`}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="">{provinsi ? "Semua kota" : "Pilih provinsi dulu"}</option>
          {daftarKota.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Pilihan tunggal yang langsung mengirim form saat diubah. */
export function PilihLangsung({
  name,
  label,
  nilai,
  kosong,
  pilihan,
}: {
  name: string;
  label: string;
  nilai?: string;
  kosong: string;
  /** Teks saja, atau pasangan nilai dan label bila yang dikirim berbeda dari yang tampil. */
  pilihan: (string | { nilai: string; label: string })[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
      {label}
      <select
        name={name}
        defaultValue={nilai ?? ""}
        key={nilai ?? ""}
        className={kolomSaring}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">{kosong}</option>
        {pilihan.map((p) => {
          const { nilai: v, label: teks } = typeof p === "string" ? { nilai: p, label: p } : p;
          return (
            <option key={v} value={v}>
              {teks}
            </option>
          );
        })}
      </select>
    </label>
  );
}

/** Kotak centang yang langsung mengirim form saat diubah. */
export function CentangLangsung({ name, label, aktif }: { name: string; label: string; aktif: boolean }) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-ink">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={aktif}
        key={String(aktif)}
        className="size-4 accent-brand-blue"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
      {label}
    </label>
  );
}
