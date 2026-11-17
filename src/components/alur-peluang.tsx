"use client";

import { useActionState, useRef, useState } from "react";
import type { StatusAksi } from "@/app/aksi";
import { catatAktif, catatTandaTangan, hitungUlangSkor, putuskanPersetujuan, simpanPenawaran, simpanTindakLanjut, terbitkanPenawaran } from "@/app/aksi-alur";
import type { VersiPenawaran } from "@/lib/data-tahap3";
import { PENERIMA_SEWA, PIHAK_SETUJU, SKEMA } from "@/lib/istilah";
import { PERAN } from "@/lib/validasi";

const tombolUtama =
  "inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60";
const tombolKedua =
  "inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle disabled:opacity-60";
const kolom = "mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-white px-3.5 text-sm font-normal text-ink focus:border-brand-blue";
const label = "block text-sm font-semibold text-ink";

function Pesan({ status }: { status: StatusAksi }) {
  if (!status) return null;
  return (
    <p
      role={status.ok ? "status" : "alert"}
      className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${
        status.ok ? "bg-brand-green-soft text-brand-green-strong" : "bg-brand-red-soft text-brand-red-strong"
      }`}
    >
      {status.pesan}
    </p>
  );
}

/** Menghitung ulang skor dari data saat ini. Potret lama tetap tersimpan. */
export function TombolHitungUlang({ id }: { id: string }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(hitungUlangSkor, null);
  return (
    <form action={kirim} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={menunggu} className={tombolKedua}>
        {menunggu ? "Menghitung…" : "Hitung ulang skor"}
      </button>
      <Pesan status={status} />
    </form>
  );
}

/** Pemilik, tindakan berikut, dan tenggat satu peluang. */
export function FormTindakLanjut({
  id,
  pemilik,
  tindakan,
  tenggat,
  anggota,
}: {
  id: string;
  pemilik: string | null;
  tindakan: string | null;
  tenggat: string | null;
  anggota: { email: string; peran: string }[];
}) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(simpanTindakLanjut, null);
  // Terkendali: React mengosongkan kolom tak terkendali setelah aksi formulir selesai.
  const [isi, setIsi] = useState({ pemilik: pemilik ?? "", tindakan: tindakan ?? "", tenggat: tenggat ?? "" });
  // Pemilik lama yang bukan lagi anggota tetap ditampilkan agar tidak hilang diam-diam.
  const pilihan = pemilik && !anggota.some((a) => a.email === pemilik) ? [{ email: pemilik, peran: "" }, ...anggota] : anggota;

  return (
    <form action={kirim} className="grid gap-4 rounded-xl border border-line bg-white p-4 shadow-card sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <label className={label}>
        Pemilik peluang
        <select name="pemilik" value={isi.pemilik} onChange={(e) => setIsi({ ...isi, pemilik: e.target.value })} className={kolom}>
          <option value="">Belum ada pemilik</option>
          {pilihan.map((a) => (
            <option key={a.email} value={a.email}>
              {a.email}
              {a.peran ? ` (${PERAN[a.peran] ?? a.peran})` : " (bukan lagi anggota)"}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Tenggat
        <input type="date" name="tenggat" value={isi.tenggat} onChange={(e) => setIsi({ ...isi, tenggat: e.target.value })} className={kolom} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Tindakan berikut
        <input
          type="text"
          name="tindakan"
          maxLength={300}
          value={isi.tindakan}
          onChange={(e) => setIsi({ ...isi, tindakan: e.target.value })}
          aria-describedby="bantu-tindakan"
          className={kolom}
        />
        <span id="bantu-tindakan" className="mt-1 block text-xs font-normal text-subtle">
          Satu kalimat, misalnya: kirim kartu penawaran ke manajer ekspansi.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={menunggu} className={tombolUtama}>
          {menunggu ? "Menyimpan…" : "Simpan tindak lanjut"}
        </button>
        <Pesan status={status} />
      </div>
    </form>
  );
}

/** Draf versi penawaran. Versi yang sudah terbit tidak diubah: perubahan berarti versi baru. */
export function FormPenawaran({
  peluangId,
  draf,
  acuan,
  versiBerikut,
}: {
  peluangId: string;
  draf: VersiPenawaran | null;
  /** Versi terakhir yang terbit atau tarif lahan, sebagai isian awal. */
  acuan: Partial<VersiPenawaran>;
  versiBerikut: number;
}) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(simpanPenawaran, null);
  const awal = draf ?? acuan;
  const [isi, setIsi] = useState<Record<string, string>>({
    sewa_tahunan: awal.sewa_tahunan != null ? String(awal.sewa_tahunan) : "",
    lama_sewa_bulan: String(awal.lama_sewa_bulan ?? 12),
    skema: awal.skema ?? "sewa_tetap",
    bagi_hasil_pct: awal.bagi_hasil_pct != null ? String(awal.bagi_hasil_pct).replace(".", ",") : "",
    deposit: awal.deposit != null ? String(awal.deposit) : "",
    bebas_sewa_bulan: String(awal.bebas_sewa_bulan ?? 0),
    mulai_rencana: awal.mulai_rencana ?? "",
    penerima_sewa: awal.penerima_sewa ?? "belum_dipastikan",
    catatan: draf?.catatan ?? "",
  });
  const ubah = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setIsi((x) => ({ ...x, [k]: e.target.value }));

  return (
    <form action={kirim} className="grid gap-4 rounded-xl border border-line bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="peluang_id" value={peluangId} />
      <p className="text-sm font-bold text-ink sm:col-span-2 lg:col-span-3">
        {draf ? `Draf versi ${draf.versi}` : `Susun versi ${versiBerikut}`}
        <span className="block font-normal text-muted">Draf belum mengikat siapa pun. Persetujuan baru diminta setelah versi ini diterbitkan.</span>
      </p>
      <label className={label}>
        Sewa per tahun (Rp)
        <input type="text" inputMode="numeric" name="sewa_tahunan" value={isi.sewa_tahunan} onChange={ubah("sewa_tahunan")} className={kolom} />
      </label>
      <label className={label}>
        Lama sewa (bulan)
        <input type="text" inputMode="numeric" name="lama_sewa_bulan" value={isi.lama_sewa_bulan} onChange={ubah("lama_sewa_bulan")} className={kolom} />
      </label>
      <label className={label}>
        Masa bebas sewa (bulan)
        <input type="text" inputMode="numeric" name="bebas_sewa_bulan" value={isi.bebas_sewa_bulan} onChange={ubah("bebas_sewa_bulan")} className={kolom} />
      </label>
      <label className={label}>
        Skema
        <select name="skema" value={isi.skema} onChange={ubah("skema")} className={kolom}>
          {Object.entries(SKEMA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {isi.skema !== "sewa_tetap" && (
        <label className={label}>
          Bagi hasil (% dari omzet)
          <input type="text" inputMode="decimal" name="bagi_hasil_pct" value={isi.bagi_hasil_pct} onChange={ubah("bagi_hasil_pct")} className={kolom} />
        </label>
      )}
      <label className={label}>
        Deposit (Rp) <span className="font-normal text-muted">bila ada</span>
        <input type="text" inputMode="numeric" name="deposit" value={isi.deposit} onChange={ubah("deposit")} className={kolom} />
      </label>
      <label className={label}>
        Rencana mulai sewa <span className="font-normal text-muted">bila sudah ada</span>
        <input type="date" name="mulai_rencana" value={isi.mulai_rencana} onChange={ubah("mulai_rencana")} className={kolom} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Penerima sewa
        <select name="penerima_sewa" value={isi.penerima_sewa} onChange={ubah("penerima_sewa")} aria-describedby="bantu-penerima" className={kolom}>
          {Object.entries(PENERIMA_SEWA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span id="bantu-penerima" className="mt-1 block text-xs font-normal text-subtle">
          Mengikuti pengaturan SPBU (COCO atau DODO) yang sudah dipastikan. Harus dipilih sebelum penawaran diterbitkan.
        </span>
      </label>
      <label className={`${label} sm:col-span-2 lg:col-span-3`}>
        Catatan syarat lain <span className="font-normal text-muted">(boleh dikosongkan)</span>
        <textarea
          name="catatan"
          rows={2}
          maxLength={1000}
          value={isi.catatan}
          onChange={ubah("catatan")}
          className="mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm font-normal text-ink focus:border-brand-blue"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
        <button type="submit" disabled={menunggu} className={tombolKedua}>
          {menunggu ? "Menyimpan…" : "Simpan draf"}
        </button>
        <Pesan status={status} />
      </div>
    </form>
  );
}

/** Menerbitkan draf yang sudah tersimpan: menjadi versi berlaku dan membuka empat persetujuan baru. */
export function TombolTerbitkan({ id, versi, adaVersiBerlaku }: { id: string; versi: number; adaVersiBerlaku: boolean }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(terbitkanPenawaran, null);
  return (
    <form
      action={kirim}
      onSubmit={(e) => {
        const pesan = adaVersiBerlaku
          ? `Terbitkan versi ${versi}? Versi yang berlaku sekarang digantikan, dan semua persetujuan atasnya gugur.`
          : `Terbitkan versi ${versi} sebagai penawaran resmi?`;
        if (!window.confirm(pesan)) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={menunggu} className={tombolUtama}>
        {menunggu ? "Menerbitkan…" : `Terbitkan versi ${versi}`}
      </button>
      <Pesan status={status} />
    </form>
  );
}

/** Mencatat keputusan satu pihak atas versi penawaran yang berlaku. */
export function DialogPersetujuan({ id, pihak, versi }: { id: string; pihak: string; versi: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(async (sebelum, fd) => {
    const hasil = await putuskanPersetujuan(sebelum, fd);
    if (hasil?.ok) dialog.current?.close();
    return hasil;
  }, null);
  const nilai = status && !status.ok ? status.nilai : undefined;
  const atasNama = pihak !== "nfr";
  const area = "mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm font-normal text-ink focus:border-brand-blue";

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={tombolKedua}>
        Catat keputusan
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`judul-setuju-${id}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-full max-w-lg rounded-xl border border-line bg-white p-0 text-left shadow-card backdrop:bg-ink/60"
      >
        <form action={kirim} key={status?.urut ?? 0} className="p-5 sm:p-6">
          <input type="hidden" name="id" value={id} />
          <h2 id={`judul-setuju-${id}`} className="text-lg font-bold text-ink">
            Keputusan {PIHAK_SETUJU[pihak] ?? pihak} atas versi {versi}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {atasNama
              ? "Anda mencatat keputusan ini atas nama pihak tersebut. Keputusan hanya berlaku untuk versi ini dan tidak bisa diubah setelah disimpan."
              : "Keputusan hanya berlaku untuk versi ini dan tidak bisa diubah setelah disimpan."}
          </p>
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold text-ink">Keputusan</legend>
            <div className="mt-2 grid gap-2">
              {[
                { nilai: "disetujui", nama: "Setujui", arti: "Syarat di versi ini diterima." },
                { nilai: "minta_revisi", nama: "Minta revisi", arti: "Ada syarat yang perlu diubah lewat versi baru." },
                { nilai: "ditolak", nama: "Tolak", arti: "Pihak ini tidak melanjutkan." },
              ].map((p) => (
                <label
                  key={p.nilai}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand-blue has-[:checked]:bg-brand-blue-soft"
                >
                  <input type="radio" name="keputusan" value={p.nilai} defaultChecked={(nilai?.keputusan ?? "disetujui") === p.nilai} className="mt-1" />
                  <span>
                    <span className="font-semibold text-ink">{p.nama}</span>
                    <span className="block text-muted">{p.arti}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {atasNama && (
            <>
              <label className={`${label} mt-4`}>
                Siapa yang memutuskan
                <input type="text" name="wewenang" maxLength={300} defaultValue={typeof nilai?.wewenang === "string" ? nilai.wewenang : ""} aria-describedby={`bantu-wewenang-${id}`} className={kolom} />
                <span id={`bantu-wewenang-${id}`} className="mt-1 block text-xs font-normal text-subtle">
                  Nama dan kapasitasnya, misalnya: Bpk Andi, pemilik SPBU (DODO).
                </span>
              </label>
              <label className={`${label} mt-4`}>
                Rujukan bukti
                <input type="text" name="bukti" maxLength={500} defaultValue={typeof nilai?.bukti === "string" ? nilai.bukti : ""} aria-describedby={`bantu-bukti-${id}`} className={kolom} />
                <span id={`bantu-bukti-${id}`} className="mt-1 block text-xs font-normal text-subtle">
                  Nomor surat, tanggal email, atau berita acara yang menjadi dasarnya.
                </span>
              </label>
            </>
          )}
          <label className={`${label} mt-4`}>
            Alasan <span className="font-normal text-muted">(wajib bila minta revisi atau menolak)</span>
            <textarea name="alasan" rows={3} maxLength={1000} defaultValue={typeof nilai?.alasan === "string" ? nilai.alasan : ""} className={area} />
          </label>
          {status && !status.ok && (
            <div className="mt-3">
              <Pesan status={status} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className={tombolKedua}>
              Batal
            </button>
            <button type="submit" disabled={menunggu} className={tombolUtama}>
              {menunggu ? "Menyimpan…" : "Simpan keputusan"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Mencatat tanda tangan kontrak: peristiwa tersendiri, terpisah dari kelengkapan persyaratan. */
export function FormTandaTangan({ id }: { id: string }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(catatTandaTangan, null);
  const nilai = status && !status.ok ? status.nilai : undefined;
  return (
    <form action={kirim} key={status?.urut ?? 0} className="grid gap-4 rounded-xl border border-line bg-white p-4 shadow-card sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="id" value={id} />
      <label className={label}>
        Tanggal tanda tangan
        <input type="date" name="tanggal" defaultValue={typeof nilai?.tanggal === "string" ? nilai.tanggal : ""} className={kolom} />
      </label>
      <label className={label}>
        Nomor kontrak
        <input type="text" name="nomor" maxLength={100} defaultValue={typeof nilai?.nomor === "string" ? nilai.nomor : ""} className={kolom} />
      </label>
      <button type="submit" disabled={menunggu} className={tombolUtama}>
        {menunggu ? "Mencatat…" : "Catat tanda tangan"}
      </button>
      <div className="sm:col-span-3">
        <Pesan status={status} />
      </div>
    </form>
  );
}

/** Mencatat tanggal outlet mulai beroperasi: terpisah dari tanda tangan kontrak. */
export function FormAktif({ id }: { id: string }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(catatAktif, null);
  const nilai = status && !status.ok ? status.nilai : undefined;
  return (
    <form action={kirim} key={status?.urut ?? 0} className="grid gap-4 rounded-xl border border-line bg-white p-4 shadow-card sm:grid-cols-[12rem_auto_minmax(0,1fr)] sm:items-end">
      <input type="hidden" name="id" value={id} />
      <label className={label}>
        Mulai beroperasi
        <input type="date" name="tanggal" defaultValue={typeof nilai?.tanggal === "string" ? nilai.tanggal : ""} className={kolom} />
      </label>
      <button type="submit" disabled={menunggu} className={tombolUtama}>
        {menunggu ? "Mencatat…" : "Catat mulai beroperasi"}
      </button>
      <Pesan status={status} />
    </form>
  );
}
