"use client";

import Form from "next/form";
import { useState } from "react";

export type PilihanBanding = { id: string; judul: string; rinci: string; berakhir: boolean };

const MAKS = 3;

/** Memilih dua atau tiga penawaran untuk dibandingkan. Pilihan dikirim lewat alamat, jadi bisa dibagikan. */
export default function PilihBanding({ pilihan, terpilih }: { pilihan: PilihanBanding[]; terpilih: string[] }) {
  const [pilih, setPilih] = useState<string[]>(terpilih);
  const [pesan, setPesan] = useState("");
  const penuh = pilih.length >= MAKS;

  return (
    <Form
      action="/ruang-kerja/banding"
      onSubmit={(e) => {
        if (pilih.length < 2) {
          e.preventDefault();
          setPesan("Pilih paling sedikit dua lokasi untuk dibandingkan.");
        }
      }}
    >
      <fieldset>
        <legend className="text-sm font-semibold text-ink">
          Lokasi yang dibandingkan <span className="font-normal text-muted">(pilih dua atau tiga)</span>
        </legend>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {pilihan.map((p) => {
            const aktif = pilih.includes(p.id);
            return (
              <li key={p.id}>
                <label
                  className={`flex min-h-11 items-start gap-3 rounded-lg border bg-white px-3.5 py-2.5 text-sm ${aktif ? "border-brand-blue" : "border-line"} ${
                    !aktif && penuh ? "opacity-60" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    name="id"
                    value={p.id}
                    checked={aktif}
                    disabled={!aktif && penuh}
                    onChange={(e) => {
                      setPesan("");
                      setPilih((x) => (e.target.checked ? [...x, p.id] : x.filter((i) => i !== p.id)));
                    }}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{p.judul}</span>
                    <span className="block text-muted">
                      {p.rinci}
                      {p.berakhir ? " · sudah berakhir" : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      {penuh && pilihan.length > MAKS && <p className="mt-2 text-xs text-subtle">Paling banyak tiga lokasi sekaligus. Lepas satu centang untuk memilih yang lain.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong">
          Bandingkan lokasi terpilih
        </button>
        {pesan && (
          <p role="alert" className="text-sm font-medium text-brand-red-strong">
            {pesan}
          </p>
        )}
      </div>
    </Form>
  );
}
