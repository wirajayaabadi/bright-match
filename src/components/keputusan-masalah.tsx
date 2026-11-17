"use client";

import { useActionState, useRef, useState } from "react";
import type { StatusAksi } from "@/app/aksi";
import { periksaUlangData, putuskanMasalah, tinjauMasalah } from "@/app/aksi-validasi";

const tombolUtama =
  "inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60";
const tombolKedua =
  "inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle disabled:opacity-60";

function Pesan({ status }: { status: StatusAksi }) {
  if (!status) return null;
  return (
    <p
      role="status"
      className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${
        status.ok ? "bg-brand-green-soft text-brand-green-strong" : "bg-brand-red-soft text-brand-red-strong"
      }`}
    >
      {status.pesan}
    </p>
  );
}

/** Mencari ulang temuan dari data yang sedang dimuat. Keputusan yang sudah ada tidak ditimpa. */
export function TombolPeriksaUlang() {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(periksaUlangData, null);
  return (
    <form action={kirim} className="flex flex-wrap items-center justify-end gap-3">
      <Pesan status={status} />
      <button type="submit" disabled={menunggu} className={tombolKedua}>
        {menunggu ? "Memeriksa data…" : "Periksa ulang data"}
      </button>
    </form>
  );
}

/** Mengambil temuan untuk ditinjau: nama peninjau tercatat di temuan. */
export function TombolTinjau({ id }: { id: number }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(tinjauMasalah, null);
  return (
    <form action={kirim} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={menunggu} className={tombolKedua}>
        {menunggu ? "Mencatat…" : "Tinjau temuan ini"}
      </button>
      <Pesan status={status} />
    </form>
  );
}

/**
 * Dialog keputusan. `mode` "putuskan": pilih selesai atau abaikan. `mode` "buka": buka kembali temuan
 * yang sudah diputuskan. Keduanya wajib beralasan; alasannya masuk jejak audit bersama bukti saat itu.
 */
export function DialogKeputusan({ id, mode }: { id: number; mode: "putuskan" | "buka" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(async (sebelum, fd) => {
    const hasil = await putuskanMasalah(sebelum, fd);
    if (hasil?.ok) dialog.current?.close();
    return hasil;
  }, null);
  const nilai = status && !status.ok ? status.nilai : undefined;
  const buka = mode === "buka";
  // Galat kolom alasan: muncul saat kolom ditinggalkan atau saat simpan diklik, hilang begitu diperbaiki.
  const [galatAlasan, setGalatAlasan] = useState<string | null>(null);
  const periksaAlasan = (teks: string) =>
    teks.trim().length < 10 ? "Tulis dasar keputusannya dulu, paling sedikit 10 huruf." : null;

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={buka ? tombolKedua : tombolUtama}>
        {buka ? "Buka kembali temuan" : "Putuskan temuan"}
      </button>
      {status?.ok && <Pesan status={status} />}

      <dialog
        ref={dialog}
        aria-labelledby={`judul-keputusan-${mode}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-full max-w-lg rounded-xl border border-line bg-white p-0 text-left shadow-card backdrop:bg-ink/60"
      >
        <form
          action={kirim}
          key={status?.urut ?? 0}
          noValidate
          onSubmit={(e) => {
            const galat = periksaAlasan(new FormData(e.currentTarget).get("alasan")?.toString() ?? "");
            setGalatAlasan(galat);
            if (galat) {
              e.preventDefault();
              e.currentTarget.querySelector("textarea")?.focus();
            }
          }}
          className="p-5 sm:p-6"
        >
          <input type="hidden" name="id" value={id} />
          <h2 id={`judul-keputusan-${mode}`} className="text-lg font-bold text-ink">
            {buka ? "Buka kembali temuan" : "Putuskan temuan"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {buka
              ? "Temuan kembali ke antrean dan, bila kritis, kembali menahan penawaran resmi untuk lahannya."
              : "Data sumber tidak diubah. Yang disimpan adalah keputusan Anda, beserta bukti saat ini, di jejak audit."}
          </p>

          {buka ? (
            <input type="hidden" name="status" value="terbuka" />
          ) : (
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-ink">Keputusan</legend>
              <div className="mt-2 grid gap-2">
                {[
                  { nilai: "selesai", nama: "Selesai", arti: "Sudah dipastikan kebenarannya, lahan boleh diproses." },
                  { nilai: "diabaikan", nama: "Abaikan", arti: "Bukan masalah untuk keperluan penawaran." },
                ].map((p) => (
                  <label key={p.nilai} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand-blue has-[:checked]:bg-brand-blue-soft">
                    <input type="radio" name="status" value={p.nilai} required defaultChecked={(nilai?.status ?? "selesai") === p.nilai} className="mt-1" />
                    <span>
                      <span className="font-semibold text-ink">{p.nama}</span>
                      <span className="block text-muted">{p.arti}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label className="mt-4 block text-sm font-semibold text-ink">
            {buka ? "Alasan membuka kembali" : "Dasar keputusan"}
            <textarea
              name="alasan"
              rows={4}
              maxLength={1000}
              defaultValue={typeof nilai?.alasan === "string" ? nilai.alasan : ""}
              aria-describedby={`petunjuk-alasan-${mode}${galatAlasan ? ` galat-alasan-${mode}` : ""}`}
              aria-invalid={galatAlasan ? true : undefined}
              onBlur={(e) => setGalatAlasan(periksaAlasan(e.currentTarget.value))}
              onChange={(e) => {
                if (galatAlasan && !periksaAlasan(e.currentTarget.value)) setGalatAlasan(null);
              }}
              className={`mt-1.5 block w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm font-normal text-ink focus:border-brand-blue ${
                galatAlasan ? "border-brand-red" : "border-line"
              }`}
            />
          </label>
          {galatAlasan && (
            <p id={`galat-alasan-${mode}`} className="mt-1.5 text-sm font-medium text-brand-red-strong">
              {galatAlasan}
            </p>
          )}
          <p id={`petunjuk-alasan-${mode}`} className="mt-1.5 text-xs leading-relaxed text-subtle">
            Tulis apa yang dipastikan, dari siapa, dan kapan. Contoh: &ldquo;Pengelola SPBU memastikan lahan kosong sejak Oktober; kontrak lama sudah diakhiri.&rdquo;
          </p>

          {status && !status.ok && (
            <p role="alert" className="mt-3 rounded-md bg-brand-red-soft px-2.5 py-1.5 text-sm font-medium text-brand-red-strong">
              {status.pesan}
            </p>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className={tombolKedua}>
              Batal
            </button>
            <button type="submit" disabled={menunggu} className={tombolUtama}>
              {menunggu ? "Menyimpan…" : buka ? "Buka kembali" : "Simpan keputusan"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
