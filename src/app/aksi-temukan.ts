"use server";

import { cookies } from "next/headers";
import { rpc } from "@/lib/data";
import { intiLengkap, langkahAktif } from "@/lib/temukan/cabang";
import type { Keyakinan } from "@/lib/data-kecocokan";
import { getKeyakinanLokasi } from "@/lib/temukan/data-rekomendasi";
import { adalahPeran, kuesioner } from "@/lib/temukan/kuesioner";
import { bersihkan } from "@/lib/temukan/periksa";
import { bersihkanDiminati, cariSpbuUmum, getSpbuUmum, KUKI_TEMUKAN, kunciSesi, kunciSesiAtauBaru } from "@/lib/temukan/sesi";
import type { Potret, SpbuRinci, SpbuUmum } from "@/lib/temukan/tipe";

/**
 * Penulisan Temukan peluang. Semua aksi di sini terbuka untuk pengunjung tanpa akun, jadi tiap masukan
 * dianggap belum dipercaya: jawaban dibersihkan terhadap kuesioner sebelum disimpan, dan tidak ada aksi
 * yang menyentuh data komersial. Tindakan resmi (minat, penawaran) tetap butuh akun dan haknya sendiri.
 */

export type HasilSimpan =
  | { ok: true; ditolak: string[] }
  | { ok: false; kode: "isi" | "ramai" | "batas" | "galat"; pesan: string };

export async function simpanTemukan(masukan: {
  peran: string;
  langkah: string | null;
  jawaban: unknown;
  dilewati: unknown;
  selesai?: boolean;
}): Promise<HasilSimpan> {
  if (!masukan || !adalahPeran(masukan.peran)) return { ok: false, kode: "isi", pesan: "Peran tidak dikenal." };
  const k = kuesioner(masukan.peran);
  const b = bersihkan(k, masukan.jawaban, masukan.dilewati);
  const langkah = langkahAktif(k, b.jawaban).some((p) => p.id === masukan.langkah) ? masukan.langkah : null;
  // "Selesai" hanya berlaku bila semua pertanyaan inti memang terjawab dengan sah.
  const selesai = masukan.selesai === true && intiLengkap(k, b.jawaban);

  const hasil = await rpc<{ ok: boolean; kode?: string; pesan?: string }>("temukan_simpan", {
    p_token: await kunciSesiAtauBaru(),
    p_peran: masukan.peran,
    p_versi: k.versi,
    p_langkah: langkah,
    p_jawaban: b.jawaban,
    p_dilewati: b.dilewati,
    p_selesai: selesai,
  });
  if (hasil.galat || !hasil.data) return { ok: false, kode: "galat", pesan: "Jawaban belum tersimpan. Kami coba lagi saat Anda melanjutkan." };
  if (!hasil.data.ok) {
    const kode = hasil.data.kode === "ramai" || hasil.data.kode === "batas" ? hasil.data.kode : "galat";
    return { ok: false, kode, pesan: hasil.data.pesan ?? "Jawaban belum tersimpan." };
  }
  return { ok: true, ditolak: b.ditolak };
}

/** "Mulai ulang": menghapus jawaban satu peran. Cookie dihapus bila tidak ada sesi yang tersisa. */
export async function hapusTemukan(peran: string): Promise<{ ok: boolean }> {
  if (!adalahPeran(peran)) return { ok: false };
  // Dipanggil juga tanpa cookie: pengguna yang masuk bisa punya preferensi atas akunnya.
  const kunci = await kunciSesi();
  const hasil = await rpc<{ ok: boolean }>("temukan_hapus", { p_token: kunci, p_peran: peran });
  if (hasil.galat) return { ok: false };
  if (kunci) {
    const sisa = await rpc<unknown[]>("temukan_sesi", { p_token: kunci });
    if (!sisa.galat && Array.isArray(sisa.data) && sisa.data.length === 0) (await cookies()).delete(KUKI_TEMUKAN);
  }
  return { ok: true };
}

/** Pencarian SPBU dari nomor, alamat, atau kota. Hanya alamat SPBU yang dikembalikan. */
export async function cariSpbu(cari: string): Promise<SpbuUmum[]> {
  if (typeof cari !== "string") return [];
  const k = cari.trim().slice(0, 60);
  return k.length < 3 ? [] : cariSpbuUmum(k);
}

/** Satu SPBU dengan ruang kosongnya, untuk langkah memilih ruang. */
export async function muatSpbu(id: string): Promise<SpbuRinci | null> {
  if (typeof id !== "string" || id === "" || id.length > 80) return null;
  return getSpbuUmum(id);
}

/** Keyakinan data untuk lokasi yang sedang tampil di halaman hasil. Hanya ruang yang memang boleh tampil untuk umum. */
export async function muatKeyakinan(ids: string[]): Promise<Record<string, Keyakinan>> {
  if (!Array.isArray(ids)) return {};
  const sah = ids.filter((x): x is string => typeof x === "string" && x !== "" && x.length <= 80).slice(0, 24);
  return sah.length === 0 ? {} : getKeyakinanLokasi(sah);
}

// ------------------------------------------------------------------ tindakan dari rekomendasi (fase C)

export type HasilTindak = { ok: boolean; pesan: string; kode?: string };

const GAGAL: HasilTindak = { ok: false, pesan: "Belum bisa disimpan. Periksa sambungan Anda, lalu coba lagi." };
const teksPendek = (v: unknown, maks: number) => (typeof v === "string" ? v.trim().slice(0, maks) : "");

/**
 * Menandai lokasi untuk diteruskan saat mendaftar sebagai Bright Partner. Bukan minat resmi: hanya daftar
 * di sesi pengunjung. Tiap lokasi diperiksa lagi di basis data saat benar-benar diteruskan.
 */
export async function tandaiLokasi(daftar: unknown): Promise<HasilTindak> {
  const bersih = bersihkanDiminati(daftar);
  const hasil = await rpc<{ ok: boolean; pesan?: string }>("temukan_tandai", { p_token: await kunciSesi(), p_diminati: bersih });
  if (hasil.galat || !hasil.data) return GAGAL;
  return { ok: hasil.data.ok, pesan: hasil.data.pesan ?? "" };
}

/** Tenant berakun: menyatakan minat pada satu lokasi. Haknya diperiksa basis data, bukan di sini. */
export async function nyatakanMinat(masukan: { lahanId: string; catatan: string; potret: Potret }): Promise<HasilTindak> {
  const lahanId = teksPendek(masukan?.lahanId, 80);
  if (lahanId === "") return { ok: false, pesan: "Lokasi tidak dikenal." };
  const hasil = await rpc<HasilTindak>("temukan_minati", { p_lahan_id: lahanId, p_catatan: teksPendek(masukan.catatan, 500) || null, p_potret: masukan.potret ?? null });
  // Pengunjung tanpa akun tidak punya hak memanggil fungsi ini sama sekali.
  if (hasil.galat) return { ok: false, kode: "akun", pesan: "Masuk dengan akun tenant untuk menyatakan minat." };
  return hasil.data ?? GAGAL;
}

/** Pengelola SPBU berwenang: mengajukan ketertarikan pada satu jenis usaha untuk satu ruang. */
export async function ajukanUsaha(masukan: { spbuId: string; lahanId: string; segmen: string; catatan: string; potret: Potret }): Promise<HasilTindak> {
  const spbuId = teksPendek(masukan?.spbuId, 80);
  const lahanId = teksPendek(masukan?.lahanId, 80);
  const segmen = teksPendek(masukan?.segmen, 60);
  if (spbuId === "" || lahanId === "" || segmen === "") return { ok: false, pesan: "Ruang atau jenis usaha tidak dikenal." };
  const hasil = await rpc<HasilTindak>("temukan_minati_usaha", {
    p_spbu_id: spbuId,
    p_lahan_id: lahanId,
    p_segmen: segmen,
    p_catatan: teksPendek(masukan.catatan, 500) || null,
    p_potret: masukan.potret ?? null,
  });
  if (hasil.galat) return { ok: false, kode: "wewenang", pesan: "Masuk dengan akun pengelola SPBU untuk mengajukan ketertarikan." };
  return hasil.data ?? GAGAL;
}

// ------------------------------------------------------------------ analitik dan umpan balik (fase D)

/**
 * Peristiwa tampilan dari halaman hasil: rekomendasi dilihat atau diklik. Hanya dua nama ini yang diterima;
 * perjalanan kuesioner dan minat dicatat basis data sendiri. Tidak pernah melempar galat ke halaman.
 */
export async function catatPeristiwa(peran: string, peristiwa: "recommendation_viewed" | "recommendation_clicked", data: Record<string, string | number | boolean>): Promise<void> {
  if (!adalahPeran(peran) || (peristiwa !== "recommendation_viewed" && peristiwa !== "recommendation_clicked")) return;
  await rpc("temukan_peristiwa", { p_token: await kunciSesi(), p_peran: peran, p_peristiwa: peristiwa, p_data: data ?? {} });
}

/** Penilaian pengguna atas satu rekomendasi: sesuai atau kurang sesuai, dengan alasan dari daftar. Tanpa teks bebas. */
export async function kirimUmpan(masukan: { peran: string; lahanId: string; segmen: string | null; nilai: "sesuai" | "kurang"; alasan: string | null; potret: Potret & { urut?: number } }): Promise<HasilTindak> {
  if (!masukan || !adalahPeran(masukan.peran)) return { ok: false, pesan: "Penilaian tidak dikenal." };
  const hasil = await rpc<{ ok: boolean; pesan?: string }>("temukan_umpan", {
    p_token: await kunciSesi(),
    p_peran: masukan.peran,
    p_lahan_id: teksPendek(masukan.lahanId, 80),
    p_segmen: masukan.segmen ? teksPendek(masukan.segmen, 60) : null,
    p_nilai: masukan.nilai,
    p_alasan: masukan.alasan,
    p_potret: masukan.potret ?? null,
  });
  if (hasil.galat || !hasil.data) return GAGAL;
  return { ok: hasil.data.ok, pesan: hasil.data.pesan ?? "" };
}
