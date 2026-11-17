"use server";

import { refresh } from "next/cache";
import type { StatusAksi } from "@/app/aksi";
import { rpc } from "@/lib/data";
import { UUID } from "@/lib/istilah";

/**
 * Penulisan alur komersial: tindak lanjut, penawaran berversi, persetujuan, tanda tangan, dan aktivasi.
 * Aturannya ada di basis data (supabase/migrations/…_alur_komersial.sql).
 */
type Hasil = { ok: boolean; pesan: string; id?: string };

const GAGAL = "Belum bisa disimpan. Coba lagi sebentar lagi.";
const teks = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** Menjalankan satu fungsi basis data dan mengembalikan pesannya; isian dikembalikan saat ditolak. */
async function jalankan(fungsi: string, args: Record<string, unknown>, nilai?: Record<string, string>): Promise<StatusAksi> {
  const hasil = await rpc<Hasil>(fungsi, args);
  if (hasil.galat || !hasil.data) return { ok: false, pesan: GAGAL, nilai, urut: Date.now() };
  if (!hasil.data.ok) return { ok: false, pesan: hasil.data.pesan, nilai, urut: Date.now() };
  refresh();
  return { ok: true, pesan: hasil.data.pesan };
}

export async function simpanTindakLanjut(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Peluang tidak dikenal." };
  const tenggat = teks(fd, "tenggat");
  return jalankan("peluang_tindak_lanjut", {
    p_id: id,
    p_pemilik: teks(fd, "pemilik") || null,
    p_tindakan: teks(fd, "tindakan") || null,
    p_tenggat: TANGGAL.test(tenggat) ? tenggat : null,
  });
}

/** Angka rupiah boleh diketik dengan titik ribuan: "62.000.000" disimpan sebagai 62000000. */
const rupiah = (v: string) => v.replace(/[.\s]/g, "").replace(",", ".");

export async function simpanPenawaran(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "peluang_id");
  if (!UUID.test(id)) return { ok: false, pesan: "Peluang tidak dikenal." };
  const nilai = Object.fromEntries(
    ["sewa_tahunan", "lama_sewa_bulan", "skema", "bagi_hasil_pct", "deposit", "bebas_sewa_bulan", "mulai_rencana", "penerima_sewa", "catatan"].map(
      (k) => [k, teks(fd, k)],
    ),
  );
  return jalankan(
    "penawaran_simpan",
    {
      p_peluang_id: id,
      p: {
        ...nilai,
        sewa_tahunan: rupiah(nilai.sewa_tahunan),
        deposit: rupiah(nilai.deposit),
        bagi_hasil_pct: nilai.skema === "sewa_tetap" ? "" : nilai.bagi_hasil_pct.replace(",", "."),
      },
    },
    nilai,
  );
}

export async function terbitkanPenawaran(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Versi penawaran tidak dikenal." };
  return jalankan("penawaran_terbitkan", { p_id: id });
}

export async function putuskanPersetujuan(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Persetujuan tidak dikenal." };
  const nilai = { keputusan: teks(fd, "keputusan"), alasan: teks(fd, "alasan"), bukti: teks(fd, "bukti"), wewenang: teks(fd, "wewenang") };
  return jalankan(
    "persetujuan_putuskan",
    { p_id: id, p_keputusan: nilai.keputusan, p_alasan: nilai.alasan || null, p_bukti: nilai.bukti || null, p_wewenang: nilai.wewenang || null },
    nilai,
  );
}

export async function hitungUlangSkor(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Peluang tidak dikenal." };
  return jalankan("peluang_potret_ulang", { p_id: id });
}

export async function catatTandaTangan(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Peluang tidak dikenal." };
  const nilai = { tanggal: teks(fd, "tanggal"), nomor: teks(fd, "nomor") };
  return jalankan("kontrak_catat_tanda_tangan", { p_peluang_id: id, p_tanggal: TANGGAL.test(nilai.tanggal) ? nilai.tanggal : null, p_nomor: nilai.nomor }, nilai);
}

export async function catatAktif(_sebelumnya: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const id = teks(fd, "id");
  if (!UUID.test(id)) return { ok: false, pesan: "Peluang tidak dikenal." };
  const nilai = { tanggal: teks(fd, "tanggal") };
  return jalankan("kontrak_catat_aktif", { p_peluang_id: id, p_tanggal: TANGGAL.test(nilai.tanggal) ? nilai.tanggal : null }, nilai);
}
