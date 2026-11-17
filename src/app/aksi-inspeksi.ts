"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { StatusAksi } from "@/app/aksi";
import { rpc } from "@/lib/data";
import { UUID } from "@/lib/istilah";
import { hapusObjek } from "@/lib/r2";

/**
 * Penulisan status lahan dan inspeksi lokasi. Aturannya ada di basis data
 * (supabase/migrations/…_status_lahan.sql): siapa pemeriksa, butir wajib, tinjauan oleh orang lain.
 */
type Hasil = { ok: boolean; pesan: string; id?: string; kunci?: string };

const GAGAL = "Belum bisa disimpan. Coba lagi sebentar lagi.";
const teks = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Memulai (atau membuka kembali) inspeksi satu lahan, lalu membuka formulirnya. */
export async function mulaiInspeksi(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const hasil = await rpc<Hasil>("inspeksi_mulai", { p_lahan_id: teks(fd, "lahan_id") });
  if (hasil.galat || !hasil.data) return { ok: false, pesan: "Inspeksi belum bisa dimulai. Coba lagi sebentar lagi." };
  if (!hasil.data.ok || !hasil.data.id) return { ok: false, pesan: hasil.data.pesan };
  // Dari portal dealer, formulirnya dibuka di ruang kerja dealer.
  redirect(teks(fd, "asal") === "dealer" ? `/ruang-kerja/inspeksi/${hasil.data.id}` : `/inspeksi/${hasil.data.id}`);
}

/** Menyimpan draf; bila `niat` = ajukan, langsung mengajukannya untuk ditinjau. */
export async function simpanInspeksi(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Inspeksi tidak dikenal." };
  // Koma desimal diterima: "30,5" disimpan sebagai 30.5.
  const angka = (k: string) => teks(fd, k).replace(",", ".");
  const isi = {
    panjang_m: angka("panjang_m"),
    lebar_m: angka("lebar_m"),
    luas_m2: angka("luas_m2"),
    daya_w: angka("daya_w"),
    air: teks(fd, "air"),
    akses: teks(fd, "akses"),
    parkir: teks(fd, "parkir"),
    pembatasan: teks(fd, "pembatasan"),
    pembatasan_rinci: teks(fd, "pembatasan") === "ada" ? teks(fd, "pembatasan_rinci") : "",
    infrastruktur: teks(fd, "infrastruktur"),
    perubahan: teks(fd, "perubahan"),
    catatan: teks(fd, "catatan"),
  };
  const simpan = await rpc<Hasil>("inspeksi_simpan", { p_id: id, p_isi: isi, p_hasil: teks(fd, "hasil") || undefined });
  if (simpan.galat || !simpan.data) return { ok: false, pesan: GAGAL };
  if (!simpan.data.ok || teks(fd, "niat") !== "ajukan") {
    refresh();
    return simpan.data;
  }
  const ajukan = await rpc<Hasil>("inspeksi_ajukan", { p_id: id });
  refresh();
  if (ajukan.galat || !ajukan.data) return { ok: false, pesan: "Draf tersimpan, tetapi belum bisa diajukan. Coba ajukan lagi." };
  return ajukan.data;
}

export async function hapusFotoInspeksi(id: string): Promise<{ ok: boolean; pesan?: string }> {
  if (!UUID.test(id)) return { ok: false, pesan: "Foto tidak dikenal." };
  const hasil = await rpc<Hasil>("inspeksi_foto_hapus", { p_id: id });
  if (hasil.galat || !hasil.data) return { ok: false, pesan: "Foto belum bisa dihapus. Coba lagi sebentar lagi." };
  if (hasil.data.ok && hasil.data.kunci) await hapusObjek(hasil.data.kunci);
  return hasil.data;
}

export async function tinjauInspeksi(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  const nilai = { keputusan: teks(fd, "keputusan"), catatan: teks(fd, "catatan") };
  if (!UUID.test(id)) return { ok: false, pesan: "Inspeksi tidak dikenal." };
  const hasil = await rpc<Hasil>("inspeksi_tinjau", { p_id: id, p_keputusan: nilai.keputusan, p_catatan: nilai.catatan || undefined });
  if (hasil.galat || !hasil.data) return { ok: false, pesan: GAGAL, nilai, urut: Date.now() };
  if (!hasil.data.ok) return { ...hasil.data, nilai, urut: Date.now() };
  refresh();
  return hasil.data;
}

export async function ubahStatusRuang(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const nilai = { status: teks(fd, "status"), alasan: teks(fd, "alasan") };
  const hasil = await rpc<Hasil>("status_ruang_ubah", { p_lahan_id: teks(fd, "lahan_id"), p_status: nilai.status, p_alasan: nilai.alasan || undefined });
  if (hasil.galat || !hasil.data) return { ok: false, pesan: GAGAL, nilai, urut: Date.now() };
  if (!hasil.data.ok) return { ...hasil.data, nilai, urut: Date.now() };
  refresh();
  return hasil.data;
}
