"use server";

import { refresh } from "next/cache";
import type { StatusAksi } from "@/app/aksi";
import { rpc } from "@/lib/data";
import { UUID } from "@/lib/istilah";

/** Penulisan jadwal survei lokasi. Aturannya ada di basis data (…_survei.sql). */
type Hasil = { ok: boolean; pesan: string };

const teks = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

async function jalankan(fungsi: string, args: Record<string, unknown>, nilai?: Record<string, string>): Promise<StatusAksi> {
  const hasil = await rpc<Hasil>(fungsi, args);
  if (hasil.galat || !hasil.data) return { ok: false, pesan: "Belum bisa disimpan. Coba lagi sebentar lagi.", nilai, urut: Date.now() };
  if (!hasil.data.ok) return { ok: false, pesan: hasil.data.pesan, nilai, urut: Date.now() };
  refresh();
  return { ok: true, pesan: hasil.data.pesan };
}

// ---------------------------------------------------------------- tenant

export async function mintaSurvei(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Penawaran tidak dikenal." };
  const nilai: Record<string, string> = { catatan: teks(fd, "catatan") };
  const usulan: { tanggal: string; waktu: string }[] = [];
  for (const i of [1, 2, 3]) {
    nilai[`tanggal${i}`] = teks(fd, `tanggal${i}`);
    nilai[`waktu${i}`] = teks(fd, `waktu${i}`);
    if (nilai[`tanggal${i}`] === "") continue;
    if (!TANGGAL.test(nilai[`tanggal${i}`])) return { ok: false, pesan: "Salah satu tanggal belum terbaca. Pilih lagi tanggalnya.", nilai, urut: Date.now() };
    usulan.push({ tanggal: nilai[`tanggal${i}`], waktu: nilai[`waktu${i}`] });
  }
  return jalankan("tenant_survei_minta", { p_peluang_id: id, p_usulan: usulan, p_catatan: nilai.catatan || null }, nilai);
}

export async function batalkanSurveiTenant(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Penawaran tidak dikenal." };
  const nilai = { alasan: teks(fd, "alasan") };
  return jalankan("tenant_survei_batalkan", { p_peluang_id: id, p_alasan: nilai.alasan || null }, nilai);
}

// ---------------------------------------------------------------- tim NFR

export async function jadwalkanSurvei(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Peluang tidak dikenal." };
  const nilai = { tanggal: teks(fd, "tanggal"), jam: teks(fd, "jam"), pendamping: teks(fd, "pendamping"), catatan: teks(fd, "catatan") };
  if (!TANGGAL.test(nilai.tanggal)) return { ok: false, pesan: "Isi tanggal survei.", nilai, urut: Date.now() };
  return jalankan(
    "survei_jadwalkan",
    { p_peluang_id: id, p_tanggal: nilai.tanggal, p_jam: nilai.jam.slice(0, 5), p_pendamping: nilai.pendamping, p_catatan: nilai.catatan || null },
    nilai,
  );
}

export async function selesaikanSurvei(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Survei tidak dikenal." };
  const nilai = { hasil: teks(fd, "hasil") };
  return jalankan("survei_selesai", { p_id: id, p_hasil: nilai.hasil }, nilai);
}

export async function batalkanSurvei(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Survei tidak dikenal." };
  const nilai = { alasan: teks(fd, "alasan") };
  return jalankan("survei_batalkan", { p_id: id, p_alasan: nilai.alasan }, nilai);
}

// ---------------------------------------------------------------- pengelola SPBU

export async function ketahuiSurvei(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Jadwal survei tidak dikenal." };
  return jalankan("dealer_survei_ketahui", { p_id: id });
}
