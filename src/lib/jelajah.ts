/** Penjelajah lokasi tenant dan minat lokasi (migrasi 20261203_jelajah). Tanpa ketergantungan server. */

import type { TipeLokasi } from "@/lib/tipe-lokasi";

export type LokasiJelajah = {
  lahan_id: string;
  kode: string;
  spbu_nomor: string;
  alamat: string | null;
  kota: string | null;
  provinsi: string;
  luas_m2: number | null;
  posisi: string | null;
  lantai: string | null;
  daya_w: number | null;
  kesiapan: string;
  jumlah_fasilitas: number;
  tipe_lokasi: TipeLokasi | null;
  penduduk_3km: number | null;
  poi_1km: number | null;
  foto: string | null;
  /** Penawaran yang sudah dibagikan ke organisasi ini untuk ruang ini, bila ada. */
  penawaran_id: string | null;
  /** Kapan organisasi ini menyatakan minat yang masih berjalan, bila ada. */
  diminati: string | null;
};

export type Jelajah = {
  /** Provinsi yang dibuka admin NFR untuk organisasi ini. Kosong = penjelajah belum dibuka. */
  akses: string[];
  total: number;
  halaman: number;
  per_halaman: number;
  kota: { provinsi: string; kota: string }[];
  lokasi: LokasiJelajah[];
};

export type PilihanProvinsi = { provinsi: string; layak: number };

export type MinatLokasi = {
  id: string;
  status: "baru" | "ditindaklanjuti" | "ditutup";
  lahan_id: string;
  lahan_kode: string;
  spbu_id: string;
  spbu_nomor: string;
  catatan: string | null;
  dibuat: string;
  dibuat_oleh: string | null;
  ditangani: string | null;
  ditangani_oleh: string | null;
  catatan_nfr: string | null;
  organisasi_id: string;
  organisasi: string;
  demo: boolean;
  kota: string | null;
  provinsi: string | null;
  luas_m2: number | null;
  peluang_id: string | null;
};

export const STATUS_MINAT: Record<MinatLokasi["status"], { nama: string; warna: "netral" | "biru" | "kuning" }> = {
  baru: { nama: "Baru", warna: "kuning" },
  ditindaklanjuti: { nama: "Sedang ditindaklanjuti", warna: "biru" },
  ditutup: { nama: "Ditutup", warna: "netral" },
};
