"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { kolomAktif } from "@/lib/temukan/cabang";
import type { JawabIsian, Jawaban, Kolom, Pertanyaan } from "@/lib/temukan/tipe";

const kotak = "block min-h-12 w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-subtle focus:border-brand-blue";

/** Label kecil yang membedakan syarat wajib dari preferensi. */
const Sifat = ({ kolom }: { kolom: Kolom }) => (
  <span className="font-normal text-subtle"> · {kolom.sifat === "syarat" ? "syarat wajib" : "preferensi"}</span>
);

function SatuKolom({
  c,
  nilai,
  galat,
  onUbah,
  onSentuh,
}: {
  c: Kolom;
  nilai: string | number | string[] | undefined;
  galat?: string;
  onUbah: (v: string | number | string[] | undefined) => void;
  onSentuh: () => void;
}) {
  const id = useId();
  const jelas = [c.bantu && !galat ? `${id}-bantu` : null, galat ? `${id}-galat` : null].filter(Boolean).join(" ") || undefined;
  const bawah = galat ? (
    <p id={`${id}-galat`} className="mt-1 text-sm text-brand-red-strong">
      {galat}
    </p>
  ) : c.bantu ? (
    <p id={`${id}-bantu`} className="mt-1 text-xs leading-relaxed text-subtle">
      {c.bantu}
    </p>
  ) : null;

  if (c.jenis === "angka" || c.jenis === "teks") {
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-semibold text-ink">
          {c.nama}
          <Sifat kolom={c} />
        </label>
        <div className="relative mt-1.5">
          <input
            id={id}
            data-kolom={c.id}
            type="text"
            inputMode={c.jenis === "angka" ? "decimal" : undefined}
            maxLength={c.jenis === "teks" ? c.maks : 12}
            autoComplete="off"
            value={nilai == null ? "" : String(nilai)}
            onChange={(e) => onUbah(e.target.value === "" ? undefined : e.target.value)}
            onBlur={onSentuh}
            aria-invalid={galat ? true : undefined}
            aria-describedby={jelas}
            className={`${kotak} ${c.jenis === "angka" ? "angka pr-16" : ""} ${galat ? "border-brand-red" : "border-line"}`}
          />
          {c.jenis === "angka" && (
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-subtle">
              {c.satuan}
            </span>
          )}
        </div>
        {bawah}
      </div>
    );
  }

  const banyak = c.jenis === "centang";
  const terpilih = banyak ? (Array.isArray(nilai) ? nilai : []) : typeof nilai === "string" ? [nilai] : [];
  return (
    <fieldset aria-describedby={jelas}>
      <legend className="text-sm font-semibold text-ink">
        {c.nama}
        <Sifat kolom={c} />
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {c.pilihan.map((o) => {
          const aktif = terpilih.includes(o.nilai);
          return (
            <label
              key={o.nilai}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3.5 text-sm font-semibold transition-colors duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue ${
                aktif ? "border-brand-blue bg-brand-blue-soft/60 text-brand-blue-strong shadow-[inset_0_0_0_1px_var(--color-brand-blue)]" : "border-line bg-white text-muted hover:border-brand-blue/60 hover:text-ink"
              }`}
            >
              <input
                type={banyak ? "checkbox" : "radio"}
                name={id}
                value={o.nilai}
                checked={aktif}
                // Radio yang sudah terpilih bisa dilepas lagi dengan diklik: semua kolom di sini boleh kosong.
                onClick={() => {
                  if (!banyak && aktif) onUbah(undefined);
                }}
                onChange={() => {
                  if (banyak) {
                    const baru = aktif ? terpilih.filter((x) => x !== o.nilai) : [...terpilih, o.nilai];
                    onUbah(baru.length > 0 ? baru : undefined);
                  } else onUbah(o.nilai);
                }}
                className="sr-only"
              />
              {o.nama}
            </label>
          );
        })}
      </div>
      {bawah}
    </fieldset>
  );
}

/** Kelompok isian dengan pengungkapan bertahap: kolom teknis baru tampil bila relevan atau diminta. */
export default function IsianKolom({
  p,
  nilai,
  jawaban,
  galat,
  onUbah,
  onSentuh,
}: {
  p: Extract<Pertanyaan, { jenis: "isian" }>;
  nilai: JawabIsian | undefined;
  jawaban: Jawaban;
  galat: Record<string, string>;
  onUbah: (nilai: JawabIsian) => void;
  onSentuh: (kolom: string) => void;
}) {
  const isi = nilai ?? {};
  const aktif = kolomAktif(p, jawaban, isi);
  const utama = aktif.filter((c) => !c.lanjutan);
  const lanjutan = aktif.filter((c) => c.lanjutan);
  // Terbuka sendiri bila kolom teknisnya sudah pernah diisi atau ada yang perlu diperbaiki.
  const [buka, setBuka] = useState(() => lanjutan.some((c) => isi[c.id] !== undefined));
  const tampilLanjutan = buka || lanjutan.some((c) => galat[c.id]);
  const idLanjutan = useId();

  const ubah = (c: Kolom) => (v: string | number | string[] | undefined) => {
    const baru = { ...isi };
    if (v === undefined) delete baru[c.id];
    else baru[c.id] = v;
    onUbah(baru);
  };
  const adaSyarat = aktif.some((c) => c.sifat === "syarat") && aktif.some((c) => c.sifat === "preferensi");
  const baris = (daftar: Kolom[]) =>
    daftar.map((c) => (
      <div key={c.id} className={c.jenis === "angka" ? "" : "sm:col-span-2"}>
        <SatuKolom c={c} nilai={isi[c.id]} galat={galat[c.id]} onUbah={ubah(c)} onSentuh={() => onSentuh(c.id)} />
      </div>
    ));

  return (
    <div>
      {adaSyarat && (
        <p className="mb-5 text-sm leading-relaxed text-muted">
          Syarat wajib menyaring lokasi: yang tidak memenuhinya tidak akan disarankan. Preferensi hanya memengaruhi urutan.
        </p>
      )}
      <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">{baris(utama)}</div>
      {lanjutan.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setBuka(!tampilLanjutan)}
            aria-expanded={tampilLanjutan}
            aria-controls={idLanjutan}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] font-semibold text-brand-blue-strong hover:underline"
          >
            <ChevronDown aria-hidden="true" className={`size-4.5 transition-transform duration-150 ${tampilLanjutan ? "rotate-180" : ""}`} />
            {tampilLanjutan ? "Sembunyikan detail tambahan" : "Tambah detail (opsional)"}
          </button>
          {tampilLanjutan && (
            <div id={idLanjutan} className="temukan-masuk mt-4 grid gap-x-5 gap-y-6 sm:grid-cols-2">
              {baris(lanjutan)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
