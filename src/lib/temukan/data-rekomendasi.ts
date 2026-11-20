import "server-only";
import { rpc } from "@/lib/data";
import type { Keyakinan } from "@/lib/data-kecocokan";
import type { Analitik } from "@/lib/temukan/analitik";
import type { HasilLokasi, ProfilLokasi } from "@/lib/temukan/rekomendasi";
import type { PeluangSpbu } from "@/lib/temukan/rekomendasi-spbu";
import { kunciSesi } from "@/lib/temukan/sesi";
import type { Peran } from "@/lib/temukan/tipe";

/**
 * Pemanggilan fungsi rekomendasi di basis data. Syarat wajib dan skor dihitung di sana oleh mesin
 * kecocokan; berkas ini tidak menghitung apa pun.
 */

type Jawab = (Omit<HasilLokasi, "lokasi"> & { ok: true; lokasi: HasilLokasi["lokasi"] }) | { ok: false; pesan: string };

/** Lokasi yang lolos syarat, paling banyak 300 teratas menurut skor mesin. null bila tidak bisa dihitung. */
export async function getLokasi(p: ProfilLokasi): Promise<HasilLokasi | null> {
  const hasil = await rpc<Jawab>("temukan_lokasi", { p });
  if (hasil.galat || !hasil.data || !hasil.data.ok) return null;
  const { versi_model, sumber, jumlah, jumlah_lain, tertahan, lokasi } = hasil.data;
  return { versi_model, sumber, jumlah, jumlah_lain, tertahan, lokasi: Array.isArray(lokasi) ? lokasi : [] };
}

/** Hanya jumlah lokasi yang lolos, untuk menilai dampak melepas satu syarat. */
export async function getJumlahLokasi(p: ProfilLokasi): Promise<number | null> {
  const hasil = await rpc<Jawab>("temukan_lokasi", { p: { ...p, hanya_jumlah: true } });
  return hasil.galat || !hasil.data || !hasil.data.ok ? null : hasil.data.jumlah + hasil.data.jumlah_lain;
}

/** Keyakinan data untuk ruang yang sedang tampil (paling banyak 24). */
export async function getKeyakinanLokasi(ids: string[]): Promise<Record<string, Keyakinan>> {
  const hasil = await rpc<Record<string, Keyakinan>>("temukan_keyakinan", { p_lahan_ids: ids.slice(0, 24) });
  return hasil.galat || !hasil.data ? {} : hasil.data;
}

/** Jenis usaha dan calon untuk ruang di satu SPBU. null bila SPBU tidak ada atau tidak bisa dihitung. */
export async function getPeluangSpbu(spbuId: string, lahanIds: string[] | null): Promise<PeluangSpbu | null> {
  const hasil = await rpc<PeluangSpbu>("temukan_peluang_spbu", { p_spbu_id: spbuId, p_lahan_ids: lahanIds });
  return hasil.galat ? null : (hasil.data ?? null);
}

export type MinatSaya = { lahan_id: string; segmen: string | null; status: "baru" | "ditindaklanjuti"; dibuat: string };

/** Minat yang masih berjalan milik organisasi pengguna yang masuk. Kosong untuk pengunjung tanpa akun. */
export async function getMinatSaya(): Promise<MinatSaya[]> {
  const hasil = await rpc<MinatSaya[]>("temukan_minat_saya");
  return hasil.galat || !Array.isArray(hasil.data) ? [] : hasil.data;
}

// ------------------------------------------------------------------ analitik dan umpan balik (fase D)

export type UmpanSaya = { lahan_id: string; segmen: string | null; nilai: "sesuai" | "kurang"; alasan: string | null };

/** Penilaian yang sudah diberikan sesi ini, untuk menandai kartu. */
export async function getUmpanSaya(peran: Peran): Promise<UmpanSaya[]> {
  const hasil = await rpc<UmpanSaya[]>("temukan_umpan_saya", { p_token: await kunciSesi(), p_peran: peran });
  return hasil.galat || !Array.isArray(hasil.data) ? [] : hasil.data;
}

/**
 * Mencatat bahwa rekomendasi baru saja disusun, dengan jumlah hasilnya. Tanpa identitas; kegagalannya diabaikan,
 * karena analitik tidak boleh menggagalkan halaman.
 */
export async function catatRekomendasiDibuat(peran: Peran, data: { jumlah: number; jumlah_lain?: number; tertahan?: number; kosong: boolean }): Promise<void> {
  await rpc("temukan_peristiwa", { p_token: await kunciSesi(), p_peran: peran, p_peristiwa: "recommendation_generated", p_data: data });
}

/** Angka gabungan untuk tim NFR. null bila pemanggil bukan tim NFR. */
export const getAnalitikTemukan = (hari: number) => rpc<Analitik>("temukan_analitik", { p_hari: hari });
