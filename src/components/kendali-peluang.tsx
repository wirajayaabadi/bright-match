"use client";

import { useActionState, useState } from "react";
import { setCatatan, type StatusAksi, ubahTahap } from "@/app/aksi";
import { HASIL, TAHAP, tahapBerakhir } from "@/lib/istilah";

/**
 * Jalur 12 tahap, syarat masuk tahap berikutnya, dan tombol perpindahan. Aturannya dijaga di basis data
 * (peluang_ubah_tahap): maju satu tahap bila syaratnya terpenuhi, mundur satu tahap dengan alasan,
 * hasil akhir dengan alasan, dan buka kembali ke tahap sebelum berakhir.
 */
export function KendaliTahap({
  id,
  tahap,
  sebelumBerakhir,
  syaratBerikut,
  bolehUbah = true,
}: {
  id: string;
  tahap: string;
  /** Tahap sebelum peluang berakhir, untuk tombol buka kembali. */
  sebelumBerakhir?: string | null;
  /** Syarat masuk tahap berikutnya, dihitung basis data. */
  syaratBerikut: { butir: string; terpenuhi: boolean; pesan: string | null }[];
  bolehUbah?: boolean;
}) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(ubahTahap, null);
  const [alasan, setAlasan] = useState("");
  const berakhir = tahapBerakhir(tahap);
  const acuan = berakhir ? (sebelumBerakhir ?? "baru") : tahap;
  const posisi = Math.max(0, TAHAP.findIndex((t) => t.nilai === acuan));
  const berikut = !berakhir && posisi < TAHAP.length - 1 ? TAHAP[posisi + 1] : null;
  const sebelum = !berakhir && posisi > 0 ? TAHAP[posisi - 1] : null;
  const kurang = syaratBerikut.filter((x) => !x.terpenuhi);
  const tombol = "inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold disabled:opacity-60";

  return (
    <form action={kirim}>
      <input type="hidden" name="id" value={id} />
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {TAHAP.map((t, i) => {
          const kini = !berakhir && t.nilai === tahap;
          const lewat = i < posisi || (berakhir && i === posisi);
          return (
            <li
              key={t.nilai}
              aria-current={kini ? "step" : undefined}
              title={`${t.arti} Yang bergerak: ${t.pihak}.`}
              className={`flex flex-col rounded-lg border px-3 py-2 text-sm ${
                kini
                  ? "border-brand-blue bg-brand-blue-soft font-semibold text-brand-blue-strong"
                  : lewat
                    ? "border-line bg-brand-green-soft text-brand-green-strong"
                    : "border-line bg-white text-muted"
              }`}
            >
              <span className="angka text-[11px] font-semibold opacity-70">
                {i + 1}
                {kini ? " · sekarang" : lewat ? " · dilewati" : ""}
              </span>
              {t.nama}
            </li>
          );
        })}
      </ol>

      {berakhir && (
        <p className="mt-3 text-sm font-semibold text-brand-red-strong">
          Peluang ini berakhir: {HASIL.find((h) => h.nilai === tahap)?.nama ?? tahap}, pada tahap {TAHAP[posisi].nama}.
        </p>
      )}

      {berikut && (
        <div className="mt-4 rounded-xl border border-line bg-white px-4 py-3.5 text-sm shadow-card">
          <p className="font-bold text-ink">Untuk masuk tahap {berikut.nama}</p>
          <p className="mt-0.5 text-muted">{berikut.arti}</p>
          {syaratBerikut.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {syaratBerikut.map((x) => (
                <li key={x.butir} className="flex gap-2 leading-relaxed">
                  <span className={`shrink-0 font-semibold ${x.terpenuhi ? "text-brand-green-strong" : "text-brand-red-strong"}`}>
                    {x.terpenuhi ? "Terpenuhi:" : "Belum:"}
                  </span>
                  <span className="text-ink">
                    {x.butir}
                    {!x.terpenuhi && x.pesan && <span className="block text-muted">{x.pesan}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted">
              {berikut.nilai === "berminat"
                ? "Tulis di kolom alasan siapa yang menyatakan minat dan lewat apa."
                : "Tidak ada syarat khusus. Pindahkan saat tahap ini benar-benar tercapai."}
            </p>
          )}
        </div>
      )}

      {bolehUbah ? (
        <>
          <label className="mt-4 block max-w-xl text-sm font-semibold text-ink">
            Alasan atau catatan perpindahan
            <span className="font-normal text-muted"> (wajib untuk mundur, mengakhiri, membuka kembali, dan konfirmasi minat)</span>
            <input
              type="text"
              name="catatan"
              maxLength={500}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              className="mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-white px-3.5 text-sm font-normal text-ink focus:border-brand-blue"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {berikut && (
              <button type="submit" name="tahap" value={berikut.nilai} disabled={menunggu} className={`${tombol} bg-brand-blue text-white hover:bg-brand-blue-strong`}>
                Lanjut ke {berikut.nama}
                {kurang.length > 0 && <span className="ml-1.5 font-normal opacity-80">({kurang.length} syarat belum)</span>}
              </button>
            )}
            {sebelum && (
              <button type="submit" name="tahap" value={sebelum.nilai} disabled={menunggu} className={`${tombol} border border-line bg-white text-ink hover:border-subtle`}>
                Mundur ke {sebelum.nama}
              </button>
            )}
            {berakhir && (
              <button type="submit" name="tahap" value={acuan} disabled={menunggu} className={`${tombol} bg-brand-blue text-white hover:bg-brand-blue-strong`}>
                Buka kembali di tahap {TAHAP[posisi].nama}
              </button>
            )}
          </div>
          {!berakhir && (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                Akhiri peluang sebagai
                <select name="hasil" defaultValue="" className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink">
                  <option value="">Pilih hasil akhir</option>
                  {HASIL.map((h) => (
                    <option key={h.nilai} value={h.nilai}>
                      {h.nama}: {h.arti.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                name="tahap"
                value="hasil"
                disabled={menunggu}
                className={`${tombol} border border-line bg-white text-brand-red-strong hover:border-brand-red`}
              >
                Akhiri peluang
              </button>
            </div>
          )}
          {status && (
            <p
              role={status.ok ? "status" : "alert"}
              className={`mt-3 inline-block rounded-md px-2.5 py-1.5 text-sm font-medium ${status.ok ? "bg-brand-green-soft text-brand-green-strong" : "bg-brand-red-soft text-brand-red-strong"}`}
            >
              {status.pesan}
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-subtle">Peran Anda hanya membaca. Tahap dipindahkan analis atau admin NFR.</p>
      )}
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
