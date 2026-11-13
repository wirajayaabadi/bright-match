"use client";

import { useActionState, useState } from "react";
import { setCatatan, type StatusAksi, ubahTahap } from "@/app/aksi";
import { TAHAP } from "@/lib/istilah";

/** Jalur tahap peluang: tahap yang sudah lewat, tahap sekarang, dan tombol untuk berpindah. */
export function KendaliTahap({ id, tahap }: { id: string; tahap: string }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(ubahTahap, null);
  const posisi = TAHAP.findIndex((t) => t.nilai === tahap);

  return (
    <form action={kirim}>
      <input type="hidden" name="id" value={id} />
      <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {TAHAP.map((t, i) => {
          const kini = t.nilai === tahap;
          const lewat = posisi >= 0 && i < posisi;
          return (
            <li key={t.nilai}>
              <button
                type="submit"
                name="tahap"
                value={t.nilai}
                disabled={menunggu || kini}
                aria-current={kini ? "step" : undefined}
                title={t.arti}
                className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${
                  kini
                    ? "border-brand-blue bg-brand-blue-soft font-semibold text-brand-blue-strong"
                    : lewat
                      ? "border-line bg-brand-green-soft text-brand-green-strong hover:border-brand-green-strong"
                      : "border-line bg-white text-muted hover:border-subtle hover:text-ink"
                }`}
              >
                <span className="angka text-[11px] font-semibold opacity-70">Tahap {i + 1}</span>
                {t.nama}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name="tahap"
          value="batal"
          disabled={menunggu || tahap === "batal"}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted hover:border-brand-red hover:text-brand-red-strong disabled:opacity-50"
        >
          {tahap === "batal" ? "Peluang dibatalkan" : "Batalkan peluang"}
        </button>
        {status && (
          <p
            role="status"
            className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${status.ok ? "bg-brand-green-soft text-brand-green-strong" : "bg-brand-red-soft text-brand-red-strong"}`}
          >
            {status.pesan}
          </p>
        )}
      </div>
    </form>
  );
}

/** Catatan bebas pada satu peluang. */
export function CatatanPeluang({ id, catatan }: { id: string; catatan: string | null }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(setCatatan, null);
  // Terkendali: React mengosongkan kolom tak terkendali setelah aksi formulir selesai.
  const [isi, setIsi] = useState(catatan ?? "");

  return (
    <form action={kirim} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm font-semibold text-ink">
        Catatan
        <textarea
          name="catatan"
          rows={4}
          maxLength={2000}
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
          placeholder="Hasil kontak, kesepakatan sementara, hal yang perlu ditindaklanjuti."
          className="mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm font-normal text-ink placeholder:text-subtle focus:border-brand-blue"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={menunggu}
          className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60"
        >
          {menunggu ? "Menyimpan…" : "Simpan catatan"}
        </button>
        {status && (
          <span role="status" className={`text-sm ${status.ok ? "text-brand-green-strong" : "text-brand-red-strong"}`}>
            {status.pesan}
          </span>
        )}
      </div>
    </form>
  );
}
