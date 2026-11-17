"use server";

import { refresh } from "next/cache";
import type { StatusAksi } from "@/app/aksi";
import { rpc } from "@/lib/data";
import { UUID } from "@/lib/istilah";

/** Penulisan penjelajah lokasi dan minat lokasi. Aturannya ada di basis data (…_jelajah.sql). */
type Hasil = { ok: boolean; pesan: string };

const teks = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function jalankan(fungsi: string, args: Record<string, unknown>, nilai?: Record<string, string>): Promise<StatusAksi> {
  const hasil = await rpc<Hasil>(fungsi, args);
  if (hasil.galat || !hasil.data) return { ok: false, pesan: "Belum bisa disimpan. Coba lagi sebentar lagi.", nilai, urut: Date.now() };
  if (!hasil.data.ok) return { ok: false, pesan: hasil.data.pesan, nilai, urut: Date.now() };
  refresh();
  return { ok: true, pesan: hasil.data.pesan };
}

/** Admin NFR: provinsi mana yang boleh dijelajahi satu organisasi tenant. Tanpa centang = ditutup. */
export async function aturJelajah(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "organisasi_id");
  if (!UUID.test(id)) return { ok: false, pesan: "Organisasi tidak dikenal." };
  const provinsi = fd.getAll("provinsi").map(String).filter((x) => x.length > 0 && x.length <= 80);
  return jalankan("jelajah_atur", { p_organisasi_id: id, p_provinsi: provinsi });
}

/** Tenant: menyatakan minat pada satu ruang. Tidak mengikat. */
export async function minatiLokasi(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const lahanId = teks(fd, "lahan_id");
  if (lahanId === "" || lahanId.length > 80) return { ok: false, pesan: "Lokasi tidak dikenal." };
  const nilai = { catatan: teks(fd, "catatan") };
  return jalankan("tenant_minati", { p_lahan_id: lahanId, p_catatan: nilai.catatan || null }, nilai);
}

/** Tim NFR: menandai minat sedang ditindaklanjuti, atau menutupnya dengan alasan. */
export async function tanganiMinat(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Minat tidak dikenal." };
  const nilai = { status: teks(fd, "status"), catatan: teks(fd, "catatan") };
  return jalankan("minat_tangani", { p_id: id, p_status: nilai.status, p_catatan: nilai.catatan || null }, nilai);
}
