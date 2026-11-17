import { rpc } from "@/lib/data";
import type { DaftarMasalah, MasalahLahan, ProfilSaya, RincianMasalah, RingkasanMasalah } from "@/lib/validasi";

/** Kueri pusat validasi data dan profil pengguna (migrasi 20261120_fondasi). */

export const getProfilSaya = () => rpc<ProfilSaya>("profil_saya");

export const getMasalahRingkasan = () => rpc<RingkasanMasalah>("masalah_ringkasan");

export const getMasalahDaftar = (p: { status?: string; tingkat?: string; jenis?: string; cari?: string; halaman?: number }) =>
  rpc<DaftarMasalah>("masalah_daftar", {
    p_status: p.status,
    p_tingkat: p.tingkat,
    p_jenis: p.jenis,
    p_cari: p.cari,
    p_halaman: p.halaman,
  });

export const getMasalahRinci = (id: number) => rpc<RincianMasalah>("masalah_rinci", { p_id: id });

/** Temuan yang belum diputuskan untuk satu lahan. Kosong bila gagal dimuat: peringatan bersifat pelengkap di halaman lain. */
export async function getMasalahLahan(lahanId: string): Promise<MasalahLahan[]> {
  const hasil = await rpc<MasalahLahan[]>("masalah_lahan", { p_lahan_id: lahanId });
  return hasil.data ?? [];
}
