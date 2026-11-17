"use server";

import { refresh } from "next/cache";
import type { StatusAksi } from "@/app/aksi";
import { rpc } from "@/lib/data";

/**
 * Penulisan data pusat validasi. Aturannya ada di basis data (supabase/migrations/…_fondasi.sql):
 * siapa yang boleh memutuskan, alasan wajib, dan pencatatan jejak audit.
 */
type Hasil = { ok: boolean; pesan: string };

const GAGAL = "Belum bisa disimpan. Coba lagi sebentar lagi.";

export async function periksaUlangData(): Promise<StatusAksi> {
  const hasil = await rpc<{ baru: number; ditutup_otomatis: number; dibuka_kembali: number }>("deteksi_masalah_data");
  if (hasil.galat || !hasil.data) return { ok: false, pesan: "Data belum bisa diperiksa ulang. Coba lagi sebentar lagi." };
  refresh();
  const { baru, ditutup_otomatis: tutup, dibuka_kembali: buka } = hasil.data;
  return {
    ok: true,
    pesan:
      baru + tutup + buka === 0
        ? "Data sudah diperiksa ulang. Tidak ada perubahan."
        : `Data sudah diperiksa ulang: ${baru} temuan baru, ${tutup} tertutup sendiri, ${buka} dibuka kembali.`,
  };
}

export async function tinjauMasalah(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, pesan: "Temuan tidak dikenal." };
  const hasil = await rpc<Hasil>("masalah_tinjau", { p_id: id });
  if (hasil.galat || !hasil.data) return { ok: false, pesan: GAGAL };
  refresh();
  return hasil.data;
}

export async function putuskanMasalah(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = Number(fd.get("id"));
  const status = String(fd.get("status") ?? "");
  const alasan = String(fd.get("alasan") ?? "").trim();
  const nilai = { status, alasan };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, pesan: "Temuan tidak dikenal." };
  const hasil = await rpc<Hasil>("masalah_putuskan", { p_id: id, p_status: status, p_keputusan: alasan });
  if (hasil.galat || !hasil.data) return { ok: false, pesan: GAGAL, nilai, urut: Date.now() };
  if (!hasil.data.ok) return { ...hasil.data, nilai, urut: Date.now() };
  refresh();
  return hasil.data;
}
