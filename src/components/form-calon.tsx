"use client";

import { useActionState, useState } from "react";
import type { StatusAksi } from "@/app/aksi";
import { type Bahasa, JENIS_USAHA, KANAL, POSISI, PROVINSI } from "@/lib/istilah";

const T = {
  id: {
    usaha: "Tentang usaha Anda",
    nama: "Nama usaha",
    jenis: "Jenis usaha",
    pilih: "Pilih jenis usaha",
    deskripsi: "Produk atau layanan",
    deskripsiBantu: "Apa yang Anda jual, dalam satu atau dua kalimat.",
    target: "Target pasar",
    targetBantu: "Siapa pelanggan Anda, misalnya pengendara motor, pekerja kantor, atau warga sekitar.",
    asal: "Asal usaha",
    lokal: "Indonesia",
    internasional: "Luar negeri",
    negara: "Negara asal",
    gerai: "Jumlah gerai saat ini",
    kontak: "Kontak",
    kontakNama: "Nama kontak",
    email: "Email",
    telepon: "Nomor telepon",
    kontakBantu: "Isi email atau nomor telepon, salah satu saja sudah cukup.",
    lokasi: "Kebutuhan lokasi",
    lokasiBantu: "Kosongkan yang belum Anda ketahui. Makin lengkap, makin tepat lahan yang kami tawarkan.",
    luasMin: "Luas minimum (m²)",
    luasMaks: "Luas maksimum (m²)",
    posisi: "Posisi",
    daya: "Daya listrik minimum (watt)",
    anggaran: "Anggaran sewa per tahun (Rp)",
    provinsi: "Provinsi yang diminati",
    provinsiBantu: "Boleh lebih dari satu. Kosongkan bila terbuka untuk semua provinsi.",
    catatan: "Catatan",
    kanal: "Kanal",
    kirim: "Kirim dan lihat lahan yang cocok",
    simpan: "Simpan calon tenant",
    menunggu: "Menyimpan…",
    wajib: "wajib",
  },
  en: {
    usaha: "About your business",
    nama: "Business name",
    jenis: "Business type",
    pilih: "Choose a business type",
    deskripsi: "Products or services",
    deskripsiBantu: "What you sell, in a sentence or two.",
    target: "Target market",
    targetBantu: "Who your customers are, such as motorcyclists, office workers or nearby residents.",
    asal: "Business origin",
    lokal: "Indonesia",
    internasional: "Outside Indonesia",
    negara: "Country of origin",
    gerai: "Current number of outlets",
    kontak: "Contact",
    kontakNama: "Contact name",
    email: "Email",
    telepon: "Phone number",
    kontakBantu: "Enter an email address or a phone number. One is enough.",
    lokasi: "Location requirements",
    lokasiBantu: "Leave blank what you do not know yet. The more you fill in, the better the match.",
    luasMin: "Minimum area (m²)",
    luasMaks: "Maximum area (m²)",
    posisi: "Position",
    daya: "Minimum power supply (watts)",
    anggaran: "Annual rent budget (IDR)",
    provinsi: "Provinces of interest",
    provinsiBantu: "Select one or more. Leave blank if you are open to any province.",
    catatan: "Notes",
    kanal: "Channel",
    kirim: "Submit and see matching spaces",
    simpan: "Save prospect",
    menunggu: "Saving…",
    wajib: "required",
  },
} as const;

const kolom =
  "mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-subtle focus:border-brand-blue";
const label = "block text-sm font-semibold text-ink";
const bantu = "mt-1 text-xs leading-relaxed text-subtle";

/**
 * Formulir calon tenant. Dipakai di halaman publik "Jadi Bright Partner" (dua bahasa)
 * dan oleh tim NFR saat mencatat calon dari kanal lain (dengan pilihan kanal).
 */
export default function FormCalon({
  aksi,
  internal = false,
}: {
  aksi: (sebelumnya: StatusAksi, fd: FormData) => Promise<StatusAksi>;
  internal?: boolean;
}) {
  const [status, kirim, menunggu] = useActionState<StatusAksi, FormData>(aksi, null);
  const [bahasa, setBahasa] = useState<Bahasa>("id");
  const [asal, setAsal] = useState("lokal");
  const [anggaran, setAnggaran] = useState("");
  const t = T[bahasa];
  // Isian terakhir yang ditolak. React mengosongkan formulir setelah aksi selesai, jadi isian itu
  // dipasang kembali sebagai nilai awal (lihat `key` pada pembungkus kolom di bawah).
  const awal = (kunci: string) => {
    const v = status?.nilai?.[kunci];
    return typeof v === "string" ? v : "";
  };
  const provinsiAwal = status?.nilai?.provinsi_minat;
  const bintang = (
    <span className="font-normal text-subtle">
      {" "}
      ({t.wajib})
    </span>
  );

  return (
    <form action={kirim} className="space-y-8">
      <input type="hidden" name="bahasa" value={bahasa} />
      {/* Kolom jebakan untuk robot pengisi formulir; tidak terlihat dan tidak bisa difokus. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Situs web
          <input type="text" name="situs" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {!internal && (
        <div role="group" aria-label="Bahasa / Language" className="inline-flex rounded-lg border border-line bg-white p-1 text-sm">
          {(["id", "en"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBahasa(b)}
              aria-pressed={bahasa === b}
              className={`rounded-md px-3 py-1.5 font-semibold ${bahasa === b ? "bg-brand-blue text-white" : "text-muted hover:text-ink"}`}
            >
              {b === "id" ? "Bahasa Indonesia" : "English"}
            </button>
          ))}
        </div>
      )}

      <div key={status?.urut ?? 0} className="space-y-8">
      <fieldset className="space-y-5">
        <legend className="text-lg font-bold text-ink">{t.usaha}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={label}>
            {t.nama}
            {bintang}
            <input name="nama_usaha" defaultValue={awal("nama_usaha")} required minLength={2} maxLength={120} autoComplete="organization" className={kolom} />
          </label>
          <label className={label}>
            {t.jenis}
            {bintang}
            <select name="segmen" required defaultValue={awal("segmen")} className={kolom}>
              <option value="" disabled>
                {t.pilih}
              </option>
              {JENIS_USAHA.map((j) => (
                <option key={j.nilai} value={j.nilai}>
                  {j[bahasa]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={label}>
          {t.deskripsi}
          <textarea name="deskripsi" rows={2} maxLength={600} defaultValue={awal("deskripsi")} className={kolom} />
          <span className={bantu}>{t.deskripsiBantu}</span>
        </label>
        <label className={label}>
          {t.target}
          <textarea name="target_pasar" rows={2} maxLength={600} defaultValue={awal("target_pasar")} className={kolom} />
          <span className={bantu}>{t.targetBantu}</span>
        </label>
        <div className="grid gap-5 sm:grid-cols-3">
          <label className={label}>
            {t.asal}
            <select name="asal" value={asal} onChange={(e) => setAsal(e.target.value)} className={kolom}>
              <option value="lokal">{t.lokal}</option>
              <option value="internasional">{t.internasional}</option>
            </select>
          </label>
          {asal === "internasional" && (
            <label className={label}>
              {t.negara}
              <input name="negara" defaultValue={awal("negara")} maxLength={80} autoComplete="country-name" className={kolom} />
            </label>
          )}
          <label className={label}>
            {t.gerai}
            <input name="jumlah_gerai" defaultValue={awal("jumlah_gerai")} type="number" min={0} step={1} inputMode="numeric" className={kolom} />
          </label>
        </div>
        {internal && (
          <label className={`${label} sm:max-w-xs`}>
            {t.kanal}
            <select name="kanal" defaultValue={awal("kanal") || "tenant_eksisting"} className={kolom}>
              {Object.entries(KANAL).map(([nilai, nama]) => (
                <option key={nilai} value={nilai}>
                  {nama}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-lg font-bold text-ink">{t.kontak}</legend>
        <div className="grid gap-5 sm:grid-cols-3">
          <label className={label}>
            {t.kontakNama}
            {bintang}
            <input name="kontak_nama" defaultValue={awal("kontak_nama")} required minLength={2} maxLength={120} autoComplete="name" className={kolom} />
          </label>
          <label className={label}>
            {t.email}
            <input name="kontak_email" defaultValue={awal("kontak_email")} type="email" maxLength={160} autoComplete="email" className={kolom} />
          </label>
          <label className={label}>
            {t.telepon}
            <input name="kontak_telepon" defaultValue={awal("kontak_telepon")} type="tel" maxLength={40} autoComplete="tel" className={kolom} />
          </label>
        </div>
        <p className={bantu}>{t.kontakBantu}</p>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-lg font-bold text-ink">{t.lokasi}</legend>
        <p className={bantu}>{t.lokasiBantu}</p>
        <div className="grid gap-5 sm:grid-cols-3">
          <label className={label}>
            {t.luasMin}
            <input name="luas_min" defaultValue={awal("luas_min")} type="number" min={0} step="0.5" inputMode="decimal" className={kolom} />
          </label>
          <label className={label}>
            {t.luasMaks}
            <input name="luas_maks" defaultValue={awal("luas_maks")} type="number" min={0} step="0.5" inputMode="decimal" className={kolom} />
          </label>
          <label className={label}>
            {t.posisi}
            <select name="posisi" defaultValue={awal("posisi") || "bebas"} className={kolom}>
              {Object.entries(POSISI).map(([nilai, nama]) => (
                <option key={nilai} value={nilai}>
                  {nama[bahasa]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {t.daya}
            <input name="daya_min" defaultValue={awal("daya_min")} type="number" min={0} step={100} inputMode="numeric" className={kolom} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            {t.anggaran}
            <input
              name="anggaran_tahunan"
              type="number"
              min={0}
              step={500000}
              inputMode="numeric"
              value={anggaran}
              onChange={(e) => setAnggaran(e.target.value)}
              className={kolom}
            />
            {Number(anggaran) > 0 && (
              <span className={bantu}>Rp {new Intl.NumberFormat("id-ID").format(Number(anggaran))}</span>
            )}
          </label>
        </div>
        <div>
          <p className={label}>{t.provinsi}</p>
          <p className={bantu}>{t.provinsiBantu}</p>
          <div className="mt-2 grid max-h-56 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border border-line bg-white p-3 text-sm sm:grid-cols-3">
            {PROVINSI.map((p) => (
              <label key={p} className="flex items-center gap-2 text-ink">
                <input
                  type="checkbox"
                  name="provinsi_minat"
                  value={p}
                  defaultChecked={Array.isArray(provinsiAwal) && provinsiAwal.includes(p)}
                  className="size-4 accent-brand-blue"
                />
                {p}
              </label>
            ))}
          </div>
        </div>
        <label className={label}>
          {t.catatan}
          <textarea name="catatan" rows={3} maxLength={1000} defaultValue={awal("catatan")} className={kolom} />
        </label>
      </fieldset>
      </div>

      {status && !status.ok && (
        <p role="alert" className="rounded-lg bg-brand-red-soft px-3.5 py-2.5 text-sm font-medium text-brand-red-strong">
          {status.pesan}
        </p>
      )}

      <button
        type="submit"
        disabled={menunggu}
        className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand-blue px-6 text-base font-semibold text-white transition-colors hover:bg-brand-blue-strong disabled:opacity-60"
      >
        {menunggu ? t.menunggu : internal ? t.simpan : t.kirim}
      </button>
    </form>
  );
}
