import { rpc } from "@/lib/data";
import type { Keyakinan } from "@/lib/data-kecocokan";
import type { Pasangan } from "@/lib/data-tahap1";
import type { VersiPenawaran } from "@/lib/data-tahap3";
import type { Gambar } from "@/lib/gambar";
import type { TipeLokasi } from "@/lib/tipe-lokasi";

/** Portal tenant dan pengelolaan organisasi (migrasi 20261125_portal_tenant). */

export const STATUS_TENANT: Record<string, string> = {
  ditawarkan: "Ditawarkan",
  menunggu_persetujuan: "Menunggu persetujuan Anda",
  tanda_tangan: "Menuju tanda tangan",
  berjalan: "Berjalan",
  berakhir: "Berakhir",
};

export const JENIS_TANGGAPAN: Record<string, string> = {
  berminat: "Menyatakan berminat",
  minta_survei: "Meminta survei lokasi",
  tanya: "Bertanya",
  menolak: "Menolak",
};

export type BarisPenawaranTenant = {
  id: string;
  lahan_kode: string;
  spbu_nomor: string;
  kota: string | null;
  provinsi: string | null;
  dibagikan: string;
  status: string;
  organisasi: string;
  versi: number;
  sewa_tahunan: number;
  lama_sewa_bulan: number;
  luas_m2: number | null;
  posisi: string | null;
  foto: string | null;
  tanggapan_terakhir: string | null;
};

export type Tanggapan = { jenis: string; pesan: string | null; oleh: string | null; waktu: string };

export type PenawaranTenant = {
  id: string;
  lahan_kode: string;
  status: string;
  dibagikan: string;
  pihak: string | null;
  segmen: string | null;
  peran_saya: string;
  spbu: { nomor: string; alamat: string | null; kota: string | null; provinsi: string; lat: number | null; lng: number | null; fasilitas: string[] };
  ruang: {
    luas_m2: number | null;
    panjang_m: number | null;
    lebar_m: number | null;
    tinggi_m: number | null;
    posisi: string | null;
    lantai: string | null;
    daya_w: number | null;
  } | null;
  foto_lahan: Gambar[];
  foto_spbu: Gambar[];
  syarat: Omit<VersiPenawaran, "id" | "dibuat" | "dibuat_oleh" | "diterbitkan_oleh">;
  lingkungan: { tipe_lokasi: TipeLokasi; penduduk_3km: number; poi_1km: number } | null;
  terdekat: { nama: string; jenis: string; jarak_m: number }[];
  usaha_ada: string[];
  kecocokan: { skor: number | null; lolos: boolean; versi_model: string; dihitung: string; rinci: Pasangan | null } | null;
  keyakinan: Keyakinan | null;
  kesiapan: { kesiapan: string; status_data: string; pembatasan: string | null } | null;
  sumber: { nama: string; per_tanggal: string | null }[];
  persetujuan: { id: string; status: string; diputuskan: string | null; alasan: string | null } | null;
  boleh_putuskan: boolean;
  tanggapan: Tanggapan[];
};

export const getPenawaranTenant = () => rpc<BarisPenawaranTenant[]>("tenant_penawaran_daftar");
export const getPenawaranTenantRinci = (id: string) => rpc<PenawaranTenant>("tenant_penawaran_rinci", { p_peluang_id: id });

export type PortalPeluang = {
  organisasi: { id: string; nama: string; demo: boolean } | null;
  dibagikan: string | null;
  dibagikan_oleh: string | null;
  pilihan: { id: string; nama: string; demo: boolean }[];
  tanggapan: Tanggapan[];
};

export const getPortalPeluang = (id: string) => rpc<PortalPeluang>("peluang_portal", { p_id: id });

export type Organisasi = {
  id: string;
  nama: string;
  jenis: "nfr" | "tenant" | "dealer";
  demo: boolean;
  anggota: { email: string; peran: string }[];
  peluang: number;
  /** Provinsi yang dibuka untuk penjelajah lokasi organisasi tenant ini. */
  jelajah: string[];
};

export const getOrganisasi = () => rpc<Organisasi[]>("organisasi_daftar");

// ------------------------------------------------------------------ studio kelayakan

/** Ringkasan satu skenario yang disimpan: angka utama saja, tanpa deret arus kas. */
export type RingkasHasil = {
  lengkap: boolean;
  pendapatan: number;
  laba_kotor: number;
  biaya_operasi: number;
  laba_operasi: number;
  investasi_awal: number;
  titik_impas: number | null;
  balik_modal_bulan: number | null;
  kumulatif_akhir: number;
  npv: number | null;
  irr_pct: number | null;
};

export type SkenarioTersimpan = {
  id: string;
  versi: number;
  nama: string;
  model: "ritel" | "ev" | "atm" | "umum";
  penawaran_versi: number;
  sewa: { sewa_tahunan: number; lama_sewa_bulan: number; bebas_sewa_bulan: number; deposit: number; bagi_hasil_pct: number };
  asumsi: Record<string, number | boolean | string>;
  hasil: { konservatif: RingkasHasil; dasar: RingkasHasil; optimistis: RingkasHasil };
  dibuat: string;
  dibuat_oleh: string | null;
};

export const getSkenarioKelayakan = (peluangId: string) => rpc<SkenarioTersimpan[]>("kelayakan_daftar", { p_peluang_id: peluangId });

// ------------------------------------------------------------------ banding lokasi

/** Satu penawaran di halaman banding: isi rincian penawaran tanpa bagian yang tidak dibandingkan. */
export type PenawaranBanding = Omit<PenawaranTenant, "foto_spbu" | "tanggapan" | "sumber" | "terdekat" | "persetujuan" | "boleh_putuskan" | "peran_saya"> & {
  /** Skenario kelayakan terbaru milik organisasi pengguna; null bila belum pernah disimpan. */
  kelayakan: { versi: number; nama: string; model: string; penawaran_versi: number; dibuat: string; dasar: Partial<RingkasHasil> | null } | null;
};

export type Banding = {
  daftar: BarisPenawaranTenant[];
  sumber: { nama: string; per_tanggal: string | null }[];
  banding: PenawaranBanding[];
};

/** Tanpa id: tiga penawaran terbaru yang belum berakhir. Paling banyak tiga yang dikembalikan. */
export const getBanding = (ids: string[]) => rpc<Banding>("tenant_penawaran_banding", { p_ids: ids });
