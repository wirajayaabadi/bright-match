import { rpc } from "@/lib/data";
import type { Jelajah, MinatLokasi, PilihanProvinsi } from "@/lib/jelajah";

export type SaringJelajah = { provinsi?: string; kota?: string; luasMin?: number; posisi?: string; halaman?: number };

/** Ruang yang boleh dijelajahi organisasi tenant pengguna. Kosong bila penjelajah belum dibuka untuknya. */
export const getJelajah = (s: SaringJelajah) =>
  rpc<Jelajah>("tenant_jelajah", {
    p_provinsi: s.provinsi ?? null,
    p_kota: s.kota ?? null,
    p_luas_min: s.luasMin ?? null,
    p_posisi: s.posisi ?? null,
    p_halaman: s.halaman ?? 1,
  });

/** Provinsi yang bisa dibuka admin NFR, dengan jumlah ruang yang saat ini layak tampil. */
export const getPilihanJelajah = () => rpc<PilihanProvinsi[]>("jelajah_pilihan");

/** Minat lokasi dari tenant untuk tim NFR. `status` null = semua. */
export const getMinat = (status: string | null) => rpc<MinatLokasi[]>("minat_daftar", { p_status: status });
