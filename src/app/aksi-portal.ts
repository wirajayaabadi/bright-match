"use server";

import { refresh } from "next/cache";
import type { StatusAksi } from "@/app/aksi";
import { rpc } from "@/lib/data";
import { UUID } from "@/lib/istilah";
import { type Asumsi, type ModelUsaha, tigaSkenario } from "@/lib/kelayakan";

/** Penulisan portal tenant dan pengelolaan organisasi. Aturannya ada di basis data (…_portal_tenant.sql). */
type Hasil = { ok: boolean; pesan: string };

const teks = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function jalankan(fungsi: string, args: Record<string, unknown>, nilai?: Record<string, string>): Promise<StatusAksi> {
  const hasil = await rpc<Hasil>(fungsi, args);
  if (hasil.galat || !hasil.data) return { ok: false, pesan: "Belum bisa disimpan. Coba lagi sebentar lagi.", nilai, urut: Date.now() };
  if (!hasil.data.ok) return { ok: false, pesan: hasil.data.pesan, nilai, urut: Date.now() };
  refresh();
  return { ok: true, pesan: hasil.data.pesan };
}

// ---------------------------------------------------------------- tenant

export async function tanggapiPenawaran(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Penawaran tidak dikenal." };
  const nilai = { jenis: teks(fd, "jenis"), pesan: teks(fd, "pesan") };
  return jalankan("tenant_tanggapi", { p_peluang_id: id, p_jenis: nilai.jenis, p_pesan: nilai.pesan || null }, nilai);
}

export async function putuskanTenant(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Penawaran tidak dikenal." };
  const nilai = { keputusan: teks(fd, "keputusan"), alasan: teks(fd, "alasan") };
  return jalankan("tenant_putuskan", { p_peluang_id: id, p_keputusan: nilai.keputusan, p_alasan: nilai.alasan || null }, nilai);
}

/** Kunci angka yang boleh disimpan sebagai asumsi; selain ini diabaikan. */
const KUNCI_ASUMSI = [
  "kunjungan_per_hari", "konversi_pct", "nilai_transaksi", "hari_buka", "jumlah_charger", "daya_kw", "jam_pakai_per_hari",
  "harga_per_kwh", "biaya_listrik_per_kwh", "transaksi_per_hari", "pendapatan_per_transaksi", "pendapatan_bulanan",
  "margin_kotor_pct", "gaji", "utilitas", "biaya_lain", "investasi_awal", "diskonto_pct",
] as const;

/**
 * Menyimpan satu versi skenario kelayakan. Hasilnya dihitung ulang di server dari asumsi yang dikirim dan
 * dari syarat sewa versi penawaran yang berlaku, jadi angka yang tersimpan tidak bergantung pada peramban.
 */
export async function simpanSkenario(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Penawaran tidak dikenal." };
  const model = teks(fd, "model") as ModelUsaha;
  if (!["ritel", "ev", "atm", "umum"].includes(model)) return { ok: false, pesan: "Pilih model usaha dulu." };

  let mentah: Record<string, unknown> = {};
  try {
    mentah = JSON.parse(teks(fd, "asumsi") || "{}") as Record<string, unknown>;
  } catch {
    return { ok: false, pesan: "Isian belum terbaca. Muat ulang halaman lalu coba lagi." };
  }
  const asumsi: Asumsi = { model, deposit_kembali: mentah.deposit_kembali === true };
  for (const k of KUNCI_ASUMSI) {
    const v = mentah[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e13) asumsi[k] = v;
  }
  const geser = (k: string) => {
    const v = Number(mentah[k]);
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 20;
  };
  const turun = geser("turun_pct");
  const naik = geser("naik_pct");

  const rinci = await rpc<{ syarat: { sewa_tahunan: number; lama_sewa_bulan: number; bebas_sewa_bulan: number; deposit: number | null; bagi_hasil_pct: number | null } }>(
    "tenant_penawaran_rinci",
    { p_peluang_id: id },
  );
  if (!rinci.data) return { ok: false, pesan: "Penawaran ini tidak ditemukan." };
  const s = rinci.data.syarat;
  const sewa = { sewa_tahunan: s.sewa_tahunan, lama_sewa_bulan: s.lama_sewa_bulan, bebas_sewa_bulan: s.bebas_sewa_bulan, deposit: s.deposit ?? 0, bagi_hasil_pct: s.bagi_hasil_pct ?? 0 };

  const tiga = tigaSkenario(asumsi, sewa, turun, naik);
  if (!tiga.dasar.lengkap) return { ok: false, pesan: `Lengkapi dulu: ${tiga.dasar.kurang.join(", ")}.` };
  // deret arus kas tidak disimpan: bisa dihitung ulang dari asumsi dan syarat sewanya
  const ringkas = (h: (typeof tiga)["dasar"]) => {
    const { arus_kas, kurang, harga_pokok, sewa_bulanan, bagi_hasil, ...sisa } = h;
    void arus_kas; void kurang; void harga_pokok; void sewa_bulanan; void bagi_hasil;
    return sisa;
  };
  return jalankan("kelayakan_simpan", {
    p_peluang_id: id,
    p_nama: teks(fd, "nama"),
    p_model: model,
    p_asumsi: { ...asumsi, turun_pct: turun, naik_pct: naik },
    p_hasil: { konservatif: ringkas(tiga.konservatif), dasar: ringkas(tiga.dasar), optimistis: ringkas(tiga.optimistis) },
  });
}

// ---------------------------------------------------------------- NFR

export async function bagikanPenawaran(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  const org = teks(fd, "organisasi");
  if (!UUID.test(id)) return { ok: false, pesan: "Peluang tidak dikenal." };
  if (org !== "" && !UUID.test(org)) return { ok: false, pesan: "Pilih organisasi tenant dulu." };
  if (org === "" && teks(fd, "niat") !== "hentikan") return { ok: false, pesan: "Pilih organisasi tenant dulu." };
  return jalankan("peluang_bagikan", { p_id: id, p_organisasi_id: org === "" ? null : org });
}

export async function buatOrganisasi(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const nilai = { nama: teks(fd, "nama"), jenis: teks(fd, "jenis") };
  return jalankan("organisasi_buat", { p_nama: nilai.nama, p_jenis: nilai.jenis }, nilai);
}

export async function aturAnggota(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const nilai = { email: teks(fd, "email"), organisasi: teks(fd, "organisasi"), peran: teks(fd, "peran") };
  if (!UUID.test(nilai.organisasi)) return { ok: false, pesan: "Pilih organisasinya dulu.", nilai, urut: Date.now() };
  return jalankan("keanggotaan_atur", { p_email: nilai.email, p_organisasi_id: nilai.organisasi, p_peran: nilai.peran }, nilai);
}

export async function hapusAnggota(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const org = teks(fd, "organisasi");
  if (!UUID.test(org)) return { ok: false, pesan: "Organisasi tidak dikenal." };
  return jalankan("keanggotaan_hapus", { p_email: teks(fd, "email"), p_organisasi_id: org });
}

// ---------------------------------------------------------------- wewenang SPBU (NFR)

export async function simpanWewenang(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const kunci = ["pola", "pemilik_aset", "pengelola", "organisasi_dealer", "dealer_berwenang", "penyetuju", "pihak_kontrak", "penerima_sewa", "bagi_hasil", "dokumen"];
  const nilai = Object.fromEntries(kunci.map((k) => [k, teks(fd, k)]));
  return jalankan("hak_spbu_simpan", { p_spbu_id: teks(fd, "spbu_id"), p: nilai }, nilai);
}

export async function pastikanWewenang(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  return jalankan("hak_spbu_pastikan", { p_spbu_id: teks(fd, "spbu_id") });
}

// ---------------------------------------------------------------- dealer

export async function konfirmasiRuang(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const nilai = { tersedia: teks(fd, "tersedia"), catatan: teks(fd, "catatan") };
  if (nilai.tersedia !== "ya" && nilai.tersedia !== "tidak") return { ok: false, pesan: "Pilih dulu: ruang ini bisa dipakai atau tidak." };
  return jalankan("dealer_konfirmasi_ruang", { p_lahan_id: teks(fd, "lahan_id"), p_tersedia: nilai.tersedia === "ya", p_catatan: nilai.catatan || null }, nilai);
}

export async function putuskanDealer(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Usulan tidak dikenal." };
  const nilai = { keputusan: teks(fd, "keputusan"), alasan: teks(fd, "alasan") };
  return jalankan("dealer_putuskan", { p_peluang_id: id, p_keputusan: nilai.keputusan, p_alasan: nilai.alasan || null }, nilai);
}
