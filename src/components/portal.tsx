"use client";

import { useActionState, useRef, useState } from "react";
import type { StatusAksi } from "@/app/aksi";
import { aturAnggota, bagikanPenawaran, buatOrganisasi, hapusAnggota, konfirmasiRuang, pastikanWewenang, putuskanDealer, putuskanTenant, simpanWewenang, tanggapiPenawaran } from "@/app/aksi-portal";
import { PERAN } from "@/lib/validasi";

const tombolUtama =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-brand-blue px-5 text-base font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60";
const tombolKedua =
  "inline-flex min-h-12 items-center justify-center rounded-lg border border-line bg-white px-5 text-base font-semibold text-ink hover:border-subtle disabled:opacity-60";
const kolom = "mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-white px-3.5 text-sm font-normal text-ink focus:border-brand-blue";
const area = "mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-base font-normal text-ink focus:border-brand-blue";
const label = "block text-sm font-semibold text-ink";

function Pesan({ status }: { status: StatusAksi }) {
  if (!status) return null;
  return (
    <p
      role={status.ok ? "status" : "alert"}
      className={`rounded-md px-3 py-2 text-sm font-medium ${
        status.ok ? "bg-brand-green-soft text-brand-green-strong" : "bg-brand-red-soft text-brand-red-strong"
      }`}
    >
      {status.pesan}
    </p>
  );
}

/**
 * Tiga tindakan tenant atas satu penawaran: berminat, minta survei lokasi, atau menolak (dengan alasan),
 * ditambah bertanya. Menyatakan minat tidak mengikat.
 */
export function TanggapanTenant({ id, adaSurvei = false }: { id: string; adaSurvei?: boolean }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(tanggapiPenawaran, null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"tanya" | "menolak">("tanya");
  const [dStatus, dKirim, dMenunggu] = useActionState<StatusAksi, FormData>(async (sebelum, fd) => {
    const hasil = await tanggapiPenawaran(sebelum, fd);
    if (hasil?.ok) dialog.current?.close();
    return hasil;
  }, null);
  const buka = (m: "tanya" | "menolak") => {
    setMode(m);
    dialog.current?.showModal();
  };

  return (
    <div className="grid gap-3">
      <form action={kirim} className="grid gap-3">
        <input type="hidden" name="id" value={id} />
        <button type="submit" name="jenis" value="berminat" disabled={menunggu} className={tombolUtama}>
          Nyatakan berminat
        </button>
        <a href="#survei" className={tombolKedua}>
          {adaSurvei ? "Lihat jadwal survei" : "Minta survei lokasi"}
        </a>
        <button type="button" onClick={() => buka("menolak")} className={`${tombolKedua} text-brand-red-strong`}>
          Tolak penawaran
        </button>
      </form>
      <p className="text-sm leading-relaxed text-muted">
        Menyatakan berminat atau meminta survei tidak mengikat. Belum ada kewajiban sampai kontrak ditandatangani.{" "}
        <button type="button" onClick={() => buka("tanya")} className="font-semibold text-brand-blue-strong underline underline-offset-2">
          Ajukan pertanyaan
        </button>
      </p>
      <Pesan status={status ?? (dStatus?.ok ? dStatus : null)} />

      <dialog
        ref={dialog}
        aria-labelledby="judul-tanggapan"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-full max-w-lg rounded-xl border border-line bg-white p-0 text-left shadow-card backdrop:bg-ink/60"
      >
        <form action={dKirim} key={`${mode}-${dStatus?.urut ?? 0}`} className="p-5 sm:p-6">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="jenis" value={mode} />
          <h2 id="judul-tanggapan" className="text-lg font-bold text-ink">
            {mode === "menolak" ? "Tolak penawaran ini" : "Ajukan pertanyaan"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {mode === "menolak"
              ? "Alasan Anda membantu kami menawarkan lokasi yang lebih cocok lain kali."
              : "Pertanyaan Anda dikirim ke tim Non Fuel Retail Pertamina."}
          </p>
          <label className={`${label} mt-4`}>
            {mode === "menolak" ? "Alasan menolak" : "Pertanyaan Anda"}
            <textarea name="pesan" rows={4} maxLength={1000} defaultValue={typeof dStatus?.nilai?.pesan === "string" && !dStatus.ok ? dStatus.nilai.pesan : ""} className={area} />
          </label>
          {dStatus && !dStatus.ok && (
            <div className="mt-3">
              <Pesan status={dStatus} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className={tombolKedua}>
              Batal
            </button>
            <button type="submit" disabled={dMenunggu} className={tombolUtama}>
              {dMenunggu ? "Mengirim…" : mode === "menolak" ? "Tolak penawaran" : "Kirim pertanyaan"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

/** Keputusan resmi organisasi tenant atas versi penawaran yang berlaku. Hanya admin tenant. */
export function KeputusanTenant({ id, versi }: { id: string; versi: number }) {
  return <FormKeputusan id={id} versi={versi} aksi={putuskanTenant} revisi="Minta revisi" />;
}

/** Keputusan resmi organisasi dealer atas usulan tenant. Hanya admin dealer yang berwenang. */
export function KeputusanDealer({ id, versi }: { id: string; versi: number }) {
  return <FormKeputusan id={id} versi={versi} aksi={putuskanDealer} revisi="Minta perubahan" />;
}

function FormKeputusan({
  id,
  versi,
  aksi,
  revisi,
}: {
  id: string;
  versi: number;
  aksi: (sebelum: StatusAksi, fd: FormData) => Promise<StatusAksi>;
  revisi: string;
}) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(aksi, null);
  const nilai = status && !status.ok ? status.nilai : undefined;
  return (
    <form
      action={kirim}
      key={status?.urut ?? 0}
      onSubmit={(e) => {
        const pilihan = new FormData(e.currentTarget).get("keputusan");
        const kata = pilihan === "disetujui" ? "menyetujui" : pilihan === "ditolak" ? "menolak" : `${revisi.toLowerCase()} atas`;
        if (!window.confirm(`Simpan keputusan organisasi Anda: ${kata} versi ${versi}? Keputusan ini tidak bisa diubah.`)) e.preventDefault();
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="id" value={id} />
      <fieldset>
        <legend className={label}>Keputusan organisasi Anda atas versi {versi}</legend>
        <div className="mt-2 grid gap-2">
          {[
            { nilai: "disetujui", nama: "Setujui" },
            { nilai: "minta_revisi", nama: revisi },
            { nilai: "ditolak", nama: "Tolak" },
          ].map((p) => (
            <label
              key={p.nilai}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-3.5 text-base text-ink has-[:checked]:border-brand-blue has-[:checked]:bg-brand-blue-soft has-[:checked]:font-semibold"
            >
              <input type="radio" name="keputusan" value={p.nilai} defaultChecked={(nilai?.keputusan ?? "disetujui") === p.nilai} />
              {p.nama}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={label}>
        Alasan <span className="font-normal text-muted">(wajib bila {revisi.toLowerCase()} atau menolak)</span>
        <textarea name="alasan" rows={3} maxLength={1000} defaultValue={typeof nilai?.alasan === "string" ? nilai.alasan : ""} className={area} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={menunggu} className={tombolUtama}>
          {menunggu ? "Menyimpan…" : "Simpan keputusan"}
        </button>
        <Pesan status={status} />
      </div>
    </form>
  );
}

/** NFR: membagikan penawaran ke satu organisasi tenant, atau berhenti membagikannya. */
export function FormBagikan({
  id,
  organisasi,
  pilihan,
}: {
  id: string;
  organisasi: { id: string; nama: string } | null;
  pilihan: { id: string; nama: string; demo: boolean }[];
}) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(bagikanPenawaran, null);
  const [pilih, setPilih] = useState(organisasi?.id ?? "");
  const kecil = "inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold disabled:opacity-60";
  return (
    <form action={kirim} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-muted sm:max-w-sm">
        Organisasi tenant
        <select name="organisasi" value={pilih} onChange={(e) => setPilih(e.target.value)} className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink">
          <option value="">Pilih organisasi</option>
          {pilihan.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nama}
              {o.demo ? " (organisasi uji)" : ""}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" name="niat" value="bagikan" disabled={menunggu} className={`${kecil} bg-brand-blue text-white hover:bg-brand-blue-strong`}>
        {organisasi ? "Ganti penerima" : "Bagikan penawaran"}
      </button>
      {organisasi && (
        <button
          type="submit"
          name="niat"
          value="hentikan"
          disabled={menunggu}
          onClick={() => setPilih("")}
          className={`${kecil} border border-line bg-white text-brand-red-strong hover:border-brand-red`}
        >
          Berhenti membagikan
        </button>
      )}
      <Pesan status={status} />
    </form>
  );
}

/** Admin NFR: membuat organisasi tenant atau dealer. */
export function FormOrganisasi() {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(buatOrganisasi, null);
  const nilai = status && !status.ok ? status.nilai : undefined;
  return (
    <form action={kirim} key={status?.urut ?? (status?.ok ? "ok" : 0)} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
      <label className={label}>
        Nama organisasi
        <input type="text" name="nama" maxLength={120} defaultValue={typeof nilai?.nama === "string" ? nilai.nama : ""} className={kolom} />
      </label>
      <label className={label}>
        Jenis
        <select name="jenis" defaultValue={typeof nilai?.jenis === "string" ? nilai.jenis : "tenant"} className={kolom}>
          <option value="tenant">Tenant</option>
          <option value="dealer">Dealer (pemilik SPBU)</option>
        </select>
      </label>
      <button type="submit" disabled={menunggu} className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60">
        {menunggu ? "Membuat…" : "Buat organisasi"}
      </button>
      <div className="sm:col-span-3">
        <Pesan status={status} />
      </div>
    </form>
  );
}

const PERAN_PER_JENIS: Record<string, string[]> = {
  nfr: ["nfr_analis", "nfr_penyetuju", "nfr_admin", "auditor"],
  tenant: ["tenant_admin", "tenant_perwakilan"],
  dealer: ["dealer_admin", "dealer_operator"],
};

/** Admin NFR: menghubungkan akun yang sudah ada ke satu organisasi. */
export function FormAnggota({ organisasi }: { organisasi: { id: string; nama: string; jenis: string }[] }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(aturAnggota, null);
  const [isi, setIsi] = useState({ email: "", organisasi: organisasi[0]?.id ?? "", peran: "" });
  const jenis = organisasi.find((o) => o.id === isi.organisasi)?.jenis ?? "tenant";
  const peran = PERAN_PER_JENIS[jenis];
  const peranTerpilih = peran.includes(isi.peran) ? isi.peran : peran[0];
  return (
    <form action={kirim} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14rem_auto] lg:items-end">
      <label className={label}>
        Email akun
        <input type="email" name="email" autoComplete="off" value={isi.email} onChange={(e) => setIsi({ ...isi, email: e.target.value })} aria-describedby="bantu-email-anggota" className={kolom} />
      </label>
      <label className={label}>
        Organisasi
        <select name="organisasi" value={isi.organisasi} onChange={(e) => setIsi({ ...isi, organisasi: e.target.value })} className={kolom}>
          {organisasi.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nama}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Peran
        <select name="peran" value={peranTerpilih} onChange={(e) => setIsi({ ...isi, peran: e.target.value })} className={kolom}>
          {peran.map((p) => (
            <option key={p} value={p}>
              {PERAN[p] ?? p}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={menunggu} className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60">
        {menunggu ? "Menyimpan…" : "Simpan anggota"}
      </button>
      <p id="bantu-email-anggota" className="text-xs leading-relaxed text-subtle sm:col-span-2 lg:col-span-4">
        Akunnya harus sudah ada. Buat dulu di dasbor Supabase (Authentication, Users), lalu hubungkan di sini. Peran berlaku setelah orang itu masuk ulang.
      </p>
      <div className="sm:col-span-2 lg:col-span-4">
        <Pesan status={status} />
      </div>
    </form>
  );
}

/** Mengeluarkan satu anggota dari organisasinya, dengan konfirmasi yang menyebut nama. */
export function TombolKeluarkan({ email, organisasi, nama }: { email: string; organisasi: string; nama: string }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(hapusAnggota, null);
  return (
    <form
      action={kirim}
      onSubmit={(e) => {
        if (!window.confirm(`Keluarkan ${email} dari ${nama}? Ia tidak lagi bisa melihat data organisasi ini.`)) e.preventDefault();
      }}
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="organisasi" value={organisasi} />
      {status && !status.ok && <span className="text-xs font-medium text-brand-red-strong">{status.pesan}</span>}
      <button type="submit" disabled={menunggu} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-brand-red-strong hover:border-brand-red disabled:opacity-60">
        Keluarkan
      </button>
    </form>
  );
}

/** Pengelola SPBU mengonfirmasi apakah satu ruang yang tercatat kosong memang bisa dipakai. */
export function KonfirmasiRuang({ lahanId, kode, kini }: { lahanId: string; kode: string; kini: "tersedia" | "tidak_tersedia" | null }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(konfirmasiRuang, null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [dStatus, dKirim, dMenunggu] = useActionState<StatusAksi, FormData>(async (sebelum, fd) => {
    const hasil = await konfirmasiRuang(sebelum, fd);
    if (hasil?.ok) dialog.current?.close();
    return hasil;
  }, null);
  const kecil = "inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-base font-semibold disabled:opacity-60";
  return (
    <div className="grid gap-2">
      <form action={kirim} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="lahan_id" value={lahanId} />
        <button
          type="submit"
          name="tersedia"
          value="ya"
          disabled={menunggu}
          aria-pressed={kini === "tersedia"}
          className={`${kecil} ${kini === "tersedia" ? "bg-brand-green-strong text-white" : "border border-line bg-white text-ink hover:border-subtle"}`}
        >
          Bisa dipakai
        </button>
        <button
          type="button"
          onClick={() => dialog.current?.showModal()}
          aria-pressed={kini === "tidak_tersedia"}
          className={`${kecil} ${kini === "tidak_tersedia" ? "bg-brand-red-strong text-white" : "border border-line bg-white text-ink hover:border-subtle"}`}
        >
          Tidak bisa dipakai
        </button>
      </form>
      <Pesan status={status ?? (dStatus?.ok ? dStatus : null)} />
      <dialog
        ref={dialog}
        aria-labelledby={`judul-konfirmasi-${lahanId}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-full max-w-lg rounded-xl border border-line bg-white p-0 text-left shadow-card backdrop:bg-ink/60"
      >
        <form action={dKirim} key={dStatus?.urut ?? 0} className="p-5 sm:p-6">
          <input type="hidden" name="lahan_id" value={lahanId} />
          <input type="hidden" name="tersedia" value="tidak" />
          <h2 id={`judul-konfirmasi-${lahanId}`} className="text-lg font-bold text-ink">
            Ruang {kode} tidak bisa dipakai
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">Ruang ini akan ditahan dari penawaran sampai Anda menyatakan bisa dipakai lagi.</p>
          <label className={`${label} mt-4`}>
            Mengapa tidak bisa dipakai?
            <textarea name="catatan" rows={3} maxLength={400} defaultValue={typeof dStatus?.nilai?.catatan === "string" && !dStatus.ok ? dStatus.nilai.catatan : ""} className={area} />
            <span className="mt-1 block text-xs font-normal text-subtle">Contoh: sedang dipakai gudang oli sampai akhir tahun.</span>
          </label>
          {dStatus && !dStatus.ok && (
            <div className="mt-3">
              <Pesan status={dStatus} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className={tombolKedua}>
              Batal
            </button>
            <button type="submit" disabled={dMenunggu} className={tombolUtama}>
              {dMenunggu ? "Menyimpan…" : "Tahan ruang ini"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

/** NFR: mengisi wewenang SPBU. Setiap perubahan harus dipastikan lagi oleh orang lain. */
export function FormWewenang({
  spbuId,
  hak,
  pilihan,
}: {
  spbuId: string;
  hak: Record<string, string | boolean | null> | null;
  pilihan: { id: string; nama: string; demo: boolean }[];
}) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(simpanWewenang, null);
  const t = (k: string) => (typeof hak?.[k] === "string" ? (hak[k] as string) : "");
  const [isi, setIsi] = useState<Record<string, string>>({
    pola: t("pola"),
    pemilik_aset: t("pemilik_aset"),
    pengelola: t("pengelola"),
    organisasi_dealer: t("organisasi_dealer"),
    dealer_berwenang: hak?.dealer_berwenang === true ? "true" : "",
    penyetuju: t("penyetuju"),
    pihak_kontrak: t("pihak_kontrak"),
    penerima_sewa: t("penerima_sewa"),
    bagi_hasil: t("bagi_hasil"),
    dokumen: t("dokumen"),
  });
  const ubah = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const Teks = (k: string, nama: string, bantu?: string) => (
    <label className={label}>
      {nama}
      <input type="text" name={k} maxLength={300} value={isi[k]} onChange={ubah(k)} className={kolom} />
      {bantu && <span className="mt-1 block text-xs font-normal text-subtle">{bantu}</span>}
    </label>
  );
  return (
    <form action={kirim} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="spbu_id" value={spbuId} />
      <label className={label}>
        Pola pengelolaan
        <select name="pola" value={isi.pola} onChange={ubah("pola")} className={kolom}>
          <option value="">Belum diketahui</option>
          <option value="COCO">COCO: dimiliki dan dikelola Pertamina</option>
          <option value="DODO">DODO: dimiliki dan dikelola mitra</option>
          <option value="CODO">CODO: dimiliki Pertamina, dikelola mitra</option>
          <option value="lainnya">Pola lain</option>
        </select>
      </label>
      {Teks("pemilik_aset", "Pemilik aset", "Pemilik sah lahan dan bangunan, belum tentu pengelolanya.")}
      {Teks("pengelola", "Pengelola SPBU")}
      <label className={label}>
        Organisasi pengelola di aplikasi
        <select name="organisasi_dealer" value={isi.organisasi_dealer} onChange={ubah("organisasi_dealer")} className={kolom}>
          <option value="">Belum ada</option>
          {pilihan.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nama}
              {o.demo ? " (organisasi uji)" : ""}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs font-normal text-subtle">Anggotanya melihat SPBU ini di portal dealer.</span>
      </label>
      {Teks("penyetuju", "Yang berwenang menyetujui tenant baru", "Nama dan jabatannya.")}
      <label className="flex min-h-11 items-start gap-3 self-end rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink">
        <input
          type="checkbox"
          name="dealer_berwenang"
          value="true"
          checked={isi.dealer_berwenang === "true"}
          disabled={isi.organisasi_dealer === ""}
          onChange={(e) => setIsi((x) => ({ ...x, dealer_berwenang: e.target.checked ? "true" : "" }))}
          className="mt-1"
        />
        <span>
          <span className="font-semibold">Organisasi pengelola adalah penyetujunya</span>
          <span className="block text-muted">Bila dicentang, admin organisasi itu memutuskan sendiri di portalnya.</span>
        </span>
      </label>
      {Teks("pihak_kontrak", "Pihak yang menandatangani kontrak sewa")}
      <label className={label}>
        Penerima sewa
        <select name="penerima_sewa" value={isi.penerima_sewa} onChange={ubah("penerima_sewa")} className={kolom}>
          <option value="">Belum dipastikan</option>
          <option value="pertamina">Pertamina</option>
          <option value="pemilik_spbu">Pemilik SPBU</option>
          <option value="dibagi">Dibagi Pertamina dan pemilik SPBU</option>
        </select>
      </label>
      {isi.penerima_sewa === "dibagi" && Teks("bagi_hasil", "Pengaturan pembagian sewa", "Misalnya: 70% pemilik SPBU, 30% Pertamina.")}
      {Teks("dokumen", "Rujukan dokumen", "Nomor perjanjian, akta, atau surat kuasa yang menjadi dasarnya.")}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={menunggu} className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-strong disabled:opacity-60">
          {menunggu ? "Menyimpan…" : "Simpan wewenang"}
        </button>
        <Pesan status={status} />
      </div>
    </form>
  );
}

/** NFR (admin atau penyetuju): memastikan wewenang yang diisi orang lain. */
export function TombolPastikan({ spbuId }: { spbuId: string }) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(pastikanWewenang, null);
  return (
    <form action={kirim} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="spbu_id" value={spbuId} />
      <button type="submit" disabled={menunggu} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-subtle disabled:opacity-60">
        {menunggu ? "Memastikan…" : "Pastikan wewenang ini"}
      </button>
      <Pesan status={status} />
    </form>
  );
}
