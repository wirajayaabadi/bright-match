import { rpc } from "@/lib/data";
import type { Gambar } from "@/lib/gambar";

/** Foto SPBU dan foto tiap lahannya. Kunci `lahan` = id lahan di Brightspace. */
export type GambarSpbu = { spbu: Gambar[]; lahan: Record<string, Gambar[]> };

/** Foto satu lahan dan foto SPBU tempatnya berada. */
export type GambarLahan = { lahan: Gambar[]; spbu: Gambar[] };

export const getGambarSpbu = (id: string) => rpc<GambarSpbu>("gambar_spbu", { p_id: id });

export const getGambarLahan = (lahanId: string) => rpc<GambarLahan>("gambar_lahan", { p_lahan_id: lahanId });

/** Foto untuk satu halaman daftar. Kunci `spbu` = id SPBU, kunci `lahan` = id lahan di Brightspace. */
export type GambarDaftar = { spbu: Record<string, Gambar[]>; lahan: Record<string, Gambar[]> };

const KOSONG: GambarDaftar = { spbu: {}, lahan: {} };

/**
 * Foto pelengkap untuk tabel daftar. Bila gagal (misalnya migrasinya belum dipasang), daftar tetap tampil
 * tanpa foto, jadi galatnya tidak diteruskan.
 */
export async function getGambarDaftar(p: { spbu?: string[]; lahan?: string[] }): Promise<GambarDaftar> {
  if (!p.spbu?.length && !p.lahan?.length) return KOSONG;
  const hasil = await rpc<GambarDaftar>("gambar_daftar", { p_spbu: p.spbu, p_lahan: p.lahan });
  return hasil.data ?? KOSONG;
}

/** Satu foto per lahan yang disewa tenant, terbaru dulu (paling banyak 60), beserta cakupannya. */
export type GambarTenant = { lahan: number; lahan_berfoto: number; outlet: Gambar[] };

export const getGambarTenant = (id: string) => rpc<GambarTenant>("gambar_tenant", { p_id: id });
