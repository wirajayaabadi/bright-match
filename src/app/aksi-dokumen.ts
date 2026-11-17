"use server";

import { refresh } from "next/cache";
import type { StatusAksi } from "@/app/aksi";
import { rpc } from "@/lib/data";
import { UUID } from "@/lib/istilah";

/** Menarik dokumen dan mengatur keterlihatannya. Unggahannya sendiri lewat rute /api/peluang/[id]/dokumen. */
type Hasil = { ok: boolean; pesan: string };

const teks = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function jalankan(fungsi: string, args: Record<string, unknown>, nilai?: Record<string, string>): Promise<StatusAksi> {
  const hasil = await rpc<Hasil>(fungsi, args);
  if (hasil.galat || !hasil.data) return { ok: false, pesan: "Belum bisa disimpan. Coba lagi sebentar lagi.", nilai, urut: Date.now() };
  if (!hasil.data.ok) return { ok: false, pesan: hasil.data.pesan, nilai, urut: Date.now() };
  refresh();
  return { ok: true, pesan: hasil.data.pesan };
}

export async function tarikDokumen(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Dokumen tidak dikenal." };
  const nilai = { alasan: teks(fd, "alasan") };
  return jalankan("dokumen_tarik", { p_id: id, p_alasan: nilai.alasan || null }, nilai);
}

export async function aturTampakDokumen(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Dokumen tidak dikenal." };
  return jalankan("dokumen_atur_tampak", { p_id: id, p_tenant: fd.get("tampak_tenant") === "ya", p_dealer: fd.get("tampak_dealer") === "ya" });
}
