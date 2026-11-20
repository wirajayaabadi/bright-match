import { DEALER_V1 } from "./dealer-v1.ts";
import { TENANT_V1 } from "./tenant-v1.ts";
import type { Kuesioner, Peran } from "./tipe.ts";

/**
 * Daftar versi kuesioner. Versi baru ditambahkan di sini tanpa mengubah wizard; sesi lama yang
 * memakai versi yang sudah tidak ada dibersihkan terhadap versi terbaru saat dibuka lagi.
 */
const VERSI: Record<Peran, Kuesioner[]> = {
  tenant: [TENANT_V1],
  dealer: [DEALER_V1],
};

export const PERAN: Peran[] = ["tenant", "dealer"];

export const adalahPeran = (v: unknown): v is Peran => v === "tenant" || v === "dealer";

/** Kuesioner terbaru untuk satu peran. */
export const kuesioner = (peran: Peran): Kuesioner => VERSI[peran][VERSI[peran].length - 1];

export const NAMA_PERAN: Record<Peran, { judul: string; singkat: string }> = {
  tenant: { judul: "Mencari lokasi usaha", singkat: "Pencarian lokasi" },
  dealer: { judul: "Mengembangkan ruang SPBU", singkat: "Pengembangan SPBU" },
};
