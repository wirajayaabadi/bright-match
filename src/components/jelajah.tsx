"use client";

import { useActionState, useRef } from "react";
import type { StatusAksi } from "@/app/aksi";
import { aturJelajah, minatiLokasi, tanganiMinat } from "@/app/aksi-jelajah";
import type { PilihanProvinsi } from "@/lib/jelajah";

const tombolUtama =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60";
const tombolKedua =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle disabled:opacity-60";
const area = "mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-base font-normal text-ink focus:border-brand-blue";
const label = "block text-sm font-semibold text-ink";

function Pesan({ status }: { status: StatusAksi }) {
  if (!status) return null;
  return (
    <p
      role={status.ok ? "status" : "alert"}
      className={`rounded-md px-3 py-2 text-sm font-medium ${status.ok ? "bg-brand-green-soft text-brand-green-strong" : "bg-brand-red-soft text-brand-red-strong"}`}
    >
      {status.pesan}
    </p>
  );
}

const isi = (status: StatusAksi, k: string) => (status && !status.ok && typeof status.nilai?.[k] === "string" ? (status.nilai[k] as string) : "");

/** Tenant menyatakan minat pada satu ruang di penjelajah. Tidak mengikat dan tidak membuat penawaran. */
export function MinatiLokasi({ lahanId, lokasi }: { lahanId: string; lokasi: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(async (sebelum, fd) => {
    const hasil = await minatiLokasi(sebelum, fd);
    if (hasil?.ok) dialog.current?.close();
    return hasil;
  }, null);
  const idJudul = `judul-minat-${lahanId}`;
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={tombolUtama}>
        Minati lokasi ini
      </button>
      {status?.ok && (
        <span className="ml-3 inline-block align-middle">
          <Pesan status={status} />
        </span>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={idJudul}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-full max-w-lg rounded-xl border border-line bg-white p-0 text-left shadow-card backdrop:bg-ink/60"
      >
        <form action={kirim} key={status?.urut ?? 0} className="p-5 sm:p-6">
          <input type="hidden" name="lahan_id" value={lahanId} />
          <h2 id={idJudul} className="text-lg font-bold text-ink">
            Minati {lokasi}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Tim Non Fuel Retail akan menghubungi organisasi Anda. Menyatakan minat tidak mengikat, dan belum berarti lokasi ini ditawarkan kepada Anda.
          </p>
          <label className={`${label} mt-4`}>
            Catatan untuk tim <span className="font-normal text-muted">(opsional)</span>
            <textarea name="catatan" rows={3} maxLength={500} defaultValue={isi(status, "catatan")} className={area} />
            <span className="mt-1 block text-xs font-normal text-subtle">Misalnya jenis usaha yang ingin Anda buka di sini.</span>
          </label>
          {status && !status.ok && (
            <div className="mt-3">
              <Pesan status={status} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => dialog.current?.close()} className={tombolKedua}>
              Kembali
            </button>
            <button type="submit" disabled={menunggu} className={tombolUtama}>
              {menunggu ? "Mengirim…" : "Kirim minat"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Admin NFR: provinsi mana yang boleh dijelajahi satu organisasi tenant. */
export function FormJelajah({ organisasiId, terbuka, pilihan }: { organisasiId: string; terbuka: string[]; pilihan: PilihanProvinsi[] }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(aturJelajah, null);
  return (
    <form action={kirim} className="grid gap-3">
      <input type="hidden" name="organisasi_id" value={organisasiId} />
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Provinsi yang boleh dijelajahi</legend>
        <p className="mt-1 text-xs leading-relaxed text-subtle">
          Anggota organisasi ini melihat ruang kosong yang sudah diverifikasi di provinsi yang dicentang: lokasi, ukuran, daya, foto, dan lingkungannya. Tarif,
          nama penyewa, dan nilai kontrak tidak ikut. Tanpa centang, mereka tidak melihat apa pun.
        </p>
        <ul className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          {pilihan.map((p) => (
            <li key={p.provinsi}>
              <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
                <input type="checkbox" name="provinsi" value={p.provinsi} defaultChecked={terbuka.includes(p.provinsi)} />
                <span>
                  {p.provinsi} <span className="angka text-xs text-subtle">({p.layak} ruang layak)</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={menunggu} className={tombolKedua}>
          {menunggu ? "Menyimpan…" : "Simpan wilayah penjelajah"}
        </button>
        <Pesan status={status} />
      </div>
    </form>
  );
}

/** Tim NFR: menandai satu minat sedang ditindaklanjuti, atau menutupnya dengan alasan. */
export function TindakMinat({ id, status: kini, lokasi }: { id: string; status: "baru" | "ditindaklanjuti"; lokasi: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(tanganiMinat, null);
  const [dStatus, dKirim, dMenunggu] = useActionState<StatusAksi, FormData>(async (sebelum, fd) => {
    const hasil = await tanganiMinat(sebelum, fd);
    if (hasil?.ok) dialog.current?.close();
    return hasil;
  }, null);
  const idJudul = `judul-tutup-${id}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {kini === "baru" && (
        <form action={kirim}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="ditindaklanjuti" />
          <button type="submit" disabled={menunggu} className={tombolKedua}>
            {menunggu ? "Menandai…" : "Tandai sedang ditindaklanjuti"}
          </button>
        </form>
      )}
      <button type="button" onClick={() => dialog.current?.showModal()} className={tombolKedua}>
        Tutup minat
      </button>
      {status && !status.ok && <Pesan status={status} />}
      <dialog
        ref={dialog}
        aria-labelledby={idJudul}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-full max-w-lg rounded-xl border border-line bg-white p-0 text-left shadow-card backdrop:bg-ink/60"
      >
        <form action={dKirim} key={dStatus?.urut ?? 0} className="p-5 sm:p-6">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="ditutup" />
          <h2 id={idJudul} className="text-lg font-bold text-ink">
            Tutup minat pada {lokasi}?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Minat yang ditutup hilang dari daftar ini. Tenant bisa menyatakan minat lagi dari penjelajahnya. Alasan ini catatan internal tim NFR.
          </p>
          <label className={`${label} mt-4`}>
            Alasan menutup
            <textarea name="catatan" rows={3} maxLength={500} defaultValue={isi(dStatus, "catatan")} className={area} />
          </label>
          {dStatus && !dStatus.ok && (
            <div className="mt-3">
              <Pesan status={dStatus} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => dialog.current?.close()} className={tombolKedua}>
              Kembali
            </button>
            <button type="submit" disabled={dMenunggu} className={tombolUtama}>
              {dMenunggu ? "Menutup…" : "Tutup minat"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
