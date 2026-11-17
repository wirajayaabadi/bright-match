import { rpc } from "@/lib/data";
import type { Pasangan } from "@/lib/data-tahap1";

/** Potret skor per peluang dan keyakinan data lahan (migrasi 20261124_potret_skor). */

export type Keyakinan = {
  tingkat: "tinggi" | "sedang" | "rendah";
  terpenuhi: number;
  total: number;
  butir: { nama: string; ok: boolean }[];
};

export type PotretSkor = {
  id: number;
  versi_model: string;
  lolos: boolean;
  skor: number | null;
  /** Baris lengkap dari kecocokan() saat dihitung; null bila pasangan tidak memenuhi syarat wajib. */
  rinci: Pasangan | null;
  keyakinan: Keyakinan;
  sumber: { kunci: string; nama: string; per_tanggal: string | null }[];
  dihitung: string;
  dihitung_oleh: string | null;
};

export type KecocokanPeluang = { potret: PotretSkor | null; jumlah: number; keyakinan_kini: Keyakinan | null };

export const getPeluangKecocokan = (id: string) => rpc<KecocokanPeluang>("peluang_kecocokan", { p_id: id });

export const getKeyakinanData = (lahanId: string) => rpc<Keyakinan>("keyakinan_data", { p_lahan_id: lahanId });

export const TINGKAT_KEYAKINAN: Record<Keyakinan["tingkat"], { nama: string; arti: string }> = {
  tinggi: { nama: "Tinggi", arti: "Lahan sudah diverifikasi di lokasi dan datanya lengkap." },
  sedang: { nama: "Sedang", arti: "Sebagian data sudah ada, tetapi belum semuanya dipastikan." },
  rendah: { nama: "Rendah", arti: "Data lahan masih bermasalah atau banyak yang kosong." },
};
